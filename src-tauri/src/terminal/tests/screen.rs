use crate::terminal::screen::{ScreenSnapshot, ScreenState, TerminalModes};
use alacritty_terminal::grid::Dimensions;
use alacritty_terminal::index::{Column, Line};

fn screen(cols: u16, rows: u16, bytes: &str) -> ScreenState {
    let mut s = ScreenState::new(cols, rows, 100);
    s.write(bytes.as_bytes());
    s
}

/// Restores `snap` the way the reference's renderer does (rehydrate
/// sequences, then the ANSI) into a fresh screen of the same size.
fn restore(snap: &ScreenSnapshot, scrollback: usize) -> ScreenState {
    let mut s = ScreenState::new(snap.cols, snap.rows, scrollback);
    s.write(snap.rehydrate_sequences.as_bytes());
    s.write(snap.snapshot_ansi.as_bytes());
    s
}

/// Every cell (character, colours, attributes, wrap flags, combining
/// marks), the history length and the cursor survive a snapshot.
fn assert_round_trip(cols: u16, rows: u16, scrollback: usize, payload: &str) {
    let mut original = ScreenState::new(cols, rows, scrollback);
    original.write(payload.as_bytes());
    let snap = original.snapshot();
    let restored = restore(&snap, scrollback);
    let (a, b) = (original.grid(), restored.grid());
    assert_eq!(
        a.history_size(),
        b.history_size(),
        "history for {payload:?}"
    );
    assert_eq!(a.cursor.point, b.cursor.point, "cursor for {payload:?}");
    for line in -(a.history_size() as i32)..a.screen_lines() as i32 {
        for col in 0..a.columns() {
            let (x, y) = (&a[Line(line)][Column(col)], &b[Line(line)][Column(col)]);
            assert_eq!(
                x, y,
                "cell {line},{col} for {payload:?}\nsnapshot: {:?}",
                snap.snapshot_ansi
            );
        }
    }
    assert_eq!(original.modes(), restored.modes());
    assert_eq!(original.text(usize::MAX), restored.text(usize::MAX));
}

#[test]
fn text_is_trimmed_rows_without_trailing_empty_lines() {
    let s = screen(20, 6, "one   \r\n\r\nthree\r\n\r\n");
    assert_eq!(s.text(usize::MAX), "one\n\nthree");
    assert_eq!(s.text(2), "\nthree");
    assert_eq!(s.text(0), "");
}

#[test]
fn text_has_one_line_per_row_including_wrapped_rows_and_scrollback() {
    let s = screen(5, 3, "abcdefgh\r\nl2\r\nl3\r\nl4");
    // "abcdefgh" wrapped onto two rows; the first rows scrolled into history.
    assert_eq!(s.text(usize::MAX), "abcde\nfgh\nl2\nl3\nl4");
    assert_eq!(s.text(2), "l3\nl4");
}

#[test]
fn text_reads_wide_and_combining_characters() {
    let s = screen(10, 2, "日本 e\u{301}!");
    assert_eq!(s.text(1), "日本 e\u{301}!");
}

#[test]
fn modes_and_rehydrate_sequences_follow_the_terminal() {
    let mut s = screen(10, 3, "");
    assert_eq!(s.modes(), TerminalModes::default());
    assert_eq!(s.snapshot().rehydrate_sequences, "");

    s.write(b"\x1b[?2004h\x1b[?1049h");
    assert_eq!(
        s.modes(),
        TerminalModes {
            alternate_screen: true,
            bracketed_paste: true
        }
    );
    assert_eq!(s.snapshot().rehydrate_sequences, "\x1b[?1049h\x1b[?2004h");

    s.write(b"\x1b[?1049l");
    assert_eq!(s.snapshot().rehydrate_sequences, "\x1b[?2004h");
    s.write(b"\x1b[?2004l");
    assert_eq!(s.modes(), TerminalModes::default());
}

