//! Tauri commands for the terminal panel: thin wrappers over
//! [`PtyManager`]. Every terminal event is emitted to the webview on
//! [`wire::EVENT`] as a [`WireEvent`]; errors are the `Display` text.
//! Commands are `async` so a slow spawn or kill stays off the main thread.

use std::path::Path;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::agent::secret::SecretString;
use crate::db::Db;
use crate::terminal::history_store::KEY_SECRET_NAME;
use crate::terminal_history::{
    key_or_create, HistoryRecord, LoadHistoryArgs, PersistHistoryArgs, TerminalHistory,
    WorkspaceHistoryArgs,
};

use crate::terminal::{
    wire, CreateMirrorArgs, IdArgs, PtyEvent, PtyManager, ResizeMirrorArgs, ScreenSnapshot,
    ScreenTextArgs, ShellOutput, ShellRequest, ShellRunner, SpawnArgs, WireEvent, WriteMirrorArgs,
};

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

// Screens and mirrors take one `args` object, as the reference's webview
// sends them. `id` is a terminal or a mirror.

/// The last `maxLines` rows of a terminal's or mirror's screen.
#[tauri::command]
pub async fn pty_screen_text(
    state: State<'_, Terminals>,
    args: ScreenTextArgs,
) -> CmdResult<String> {
    state.0.screen_text(&args.id, args.max_lines()).map_err(err)
}

/// A snapshot a renderer restores by writing `rehydrateSequences`, then
/// `snapshotAnsi`.
#[tauri::command]
pub async fn pty_screen_snapshot(
    state: State<'_, Terminals>,
    args: IdArgs,
) -> CmdResult<ScreenSnapshot> {
    state.0.screen_snapshot(&args.id).map_err(err)
}

/// A screen with no program behind it (the reference's remote terminals).
#[tauri::command]
pub async fn pty_create_mirror(
    state: State<'_, Terminals>,
    args: CreateMirrorArgs,
) -> CmdResult<()> {
    let max = args.max_buffered_bytes();
    state
        .0
        .create_mirror(&args.id, args.cols, args.rows, max)
        .map_err(err)
}

/// Feed output text into a mirror, or into a terminal's screen only.
#[tauri::command]
pub async fn pty_write_mirror(state: State<'_, Terminals>, args: WriteMirrorArgs) -> CmdResult<()> {
    state
        .0
        .write_mirror(&args.id, args.data.as_bytes())
        .map_err(err)
}

#[tauri::command]
pub async fn pty_resize_mirror(
    state: State<'_, Terminals>,
    args: ResizeMirrorArgs,
) -> CmdResult<()> {
    state
        .0
        .resize_mirror(&args.id, args.cols, args.rows)
        .map_err(err)
}

#[tauri::command]
pub async fn pty_delete_mirror(state: State<'_, Terminals>, args: IdArgs) -> CmdResult<()> {
    state.0.delete_mirror(&args.id).map_err(err)
}

/// Managed state for terminal history in `data_dir`. Its key lives in the
/// app's secret store (the login Keychain on macOS) under the reference's
/// secret name, created on first use. Elsewhere that store is in memory, so
/// history saved there is unreadable after a restart.
pub fn history_state(data_dir: &Path) -> TerminalHistory {
    let secrets = crate::agent::keychain::default_store();
    TerminalHistory::new(
        data_dir,
        Box::new(move || {
            let stored = secrets.get(KEY_SECRET_NAME).map_err(err)?;
            key_or_create(stored.map(|s| s.expose().to_owned()), |b64| {
                secrets
                    .set(KEY_SECRET_NAME, &SecretString::new(b64))
                    .map_err(err)
            })
        }),
    )
}

/// Save a terminal's or mirror's screen under `sessionId` so a later launch
/// can restore it (encrypted entry plus a `terminal_sessions` row).
#[tauri::command]
pub async fn pty_persist_terminal_history(
    terminals: State<'_, Terminals>,
    history: State<'_, TerminalHistory>,
    db: State<'_, Db>,
    args: PersistHistoryArgs,
) -> CmdResult<()> {
    let screen = terminals.0.screen_snapshot(&args.id).map_err(err)?;
    history
        .persist(&db.0, HistoryRecord::new(args, screen))
        .await
}

/// The saved record for `sessionId`, or `null` when there is none.
#[tauri::command]
pub async fn pty_load_terminal_history(
    history: State<'_, TerminalHistory>,
    db: State<'_, Db>,
    args: LoadHistoryArgs,
) -> CmdResult<Option<HistoryRecord>> {
    history.load(&db.0, &args.session_id).await
}

/// Forget the saved session `sessionId` (a closed terminal tab). Ours: the
/// reference deletes the row and entry from its frontend.
#[tauri::command]
pub async fn pty_delete_terminal_history(
    history: State<'_, TerminalHistory>,
    db: State<'_, Db>,
    args: LoadHistoryArgs,
) -> CmdResult<()> {
    history.delete(&db.0, &args.session_id).await
}

/// Forget every saved session of `localWorkspaceId` (an archived workspace
/// or removed repository); returns how many. Ours, like the one above.
#[tauri::command]
pub async fn pty_delete_workspace_terminal_history(
    history: State<'_, TerminalHistory>,
    db: State<'_, Db>,
    args: WorkspaceHistoryArgs,
) -> CmdResult<usize> {
    history
        .delete_workspace(&db.0, &args.local_workspace_id)
        .await
}

/// Managed state: one-shot shell commands that can still be cancelled.
#[derive(Default)]
pub struct ShellCommands(pub Arc<ShellRunner>);

/// Run `request.command` with `/bin/sh -c` and return its output.
#[tauri::command]
pub async fn execute_shell_command(
    state: State<'_, ShellCommands>,
    request: ShellRequest,
) -> CmdResult<ShellOutput> {
    let runner = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || runner.run(&request))
        .await
        .map_err(err)?
        .map_err(err)
}

/// Like `execute_shell_command`; `cancel_shell_command` with `id` stops it.
#[tauri::command]
pub async fn execute_shell_command_cancellable(
    state: State<'_, ShellCommands>,
    id: String,
    request: ShellRequest,
) -> CmdResult<ShellOutput> {
    let runner = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || runner.run_cancellable(&id, &request))
        .await
        .map_err(err)?
        .map_err(err)
}

/// Stop a cancellable command; false when `id` is not running.
#[tauri::command]
pub async fn cancel_shell_command(state: State<'_, ShellCommands>, id: String) -> CmdResult<bool> {
    Ok(state.0.cancel(&id))
}
