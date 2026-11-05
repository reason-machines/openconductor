//! Read back a workspace's Spotlight, run-script or terminal output, the way
//! the reference app answers its agents' `GetTerminalOutput` tool
//! (`mcp__conductor__GetTerminalOutput`).
//!
//! Evidence (read on sven m5 max, 2026-11-05, see
//! `evidence/spotlight/NOTES.md`): the sidecar's tool schema and result text
//! in `conductor-runtime`, and the frontend resolver `LRt` / `FRt` in
//! `index-BGEQ8YjU.js`.
//!
//! * `source` is `spotlight`, `run_script`, `terminal` or `auto` (default),
//!   `maxLines` defaults to [`DEFAULT_MAX_LINES`]; output is the last
//!   `maxLines` lines.
//! * `spotlight` and `run_script` need that kind of process to be the
//!   workspace's live one, else an error.
//! * `auto` takes the live process, then the last run's log, then a
//!   terminal, else nothing.
//!
//! This module only decides; `terminal_output_commands` gathers the inputs.

use std::time::SystemTime;

use serde::{Deserialize, Serialize};

use crate::terminal::screen::ScreenState;

/// The reference's default `maxLines`.
pub const DEFAULT_MAX_LINES: usize = 1_000;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    Spotlight,
    RunScript,
    Terminal,
    #[default]
    Auto,
}

/// Where the returned output came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Origin {
    Spotlight,
    RunScript,
    Terminal,
    None,
}

/// A Spotlight session's or run script's output as last seen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Process {
    /// Plain text (escape sequences already rendered away).
    pub text: String,
    /// The process exists (starting, running or stopping).
    pub live: bool,
    /// It is running (reported as `isRunning`).
    pub running: bool,
    pub started_at: SystemTime,
}

/// A terminal's screen text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Captured {
    pub text: String,
    pub running: bool,
}

/// The reference's `getTerminalOutputResponse` shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    pub output: String,
    pub source: Origin,
    pub is_running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl TerminalOutput {
    fn none(error: Option<&str>) -> Self {
        Self {
            output: String::new(),
            source: Origin::None,
            is_running: false,
            error: error.map(str::to_owned),
        }
    }

    fn from(source: Origin, text: &str, running: bool, max_lines: usize) -> Self {
        Self {
            output: tail(text, max_lines),
            source,
            is_running: running,
            error: None,
        }
    }
}

/// The last `max_lines` lines of `text` (the reference's `bm`).
pub fn tail(text: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = text.split('\n').collect();
    if lines.len() <= max_lines {
        return text.to_string();
    }
    lines[lines.len() - max_lines..].join("\n")
}

/// Width run-script output is laid out at before it is read back as lines.
const RENDER_COLS: u16 = 200;

/// The last `max_lines` lines of a run script's raw output as a terminal
/// shows it (the reference reads its rendered run-script screen). Run
/// scripts write through pipes, so a bare newline also returns the cursor.
pub fn render(raw: &str, max_lines: usize) -> String {
    let mut screen = ScreenState::new(RENDER_COLS, 24, max_lines);
    screen.write(raw.replace("\r\n", "\n").replace('\n', "\r\n").as_bytes());
    screen.text(max_lines)
}

/// Which terminal to read (the reference's `FRt`): the preferred one when
/// it belongs to the workspace, else the panel's active one, else the first.
pub fn pick_terminal(
    panel_ids: &[String],
    tab_ids: &[String],
    active: Option<&str>,
    preferred: Option<&str>,
) -> Option<String> {
    let all: Vec<&String> = panel_ids.iter().chain(tab_ids).collect();
    if let Some(p) = preferred.filter(|p| all.iter().any(|id| id == p)) {
        return Some(p.to_string());
    }
    if let Some(a) = active.filter(|a| panel_ids.iter().any(|id| id == a)) {
        return Some(a.to_string());
    }
    all.first().map(|id| id.to_string())
}

