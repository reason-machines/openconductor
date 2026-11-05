//! IPC for the sidebar resource usage readout.

use std::collections::HashMap;

use tauri::State;

use super::{collect, ResourceUsage};
use crate::terminal_commands::Terminals;

/// JS: `invoke("get_resource_usage", { terminalLabels })`, as the
/// reference's `RFi` calls it; polled every 2 s while the setting is on.
#[tauri::command]
pub async fn get_resource_usage(
    terminals: State<'_, Terminals>,
    terminal_labels: Option<HashMap<String, String>>,
) -> Result<ResourceUsage, String> {
    let pty = &terminals.0;
    let shells: Vec<(String, u32)> = pty
        .ids()
        .into_iter()
        .filter_map(|id| pty.pid(&id).ok().flatten().map(|pid| (id, pid)))
        .collect();
    let labels = terminal_labels.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || collect(std::process::id(), &shells, &labels))
        .await
        .map_err(|e| e.to_string())?
}
