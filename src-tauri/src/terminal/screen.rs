//! Terminal screen state kept on the Rust side.
//!
//! The reference app links `alacritty_terminal` 0.26.0 next to
//! `portable-pty` and answers `pty_screen_snapshot` / `pty_screen_text`
//! from the backend, so it keeps its own grid of what the terminal shows
//! (see `evidence/terminal/NOTES.md`). [`ScreenState`] is that grid: it is
//! fed the same bytes the renderer gets and can be read back as
//!
//! * text: one line per row, trailing blanks trimmed, trailing empty rows
//!   dropped, the last `max_lines` kept (the reference's `getText`);
//! * a [`ScreenSnapshot`]: `snapshotAnsi` repaints the scrollback and the
//!   screen with their colours and attributes and puts the cursor back,
//!   and `rehydrateSequences` turns the alternate screen and bracketed
//!   paste back on. A renderer restores by writing `rehydrateSequences`
//!   and then `snapshotAnsi`, as the reference's `restoreSnapshot` does.
//!
//! The working directory comes from OSC 7 (`ESC ] 7 ; file://host/path`
//! ended by BEL or `ESC \`), percent-decoded, as the reference's
//! `trackCwdFromData` reads it; a sequence split across writes is still
//! seen.

use alacritty_terminal::event::VoidListener;
use alacritty_terminal::grid::{Dimensions, Grid};
use alacritty_terminal::index::{Column, Line};
use alacritty_terminal::term::cell::{Cell, Flags};
use alacritty_terminal::term::{Config, Term, TermMode};
use alacritty_terminal::vte::ansi::{Color, NamedColor, Processor};
use serde::{Deserialize, Serialize};
use std::fmt::Write as _;

/// Scrollback rows kept when no limit is given: the reference's client-side
/// screen state defaults `maxBufferedLines` to 2000.
pub const DEFAULT_SCROLLBACK_LINES: usize = 2000;

/// The reference's sequences for the two modes a snapshot carries.
pub const ALT_SCREEN_ON: &str = "\x1b[?1049h";
pub const BRACKETED_PASTE_ON: &str = "\x1b[?2004h";

const OSC7_PREFIX: &[u8] = b"\x1b]7;file://";
/// An unterminated OSC 7 longer than this is dropped instead of buffered.
const OSC7_MAX: usize = 4096;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalModes {
    pub alternate_screen: bool,
    pub bracketed_paste: bool,
}

/// What `pty_screen_snapshot` returns; field names are the reference's.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenSnapshot {
    pub snapshot_ansi: String,
    pub rehydrate_sequences: String,
    pub cwd: Option<String>,
    pub cols: u16,
    pub rows: u16,
    pub modes: TerminalModes,
}

#[derive(Clone, Copy)]
struct Size {
    cols: usize,
    rows: usize,
}

impl Dimensions for Size {
    fn total_lines(&self) -> usize {
        self.rows
    }
    fn screen_lines(&self) -> usize {
        self.rows
    }
    fn columns(&self) -> usize {
        self.cols
    }
}

pub struct ScreenState {
    term: Term<VoidListener>,
    parser: Processor,
    cwd: Option<String>,
    /// Bytes of an OSC 7 (or a prefix of one) that a write ended inside.
    osc_pending: Vec<u8>,
}

impl ScreenState {
    /// A blank screen of `cols` x `rows` (each at least 1) keeping up to
    /// `scrollback_lines` rows of history.
    pub fn new(cols: u16, rows: u16, scrollback_lines: usize) -> Self {
        let config = Config {
            scrolling_history: scrollback_lines,
            ..Config::default()
        };
        Self {
            term: Term::new(config, &size(cols, rows), VoidListener),
            parser: Processor::new(),
            cwd: None,
            osc_pending: Vec::new(),
        }
    }

    pub fn write(&mut self, bytes: &[u8]) {
        self.parser.advance(&mut self.term, bytes);
        self.track_cwd(bytes);
    }

    /// Resizes (each side at least 1); the grid reflows wrapped lines.
    pub fn resize(&mut self, cols: u16, rows: u16) {
        self.term.resize(size(cols, rows));
    }

    pub fn cols(&self) -> u16 {
        self.term.grid().columns() as u16
    }

    pub fn rows(&self) -> u16 {
        self.term.grid().screen_lines() as u16
    }

    pub fn cwd(&self) -> Option<&str> {
        self.cwd.as_deref()
    }

    pub fn modes(&self) -> TerminalModes {
        let mode = self.term.mode();
        TerminalModes {
            alternate_screen: mode.contains(TermMode::ALT_SCREEN),
            bracketed_paste: mode.contains(TermMode::BRACKETED_PASTE),
        }
    }

