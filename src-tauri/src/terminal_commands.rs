//! Tauri commands for the terminal panel: thin wrappers over
//! [`PtyManager`]. Every terminal event is emitted to the webview on
//! [`wire::EVENT`] as a [`WireEvent`]; errors are the `Display` text.
//! Commands are `async` so a slow spawn or kill stays off the main thread.

use tauri::{AppHandle, Emitter, State};

use crate::terminal::{wire, PtyEvent, PtyManager, SpawnArgs, WireEvent};

/// Managed state: the app's terminals.
pub struct Terminals(pub PtyManager);

impl Terminals {
    pub fn new(app: AppHandle) -> Self {
        Self(PtyManager::new(move |e: PtyEvent| {
            let _ = app.emit(wire::EVENT, WireEvent::from(e));
        }))
    }
}

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Start a terminal; returns its id. Ready/data/exit follow as events.
#[tauri::command]
pub async fn pty_spawn(state: State<'_, Terminals>, args: SpawnArgs) -> CmdResult<String> {
    state.0.spawn(args.into_request()).map_err(err)
}

/// Send input (keystrokes or pasted text) to a terminal.
#[tauri::command]
pub async fn pty_write(state: State<'_, Terminals>, id: String, data: String) -> CmdResult<()> {
    state.0.write(&id, data.as_bytes()).map_err(err)
}

#[tauri::command]
pub async fn pty_resize(
    state: State<'_, Terminals>,
    id: String,
    cols: u16,
    rows: u16,
) -> CmdResult<()> {
    state.0.resize(&id, cols, rows).map_err(err)
}

/// Stop a terminal's processes and forget it; its exit event still arrives.
#[tauri::command]
pub async fn pty_kill(state: State<'_, Terminals>, id: String) -> CmdResult<()> {
    state.0.kill(&id).map_err(err)
}

/// The renderer has drawn `bytes` more output bytes (flow control).
#[tauri::command]
pub async fn pty_ack_bytes(state: State<'_, Terminals>, id: String, bytes: usize) -> CmdResult<()> {
    state.0.ack_bytes(&id, bytes).map_err(err)
}

/// Kept output (base64) for a renderer that attaches late.
#[tauri::command]
pub async fn pty_read_history(state: State<'_, Terminals>, id: String) -> CmdResult<String> {
    state.0.history(&id).map(|h| wire::encode(&h)).map_err(err)
}

#[tauri::command]
pub async fn pty_clear_history(state: State<'_, Terminals>, id: String) -> CmdResult<()> {
    state.0.clear_history(&id).map_err(err)
}

/// Ids of the terminals that are still known (running or exited, not killed).
#[tauri::command]
pub async fn pty_list(state: State<'_, Terminals>) -> CmdResult<Vec<String>> {
    Ok(state.0.ids())
}
