//! IPC for [`super::store`]. Conductor's frontend does this itself through
//! the fs plugin; here the backend is the only process that writes
//! `local-storage.metadata.json` (the terminal history store is the other
//! writer in the same process).
//!
//! Entry content crosses as JSON text in both directions, so the stored
//! bytes and sizes are exactly the frontend's `JSON.stringify` output.

use std::path::Path;

use serde::Deserialize;
use tauri::State;

use super::store::{EntryStorage, ListedEntry, LocalStorage, SetEntry, SetResult, SubsystemInfo};

/// Managed state: the store rooted at the app data folder.
pub struct LocalStorageState(pub LocalStorage);

pub fn state(app_data_dir: &Path) -> LocalStorageState {
    LocalStorageState(LocalStorage::new(app_data_dir))
}

/// Arguments of `local_storage_set_entry` (the reference's `setEntry`).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetEntryArgs {
    pub subsystem: String,
    pub size_limit: u64,
    pub id: String,
    /// `JSON.stringify(value)`.
    pub content: String,
    #[serde(default)]
    pub last_updated_at: Option<String>,
    #[serde(default)]
    pub entry_storage: Option<EntryStorage>,
    #[serde(default)]
    pub only_if_missing: bool,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// JS: `invoke("local_storage_get_entry", { subsystem, id })`: the entry's
/// JSON text, or `null` when the subsystem does not list it.
#[tauri::command]
pub async fn local_storage_get_entry(
    s: State<'_, LocalStorageState>,
    subsystem: String,
    id: String,
) -> Result<Option<String>, String> {
    s.0.get_entry(&subsystem, &id).map_err(err)
}

/// JS: `invoke("local_storage_list_entries", { subsystem })`:
/// `[{id, size, lastUpdatedAt, content}]` in index order, content as JSON text.
#[tauri::command]
pub async fn local_storage_list_entries(
    s: State<'_, LocalStorageState>,
    subsystem: String,
) -> Result<Vec<ListedEntry>, String> {
    s.0.list_entries(&subsystem).map_err(err)
}

/// JS: `invoke("local_storage_get_subsystem", { subsystem })`.
#[tauri::command]
pub async fn local_storage_get_subsystem(
    s: State<'_, LocalStorageState>,
    subsystem: String,
) -> Result<Option<SubsystemInfo>, String> {
    s.0.get_subsystem(&subsystem).map_err(err)
}

/// JS: `invoke("local_storage_list_subsystems")`.
#[tauri::command]
pub async fn local_storage_list_subsystems(s: State<'_, LocalStorageState>) -> Result<Vec<String>, String> {
    s.0.list_subsystems().map_err(err)
}

/// JS: `invoke("local_storage_set_entry", { args })`: `{success: true}` or
/// `{success: false, reason}`; I/O failures reject.
#[tauri::command]
pub async fn local_storage_set_entry(
    s: State<'_, LocalStorageState>,
    args: SetEntryArgs,
) -> Result<SetResult, String> {
    s.0.set_entry(SetEntry {
        subsystem: &args.subsystem,
        size_limit: args.size_limit,
        id: &args.id,
        content: &args.content,
        last_updated_at: args.last_updated_at,
        entry_storage: args.entry_storage,
        only_if_missing: args.only_if_missing,
    })
    .map_err(err)
}

/// JS: `invoke("local_storage_remove_entry", { subsystem, id })`.
#[tauri::command]
pub async fn local_storage_remove_entry(
    s: State<'_, LocalStorageState>,
    subsystem: String,
    id: String,
) -> Result<(), String> {
    s.0.remove_entry(&subsystem, &id).map_err(err)
}

/// JS: `invoke("local_storage_remove_subsystem", { subsystem })`.
#[tauri::command]
pub async fn local_storage_remove_subsystem(
    s: State<'_, LocalStorageState>,
    subsystem: String,
) -> Result<(), String> {
    s.0.remove_subsystem(&subsystem).map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_entry_args_take_the_frontend_shape() {
        let a: SetEntryArgs = serde_json::from_str(
            r#"{"subsystem":"turn-changes-cache","sizeLimit":5242880,"id":"[\"s\",\"t\"]","content":"[]","entryStorage":"subsystemStore"}"#,
        )
        .unwrap();
        assert_eq!(a.entry_storage, Some(EntryStorage::SubsystemStore));
        assert!(!a.only_if_missing);
        assert_eq!(a.last_updated_at, None);
    }
}