/// Answer one request. Only one of Spotlight and a run script is live in a
/// workspace at a time; if both look live, the newer start wins, like the
/// reference's newest process. `terminal` is read only when needed.
pub fn resolve(
    source: Source,
    max_lines: Option<usize>,
    spotlight: Option<&Process>,
    run_script: Option<&Process>,
    terminal: impl FnOnce() -> Option<Captured>,
) -> TerminalOutput {
    let max_lines = max_lines.unwrap_or(DEFAULT_MAX_LINES);
    let newest = |live_only: bool| {
        [
            (Origin::Spotlight, spotlight),
            (Origin::RunScript, run_script),
        ]
        .into_iter()
        .filter_map(|(origin, p)| p.filter(|p| p.live || !live_only).map(|p| (origin, p)))
        .max_by_key(|(_, p)| p.started_at)
    };
    let live = newest(true);
    let from_terminal =
        |c: Captured| TerminalOutput::from(Origin::Terminal, &c.text, c.running, max_lines);
    match source {
        Source::Spotlight | Source::RunScript => {
            let (want, error) = if source == Source::Spotlight {
                (Origin::Spotlight, "No spotlight process active")
            } else {
                (Origin::RunScript, "No run script process active")
            };
            match live {
                Some((origin, p)) if origin == want => {
                    TerminalOutput::from(origin, &p.text, p.running, max_lines)
                }
                _ => TerminalOutput::none(Some(error)),
            }
        }
        Source::Terminal => match terminal() {
            Some(c) => from_terminal(c),
            None => TerminalOutput::none(Some("No terminal found for this workspace")),
        },
        Source::Auto => {
            if let Some((origin, p)) = live {
                return TerminalOutput::from(origin, &p.text, p.running, max_lines);
            }
            if let Some((origin, p)) = newest(false) {
                return TerminalOutput::from(origin, &p.text, false, max_lines);
            }
            terminal().map_or_else(|| TerminalOutput::none(None), from_terminal)
        }
    }
}

