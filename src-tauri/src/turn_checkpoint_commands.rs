// parity:ws.checkpoints:command parity:diff.turn-changes:command
//! `#[tauri::command]`s over workspace checkpoints (`crate::checkpoint`) and
//! per-turn changes (`crate::turn_checkpoint`). `repo` is the workspace
//! worktree. Git work is blocking, so it runs off the async runtime.
//!
//! - `checkpoint_save(repo, id?, force?)` → the checkpoint id
//! - `checkpoint_get(repo, id)` → the checkpoint's metadata, or null
//! - `checkpoint_restore(repo, id)` → make the worktree match it
//! - `checkpoint_turn_changes(repo, sessionId, turnId)` → the files one
//!   chat turn changed (its start versus end checkpoint)

use std::path::PathBuf;

use serde::Serialize;

use crate::checkpoint::{self, Checkpoint, CheckpointError, SaveOptions};
use crate::diff::FileChange;
use crate::turn_checkpoint;

fn worktree(repo: String) -> Result<PathBuf, String> {
    let repo = PathBuf::from(repo);
    if repo.is_dir() {
        Ok(repo)
    } else {
        Err(format!("worktree not found: {}", repo.display()))
    }
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("checkpoint task failed: {e}"))?
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct CheckpointInfo {
    pub id: String,
    pub commit: String,
    /// HEAD when saved; null when the repository had no commits yet.
    pub head: Option<String>,
    pub index_tree: String,
    pub worktree_tree: String,
    pub created: String,
    pub worktree: Option<String>,
}

impl From<Checkpoint> for CheckpointInfo {
    fn from(c: Checkpoint) -> Self {
        Self {
            id: c.id,
            commit: c.commit,
            head: c.head,
            index_tree: c.index_tree,
            worktree_tree: c.worktree_tree,
            created: c.created,
            worktree: c.worktree.map(|p| p.display().to_string()),
        }
    }
}

#[tauri::command]
pub async fn checkpoint_save(
    repo: String,
    id: Option<String>,
    force: Option<bool>,
) -> Result<String, String> {
    let repo = worktree(repo)?;
    blocking(move || {
        checkpoint::save(
            &repo,
            &SaveOptions {
                id,
                force: force.unwrap_or(false),
            },
        )
        .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn checkpoint_get(repo: String, id: String) -> Result<Option<CheckpointInfo>, String> {
    let repo = worktree(repo)?;
    blocking(move || match checkpoint::get(&repo, &id) {
        Ok(c) => Ok(Some(c.into())),
        Err(CheckpointError::NotFound(_)) => Ok(None),
        Err(e) => Err(e.to_string()),
    })
    .await
}

#[tauri::command]
pub async fn checkpoint_restore(repo: String, id: String) -> Result<(), String> {
    let repo = worktree(repo)?;
    blocking(move || checkpoint::restore(&repo, &id).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn checkpoint_turn_changes(
    repo: String,
    session_id: String,
    turn_id: String,
) -> Result<Vec<FileChange>, String> {
    let repo = worktree(repo)?;
    blocking(move || {
        turn_checkpoint::turn_changes(&repo, &session_id, &turn_id).map_err(|e| e.to_string())
    })
    .await
}
