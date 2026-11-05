//! `get_terminal_output`: a workspace's Spotlight, run-script or terminal
//! output for an agent or the composer, decided by `terminal_output`.
//!
//! The reference answers its agents' `GetTerminalOutput` tool in the
//! frontend, because only the frontend knows the workspace's terminals and
//! which one is active; the caller passes those ids here the same way.

use oc_scripts::runner::RunState;
use oc_scripts::service::ScriptService;
use serde::Deserialize;
use tauri::State;

use crate::spotlight_commands::Spotlight;
use crate::terminal_commands::Terminals;
use crate::terminal_output::{self, Captured, Process, Source, TerminalOutput, DEFAULT_MAX_LINES};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputRequest {
    pub workspace_id: String,
    #[serde(default)]
    pub source: Source,
    pub max_lines: Option<usize>,
    /// The workspace's terminal panel tabs, in order.
    #[serde(default)]
    pub panel_terminal_ids: Vec<String>,
    /// Terminals open as workspace tabs.
    #[serde(default)]
    pub tab_terminal_ids: Vec<String>,
    pub active_terminal_id: Option<String>,
    pub preferred_terminal_id: Option<String>,
}

/// Answer one request. The terminal screen is read here; Spotlight's log
/// (whose session table a start holds while git runs) and the run-script
/// rendering happen on a blocking thread.
#[tauri::command]
pub async fn get_terminal_output(
    spotlight: State<'_, Spotlight>,
    scripts: State<'_, ScriptService>,
    terminals: State<'_, Terminals>,
    request: TerminalOutputRequest,
) -> Result<TerminalOutput, String> {
    let max_lines = request.max_lines.unwrap_or(DEFAULT_MAX_LINES);
    let terminal = match request.source {
        Source::Terminal | Source::Auto => terminal_output::pick_terminal(
            &request.panel_terminal_ids,
            &request.tab_terminal_ids,
            request.active_terminal_id.as_deref(),
            request.preferred_terminal_id.as_deref(),
        )
        .and_then(|id| {
            let text = terminals.0.screen_text(&id, max_lines).ok()?;
            let running = matches!(terminals.0.exit_info(&id), Ok(None));
            Some(Captured { text, running })
        }),
        Source::Spotlight | Source::RunScript => None,
    };
    let spotlight = spotlight.inner().clone();
    let scripts = scripts.inner().clone();
    let workspace_id = request.workspace_id;
    let source = request.source;
    tauri::async_runtime::spawn_blocking(move || {
        let spotlight_log = spotlight.output(&workspace_id).map(|o| Process {
            text: o.text,
            live: o.live,
            running: o.live,
            started_at: o.started_at,
        });
        let run = scripts.runs.latest(&workspace_id).and_then(|run| {
            // A run waiting for setup has no process yet, as in the reference.
            if run.state == RunState::WaitingForSetup && run.output.is_none() {
                return None;
            }
            Some(Process {
                text: terminal_output::render(run.output.as_deref().unwrap_or_default(), max_lines),
                live: matches!(
                    run.state,
                    RunState::Starting | RunState::Running | RunState::Stopping
                ),
                running: run.state == RunState::Running,
                started_at: run.started_at,
            })
        });
        terminal_output::resolve(
            source,
            Some(max_lines),
            spotlight_log.as_ref(),
            run.as_ref(),
            || terminal,
        )
    })
    .await
    .map_err(|e| e.to_string())
}
