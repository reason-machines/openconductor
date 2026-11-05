// parity:diff.turn-changes:command
//! `#[tauri::command]` for per-turn changes ([`crate::turn_checkpoint`]).
//! Saving, restoring and counting checkpoints are in `checkpoint_commands.rs`.
//!
//! `checkpoint_turn_changes(repo, sessionId, turnId)` → the files one chat
//! turn changed (its start versus end checkpoint), with line counts.

use std::path::PathBuf;

use crate::diff::FileChange;
use crate::turn_checkpoint;

#[tauri::command]
pub async fn checkpoint_turn_changes(
    repo: String,
    session_id: String,
    turn_id: String,
) -> Result<Vec<FileChange>, String> {
    let repo = PathBuf::from(repo);
    if !repo.is_dir() {
        return Err(format!("worktree not found: {}", repo.display()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        turn_checkpoint::turn_changes(&repo, &session_id, &turn_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("checkpoint task failed: {e}"))?
}