    /// The last `max_lines` non-empty-trailing rows of the active buffer
    /// (scrollback, then screen), each with trailing blanks trimmed.
    pub fn text(&self, max_lines: usize) -> String {
        let grid = self.term.grid();
        let mut lines: Vec<String> = all_lines(grid)
            .map(|line| row_text(grid, line).trim_end().to_owned())
            .collect();
        while lines.last().is_some_and(String::is_empty) {
            lines.pop();
        }
        let start = lines.len().saturating_sub(max_lines);
        lines[start..].join("\n")
    }

    pub fn snapshot(&self) -> ScreenSnapshot {
        let modes = self.modes();
        let mut rehydrate = String::new();
        if modes.alternate_screen {
            rehydrate.push_str(ALT_SCREEN_ON);
        }
        if modes.bracketed_paste {
            rehydrate.push_str(BRACKETED_PASTE_ON);
        }
        ScreenSnapshot {
            snapshot_ansi: serialize(self.term.grid()),
            rehydrate_sequences: rehydrate,
            cwd: self.cwd.clone(),
            cols: self.cols(),
            rows: self.rows(),
            modes,
        }
    }

    #[cfg(test)]
    pub(crate) fn grid(&self) -> &Grid<Cell> {
        self.term.grid()
    }

    fn track_cwd(&mut self, bytes: &[u8]) {
        let mut data = std::mem::take(&mut self.osc_pending);
        data.extend_from_slice(bytes);
        let mut from = 0;
        while let Some(start) = find(&data[from..], OSC7_PREFIX).map(|i| i + from) {
            let body = start + OSC7_PREFIX.len();
            match osc_end(&data[body..]) {
                Some((end, term_len)) => {
                    let uri = &data[body..body + end];
                    // The path starts at the first `/` after the host.
                    if let Some(slash) = uri.iter().position(|&b| b == b'/') {
                        self.cwd = Some(percent_decode(&uri[slash..]));
                    }
                    from = body + end + term_len;
                }
                None => {
                    if data.len() - start <= OSC7_MAX {
                        self.osc_pending = data[start..].to_vec();
                    }
                    return;
                }
            }
        }
        // Keep a tail that may be the start of the next OSC 7.
        let tail = &data[from..];
        for keep in (1..OSC7_PREFIX.len().min(tail.len() + 1)).rev() {
            if tail.ends_with(&OSC7_PREFIX[..keep]) {
                self.osc_pending = tail[tail.len() - keep..].to_vec();
                return;
            }
        }
    }
}

fn size(cols: u16, rows: u16) -> Size {
    Size {
        cols: usize::from(cols.max(1)),
        rows: usize::from(rows.max(1)),
    }
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// Offset and length of the first BEL or `ESC \` terminator.
fn osc_end(body: &[u8]) -> Option<(usize, usize)> {
    body.iter().enumerate().find_map(|(i, &b)| match b {
        0x07 => Some((i, 1)),
        0x1b if body.get(i + 1) == Some(&b'\\') => Some((i, 2)),
        _ => None,
    })
}

/// `decodeURIComponent`, falling back to the raw text when the escapes are
/// malformed or decode to invalid UTF-8 (as the reference does).
fn percent_decode(raw: &[u8]) -> String {
    let lossless = || String::from_utf8_lossy(raw).into_owned();
    let mut out = Vec::with_capacity(raw.len());
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'%' {
            let hex = raw
                .get(i + 1..i + 3)
                .and_then(|h| std::str::from_utf8(h).ok());
            match hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                Some(byte) => out.push(byte),
                None => return lossless(),
            }
            i += 3;
        } else {
            out.push(raw[i]);
            i += 1;
        }
    }
    String::from_utf8(out).unwrap_or_else(|_| lossless())
}

fn all_lines(grid: &Grid<Cell>) -> impl Iterator<Item = Line> {
    let top = -(grid.history_size() as i32);
    let bottom = grid.screen_lines() as i32;
    (top..bottom).map(Line)
}

fn is_spacer(cell: &Cell) -> bool {
    cell.flags
        .intersects(Flags::WIDE_CHAR_SPACER | Flags::LEADING_WIDE_CHAR_SPACER)
}

fn push_cell(out: &mut String, cell: &Cell) {
    out.push(cell.c);
    if let Some(zw) = cell.zerowidth() {
        out.extend(zw);
    }
}

fn row_text(grid: &Grid<Cell>, line: Line) -> String {
    let row = &grid[line];
    let mut out = String::new();
    for col in 0..grid.columns() {
        let cell = &row[Column(col)];
        if !is_spacer(cell) {
            push_cell(&mut out, cell);
        }
    }
    out
}

/// Attributes that change how a cell is drawn (SGR state).
const DRAWN: Flags = Flags::BOLD
    .union(Flags::DIM)
    .union(Flags::ITALIC)
    .union(Flags::ALL_UNDERLINES)
    .union(Flags::INVERSE)
    .union(Flags::HIDDEN)
    .union(Flags::STRIKEOUT);

