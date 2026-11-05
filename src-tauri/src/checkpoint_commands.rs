// parity:chat.revert-checkpoint:command parity:diff.turn-changes:command
//! `#[tauri::command]` wrappers over [`crate::checkpoint`] for chat turns.
//!
//! Conductor snapshots the workspace before and after every agent turn with
//! `checkpointer.sh save --id session-<session>-turn-<turn>-<start|end>
//! --force`, skipping (not failing) when a merge/rebase is running (exit 101)
//! or the index has conflicts (102). "Reset chat" restores the turn's `end`
//! checkpoint and its dialog counts the files that differ from it
//! (`checkpointer diff <end> current -- --name-only -z`). The frontend builds
//! the ids (`src/features/chat/checkpoints.ts`); these commands only run the
//! checkpoint operations. Git work is blocking, so it runs off the runtime.

use std::path::PathBuf;

use serde::Serialize;

use crate::checkpoint::{self, CheckpointError, SaveOptions};

fn workspace(path: String) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if path.is_dir() {
        Ok(path)
    } else {
        Err(format!("workspace not found: {}", path.display()))
    }
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("checkpoint task failed: {e}"))?
}

/// Result of [`checkpoint_save`]: `saved`, or skipped with the reason.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveOutcome {
    pub saved: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped: Option<String>,
}

fn save_outcome(result: Result<String, CheckpointError>) -> Result<SaveOutcome, String> {
    match result {
        Ok(_) => Ok(SaveOutcome {
            saved: true,
            skipped: None,
        }),
        Err(e) if e.is_skip() => Ok(SaveOutcome {
            saved: false,
            skipped: Some(e.to_string()),
        }),
        Err(e) => Err(e.to_string()),
    }
}

/// `invoke("checkpoint_save", { workspacePath, checkpointId })`: snapshot the
/// workspace, overwriting a checkpoint with the same id (`--force`).
#[tauri::command]
pub async fn checkpoint_save(
    workspace_path: String,
    checkpoint_id: String,
) -> Result<SaveOutcome, String> {
    let ws = workspace(workspace_path)?;
    blocking(move || {
        let opts = SaveOptions {
            id: Some(checkpoint_id),
            force: true,
        };
        save_outcome(checkpoint::save(&ws, &opts))
    })
    .await
}

/// `invoke("checkpoint_exists", { workspacePath, checkpointId })`.
#[tauri::command]
pub async fn checkpoint_exists(
    workspace_path: String,
    checkpoint_id: String,
) -> Result<bool, String> {
    let ws = workspace(workspace_path)?;
    blocking(move || match checkpoint::get(&ws, &checkpoint_id) {
        Ok(_) => Ok(true),
        Err(CheckpointError::NotFound(_)) => Ok(false),
        Err(e) => Err(e.to_string()),
    })
    .await
}

/// `invoke("checkpoint_restore", { workspacePath, checkpointId })`. The error
/// text is Conductor's, so the reset toast reads the same.
#[tauri::command]
pub async fn checkpoint_restore(
    workspace_path: String,
    checkpoint_id: String,
) -> Result<(), String> {
    let ws = workspace(workspace_path)?;
    blocking(move || {
        checkpoint::restore(&ws, &checkpoint_id).map_err(|e| {
            format!(
                "Failed to revert to checkpoint: {e}. No changes or conversation history have been reverted."
            )
        })
    })
    .await
}

/// `invoke("checkpoint_changed_count", { workspacePath, checkpointId })`:
/// how many files differ between the checkpoint and the workspace now.
#[tauri::command]
pub async fn checkpoint_changed_count(
    workspace_path: String,
    checkpoint_id: String,
) -> Result<usize, String> {
    let ws = workspace(workspace_path)?;
    blocking(move || {
        checkpoint::changed_since(&ws, &checkpoint_id)
            .map(|paths| paths.len())
            .map_err(|e| e.to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::checkpoint::BusyState;

    #[test]
    fn save_outcome_maps_skips_and_errors() {
        assert_eq!(
            save_outcome(Ok("x".into())).unwrap(),
            SaveOutcome {
                saved: true,
                skipped: None
            }
        );
        let busy = save_outcome(Err(CheckpointError::Busy(BusyState::Merge))).unwrap();
        assert!(!busy.saved);
        assert!(busy.skipped.unwrap().contains("merge"));
        let conflicts = save_outcome(Err(CheckpointError::UnresolvedConflicts)).unwrap();
        assert!(!conflicts.saved);
        assert!(save_outcome(Err(CheckpointError::InvalidId("a b".into()))).is_err());
    }

    #[test]
    fn save_outcome_json_shape() {
        let saved = serde_json::to_string(&SaveOutcome {
            saved: true,
            skipped: None,
        })
        .unwrap();
        assert_eq!(saved, r#"{"saved":true}"#);
        let skipped = serde_json::to_string(&SaveOutcome {
            saved: false,
            skipped: Some("why".into()),
        })
        .unwrap();
        assert_eq!(skipped, r#"{"saved":false,"skipped":"why"}"#);
    }
}
