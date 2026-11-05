//! Tauri commands over the plain `subsystemStore` local storage
//! ([`SubsystemStore`]), used for the terminal panel's tab list
//! (`terminal-panel-tabs-v1` in the `terminal` subsystem).
//!
//! The reference has no such commands: its frontend reads and writes these
//! files itself through the fs plugin. Here the backend already writes
//! `local-storage.metadata.json` for terminal history, so it is the only
//! writer of both. The commands take the reference's `getEntry` / `setEntry`
//! / `removeEntry` arguments, with `content` as the entry's JSON text
//! (`JSON.stringify` of the value), and `setEntry` answers with its
//! `{success}` / `{success: false, reason}` result.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::terminal::history_store::{StoreError, SubsystemStore};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryArgs {
    pub subsystem: String,
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetEntryArgs {
    pub subsystem: String,
    pub size_limit: u64,
    pub id: String,
    pub content: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct SetEntryResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<&'static str>,
}

pub type Store = Arc<SubsystemStore>;

pub fn state(data_dir: &std::path::Path) -> Store {
    Arc::new(SubsystemStore::new(data_dir))
}

/// The reference's failure reasons; anything else is an error.
fn set_result(r: Result<(), StoreError>) -> Result<SetEntryResult, String> {
    let reason = match r {
        Ok(()) => None,
        Err(StoreError::EntryTooLarge) => Some("entryTooLarge"),
        Err(StoreError::SubsystemFull) => Some("subsystemFull"),
        Err(StoreError::StorageMismatch) => Some("entryStorageMismatch"),
        Err(StoreError::NotJsonSerializable) => Some("notJsonSerializable"),
        Err(e) => return Err(e.to_string()),
    };
    Ok(SetEntryResult {
        success: reason.is_none(),
        reason,
    })
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// The entry's JSON text, or `null` when there is none.
#[tauri::command]
pub async fn local_storage_get_entry(
    store: State<'_, Store>,
    args: EntryArgs,
) -> Result<Option<String>, String> {
    let store = Arc::clone(&store);
    blocking(move || {
        store
            .get_entry(&args.subsystem, &args.id)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn local_storage_set_entry(
    store: State<'_, Store>,
    args: SetEntryArgs,
) -> Result<SetEntryResult, String> {
    let store = Arc::clone(&store);
    blocking(move || {
        set_result(store.set_entry(&args.subsystem, args.size_limit, &args.id, &args.content))
    })
    .await
}

#[tauri::command]
pub async fn local_storage_remove_entry(
    store: State<'_, Store>,
    args: EntryArgs,
) -> Result<(), String> {
    let store = Arc::clone(&store);
    blocking(move || {
        store
            .remove_entry(&args.subsystem, &args.id)
            .map_err(|e| e.to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_results_use_the_reference_reasons() {
        assert_eq!(
            serde_json::to_string(&set_result(Ok(())).unwrap()).unwrap(),
            r#"{"success":true}"#
        );
        for (e, reason) in [
            (StoreError::EntryTooLarge, "entryTooLarge"),
            (StoreError::SubsystemFull, "subsystemFull"),
            (StoreError::StorageMismatch, "entryStorageMismatch"),
            (StoreError::NotJsonSerializable, "notJsonSerializable"),
        ] {
            assert_eq!(
                serde_json::to_string(&set_result(Err(e)).unwrap()).unwrap(),
                format!(r#"{{"success":false,"reason":"{reason}"}}"#)
            );
        }
        assert!(set_result(Err(StoreError::MissingContent)).is_err());
    }

    #[test]
    fn args_take_the_reference_field_names() {
        let a: SetEntryArgs = serde_json::from_str(
            r#"{"subsystem":"terminal","sizeLimit":104857600,"id":"terminal-panel-tabs-v1","content":"\"x\""}"#,
        )
        .unwrap();
        assert_eq!(a.size_limit, 104_857_600);
        assert_eq!(a.content, "\"x\"");
        let g: EntryArgs = serde_json::from_str(r#"{"subsystem":"terminal","id":"t"}"#).unwrap();
        assert_eq!((g.subsystem.as_str(), g.id.as_str()), ("terminal", "t"));
    }
}