#[derive(Clone, PartialEq)]
struct Pen {
    fg: Color,
    bg: Color,
    flags: Flags,
    underline: Option<Color>,
}

impl Pen {
    fn default_pen() -> Self {
        Self::of(&Cell::default())
    }

    fn of(cell: &Cell) -> Self {
        Self {
            fg: cell.fg,
            bg: cell.bg,
            flags: cell.flags & DRAWN,
            underline: cell.underline_color(),
        }
    }

    /// One SGR that resets and then sets everything this pen draws with.
    fn sgr(&self, out: &mut String) {
        out.push_str("\x1b[0");
        let attrs = [
            (Flags::BOLD, ";1"),
            (Flags::DIM, ";2"),
            (Flags::ITALIC, ";3"),
            (Flags::UNDERLINE, ";4"),
            (Flags::DOUBLE_UNDERLINE, ";4:2"),
            (Flags::UNDERCURL, ";4:3"),
            (Flags::DOTTED_UNDERLINE, ";4:4"),
            (Flags::DASHED_UNDERLINE, ";4:5"),
            (Flags::INVERSE, ";7"),
            (Flags::HIDDEN, ";8"),
            (Flags::STRIKEOUT, ";9"),
        ];
        for (flag, code) in attrs {
            if self.flags.contains(flag) {
                out.push_str(code);
            }
        }
        color_sgr(out, self.fg, 30, 90, 38);
        color_sgr(out, self.bg, 40, 100, 48);
        if let Some(color) = self.underline {
            color_sgr(out, color, 0, 0, 58);
        }
        out.push('m');
    }
}

/// `base`/`bright` are the SGR bases for the 16 named colours (0 when the
/// target has none, as for underline colour); `extended` is 38, 48 or 58.
fn color_sgr(out: &mut String, color: Color, base: u8, bright: u8, extended: u8) {
    let _ = match color {
        Color::Named(name) => {
            let n = name as usize;
            match n {
                0..=7 if base != 0 => write!(out, ";{}", base as usize + n),
                8..=15 if bright != 0 => write!(out, ";{}", bright as usize + n - 8),
                0..=15 => write!(out, ";{extended};5;{n}"),
                // Foreground / Background and render-time variants: default.
                _ => Ok(()),
            }
        }
        Color::Indexed(n) => write!(out, ";{extended};5;{n}"),
        Color::Spec(rgb) => write!(out, ";{extended};2;{};{};{}", rgb.r, rgb.g, rgb.b),
    };
}

fn is_default_blank(cell: &Cell) -> bool {
    cell.c == ' '
        && cell.zerowidth().is_none()
        && cell.bg == Color::Named(NamedColor::Background)
        && !cell
            .flags
            .intersects(Flags::INVERSE | Flags::ALL_UNDERLINES | Flags::STRIKEOUT)
}

/// Repaints `grid` (scrollback then screen) into a terminal of the same
/// size and puts the cursor back. A row that wrapped is written full width
/// with no line break, so the restoring terminal wraps it the same way.
fn serialize(grid: &Grid<Cell>) -> String {
    let cols = grid.columns();
    let history = grid.history_size();
    let cursor = grid.cursor.point;
    let lines: Vec<Line> = all_lines(grid).collect();
    // With history every screen row is written so rows land where they
    // were; without it the screen can stop at the last row in use.
    let emit = if history > 0 {
        lines.len()
    } else {
        let last_used = lines
            .iter()
            .rposition(|&line| (0..cols).any(|c| !is_default_blank(&grid[line][Column(c)])))
            .map_or(0, |i| i + 1);
        last_used.max(cursor.line.0 as usize + 1)
    };

    let default = Pen::default_pen();
    let mut pen = default.clone();
    let mut out = String::new();
    for (i, &line) in lines[..emit].iter().enumerate() {
        let row = &grid[line];
        let wrapped = row[Column(cols - 1)].flags.contains(Flags::WRAPLINE);
        let end = if wrapped {
            cols
        } else {
            (0..cols)
                .rposition(|c| !is_default_blank(&row[Column(c)]))
                .map_or(0, |c| c + 1)
        };
        for col in 0..end {
            let cell = &row[Column(col)];
            if is_spacer(cell) {
                continue;
            }
            let next = Pen::of(cell);
            if next != pen {
                next.sgr(&mut out);
                pen = next;
            }
            push_cell(&mut out, cell);
        }
        if i + 1 < emit && !wrapped {
            if pen != default {
                out.push_str("\x1b[0m");
                pen = default.clone();
            }
            out.push_str("\r\n");
        }
    }
    if pen != default {
        out.push_str("\x1b[0m");
    }
    let _ = write!(out, "\x1b[{};{}H", cursor.line.0 + 1, cursor.column.0 + 1);
    out
}