/// The tool result text an agent sees (the reference sidecar's
/// `GetTerminalOutput` tool) and whether it is an error result.
pub fn tool_text(out: &TerminalOutput) -> (String, bool) {
    if let Some(e) = &out.error {
        return (format!("Error getting terminal output: {e}"), true);
    }
    let label = match out.source {
        Origin::Spotlight => "Spotlight",
        Origin::RunScript => "Run script",
        Origin::Terminal => "Terminal",
        Origin::None => {
            return (
                "No terminal output available. No active terminal, run script, or spotlight process found."
                    .into(),
                false,
            )
        }
    };
    let state = if out.is_running { "running" } else { "stopped" };
    let header = format!("[{label} - {state}]\n");
    let body = if out.output.is_empty() {
        "No output available yet."
    } else {
        &out.output
    };
    (header + body, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn at(secs: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(secs)
    }

    fn process(text: &str, live: bool, started: u64) -> Process {
        Process {
            text: text.into(),
            live,
            running: live,
            started_at: at(started),
        }
    }

    fn term() -> Option<Captured> {
        Some(Captured {
            text: "$ ls".into(),
            running: true,
        })
    }

    fn no_term() -> Option<Captured> {
        None
    }

    #[test]
    fn auto_prefers_the_live_spotlight_session() {
        let spot = process("Starting sync...", true, 2);
        let run = process("old run", false, 1);
        let out = resolve(Source::Auto, None, Some(&spot), Some(&run), || {
            panic!("terminal must not be read")
        });
        assert_eq!(
            out,
            TerminalOutput {
                output: "Starting sync...".into(),
                source: Origin::Spotlight,
                is_running: true,
                error: None,
            }
        );
        assert_eq!(
            tool_text(&out),
            ("[Spotlight - running]\nStarting sync...".into(), false)
        );
    }

    #[test]
    fn auto_falls_back_to_the_newest_log_then_a_terminal_then_nothing() {
        let spot = process("spot log", false, 5);
        let run = process("run log", false, 3);
        let out = resolve(Source::Auto, None, Some(&spot), Some(&run), no_term);
        assert_eq!((out.source, out.is_running), (Origin::Spotlight, false));
        assert_eq!(out.output, "spot log");
        let out = resolve(Source::Auto, None, None, Some(&run), term);
        assert_eq!(
            (out.source, out.output.as_str()),
            (Origin::RunScript, "run log")
        );

        let out = resolve(Source::Auto, None, None, None, term);
        assert_eq!(
            tool_text(&out),
            ("[Terminal - running]\n$ ls".into(), false)
        );

        let out = resolve(Source::Auto, None, None, None, no_term);
        assert_eq!(out, TerminalOutput::none(None));
        assert_eq!(
            tool_text(&out).0,
            "No terminal output available. No active terminal, run script, or spotlight process found."
        );
    }

    #[test]
    fn explicit_sources_need_that_process_to_be_live() {
        let stopped = process("spot log", false, 5);
        let out = resolve(Source::Spotlight, None, Some(&stopped), None, term);
        assert_eq!(out.error.as_deref(), Some("No spotlight process active"));
        assert_eq!(
            tool_text(&out),
            (
                "Error getting terminal output: No spotlight process active".into(),
                true
            )
        );

        let run = process("dev server", true, 1);
        let out = resolve(Source::Spotlight, None, None, Some(&run), term);
        assert_eq!(out.error.as_deref(), Some("No spotlight process active"));
        let out = resolve(Source::RunScript, None, None, Some(&run), term);
        assert_eq!(
            (out.source, out.output.as_str()),
            (Origin::RunScript, "dev server")
        );
        let out = resolve(Source::RunScript, None, None, None, term);
        assert_eq!(out.error.as_deref(), Some("No run script process active"));

        let out = resolve(Source::Terminal, None, Some(&run), None, no_term);
        assert_eq!(
            out.error.as_deref(),
            Some("No terminal found for this workspace")
        );
    }

    #[test]
    fn max_lines_keeps_the_last_lines_and_defaults_to_1000() {
        let long: String = (1..=1_200).map(|n| format!("{n}\n")).collect();
        let spot = process(&long, true, 1);
        let out = resolve(Source::Spotlight, None, Some(&spot), None, no_term);
        assert_eq!(out.output.split('\n').count(), DEFAULT_MAX_LINES);
        assert!(out.output.starts_with("202\n"));
        let out = resolve(Source::Spotlight, Some(2), Some(&spot), None, no_term);
        assert_eq!(out.output, "1200\n");
        assert_eq!(tail("a\nb", 5), "a\nb");
    }

    #[test]
    fn empty_output_says_so() {
        let spot = process("", true, 1);
        let out = resolve(Source::Auto, None, Some(&spot), None, no_term);
        assert_eq!(
            tool_text(&out).0,
            "[Spotlight - running]\nNo output available yet."
        );
    }

    #[test]
    fn picks_the_preferred_then_active_then_first_terminal() {
        let panel = vec!["p1".to_string(), "p2".to_string()];
        let tabs = vec!["t1".to_string()];
        assert_eq!(
            pick_terminal(&panel, &tabs, Some("p2"), Some("t1")).as_deref(),
            Some("t1")
        );
        assert_eq!(
            pick_terminal(&panel, &tabs, Some("p2"), Some("gone")).as_deref(),
            Some("p2")
        );
        // The active id counts only when it is a panel terminal.
        assert_eq!(
            pick_terminal(&panel, &tabs, Some("t1"), None).as_deref(),
            Some("p1")
        );
        assert_eq!(pick_terminal(&[], &tabs, None, None).as_deref(), Some("t1"));
        assert_eq!(pick_terminal(&[], &[], Some("x"), Some("y")), None);
    }

    #[test]
    fn run_output_is_rendered_to_plain_lines() {
        let raw = "\u{1b}[32mready\u{1b}[0m on :3000\nbuild 50%\rbuild 100%\n";
        assert_eq!(render(raw, 10), "ready on :3000\nbuild 100%");
        assert_eq!(render("a\nb\nc\n", 2), "b\nc");
        assert_eq!(render("", 10), "");
    }

    #[test]
    fn serializes_like_the_reference_response() {
        let out = TerminalOutput::from(Origin::RunScript, "x", false, 10);
        assert_eq!(
            serde_json::to_string(&out).unwrap(),
            r#"{"output":"x","source":"run_script","isRunning":false}"#
        );
        let src: Source = serde_json::from_str(r#""run_script""#).unwrap();
        assert_eq!(src, Source::RunScript);
    }
}