#[test]
fn cwd_comes_from_osc7_with_either_terminator_and_is_percent_decoded() {
    let mut s = screen(10, 3, "");
    assert_eq!(s.cwd(), None);
    s.write(b"\x1b]7;file://host.local/Users/me/My%20Repo\x07$ ");
    assert_eq!(s.cwd(), Some("/Users/me/My Repo"));
    s.write(b"\x1b]7;file:///tmp/%E6%97%A5\x1b\\");
    assert_eq!(s.cwd(), Some("/tmp/日"));
    // Malformed escapes keep the raw path, as decodeURIComponent's fallback does.
    s.write(b"\x1b]7;file://h/a%zz\x07");
    assert_eq!(s.cwd(), Some("/a%zz"));
    // Other OSCs and a file URI with no path change nothing.
    s.write(b"\x1b]0;title\x07\x1b]7;file://hostonly\x07");
    assert_eq!(s.cwd(), Some("/a%zz"));
    // The OSC itself never reaches the screen text.
    assert_eq!(s.text(10), "$");
}

#[test]
fn cwd_survives_an_osc7_split_across_writes() {
    let seq = b"out\x1b]7;file://h/split/here\x1b\\more";
    for cut in 0..seq.len() {
        let mut s = screen(40, 3, "");
        s.write(&seq[..cut]);
        s.write(&seq[cut..]);
        assert_eq!(s.cwd(), Some("/split/here"), "cut at {cut}");
    }
    let mut s = screen(40, 3, "");
    for b in seq {
        s.write(std::slice::from_ref(b));
    }
    assert_eq!(s.cwd(), Some("/split/here"));
}

#[test]
fn snapshot_serializes_with_the_reference_field_names() {
    let mut s = screen(4, 2, "\x1b]7;file://h/w\x07");
    s.write(b"\x1b[?2004h");
    let json = serde_json::to_value(s.snapshot()).unwrap();
    assert_eq!(
        json,
        serde_json::json!({
            "snapshotAnsi": "\x1b[1;1H",
            "rehydrateSequences": "\x1b[?2004h",
            "cwd": "/w",
            "cols": 4,
            "rows": 2,
            "modes": { "alternateScreen": false, "bracketedPaste": true }
        })
    );
}

#[test]
fn snapshot_round_trips_text_colours_and_attributes() {
    for payload in [
        "",
        "plain\r\nline two\r\n",
        "a\x1b[3;7H",
        "\x1b[31mred\x1b[0m \x1b[1;4;38;5;208mbold\x1b[0m \x1b[48;2;10;20;30mrgb bg   \x1b[0m end",
        "\x1b[92;104mbright\x1b[0m \x1b[38;5;3mindexed-low\x1b[0m",
        "\x1b[2;3mdim italic\x1b[0m \x1b[7minv\x1b[27m \x1b[8mhid\x1b[28m \x1b[9mstrike\x1b[0m",
        "\x1b[4:2mdouble\x1b[0m \x1b[4:3mcurl\x1b[0m \x1b[4:4mdot\x1b[0m \x1b[4:5mdash\x1b[0m",
        "\x1b[4;58;2;255;0;0mred underline\x1b[0m",
        "\x1b[44m    \x1b[0m\r\n\x1b[41m\x1b[K\x1b[0mx",
        "日本語 e\u{301} 👍 ok",
        "aaaaaaaaaabbbbbbbbbbcccc",
        "123456789日\r\nnext",
        "\x1b[?1049h\x1b[2J\x1b[Hvim-ish\x1b[5;3H\x1b[33mx\x1b[0m",
    ] {
        assert_round_trip(10, 6, 100, payload);
    }
}

#[test]
fn snapshot_round_trips_scrollback_and_its_limit() {
    let many: String = (0..50)
        .map(|i| format!("\x1b[3{}mline {i}\x1b[0m\r\n", i % 8))
        .collect();
    assert_round_trip(12, 5, 100, &many);
    assert_round_trip(12, 5, 20, &many);
    let mut s = ScreenState::new(12, 5, 20);
    s.write(many.as_bytes());
    assert_eq!(s.grid().history_size(), 20);
    // A wrapped line split across history and screen still joins up.
    let long = format!("{many}{}", "x".repeat(30));
    assert_round_trip(12, 5, 100, &long);
}

#[test]
fn resize_reflows_and_the_snapshot_reports_the_new_size() {
    let mut s = screen(10, 3, "abcdefghij12");
    assert_eq!(s.text(9), "abcdefghij\n12");
    s.resize(20, 4);
    assert_eq!(s.text(9), "abcdefghij12");
    let snap = s.snapshot();
    assert_eq!((snap.cols, snap.rows), (20, 4));
    s.resize(0, 0);
    assert_eq!((s.cols(), s.rows()), (1, 1));
}
