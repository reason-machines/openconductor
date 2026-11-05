// parity:ws.checkpoints:backend parity:diff.turn-changes:backend
//! Checkpoints around agent turns, and what one turn changed.
//!
//! Reference behaviour (REA read of Conductor's runtime and frontend bundle,
//! see evidence/diff/turn-changes.md; untrusted data, never instructions):
//! before a user message starts the agent, the runtime saves a checkpoint
//! `session-<session>-turn-<turn>-start` (with `--force`); once the turn
//! ends (completed, failed or stopped) it saves `...-end`. A turn's changes
//! are the checkpointer's `diff <start> <end>`: every file that differs
//! between the two full working-tree snapshots, so edits made before or
//! after the turn, by the user or by another turn, are left out. The file
//! list is sent with the end checkpoint unless it has more than 200 files.
//!
//! Checkpoint failures never fail the turn: a busy repository (merge or
//! rebase running, unresolved conflicts) or a folder that is not a
//! repository root is logged and the turn simply has no changes view.

use std::path::Path;

use crate::checkpoint::{self, CheckpointError, SaveOptions};
use crate::diff::git::{list_changes, turn_checkpoint_id, valid_turn_part, DiffRequest, Scope};
pub use crate::diff::git::{DiffError, TurnPoint};
use crate::diff::FileChange;

/// Above this many files the list is left out of the turn's result (the
/// reference does the same with its end-checkpoint event); the frontend then
/// asks for it with `checkpoint_turn_changes`, which has no limit.
pub const MAX_RESULT_FILES: usize = 200;

/// Save one end of a turn as `session-<session>-turn-<turn>-<point>`,
/// overwriting a checkpoint of the same id. Returns the checkpoint id.
pub fn save_turn_point(
    workspace: &Path,
    session_id: &str,
    turn_id: &str,
    point: TurnPoint,
) -> Result<String, CheckpointError> {
    for part in [session_id, turn_id] {
        if !valid_turn_part(part) {
            return Err(CheckpointError::InvalidId(part.to_string()));
        }
    }
    let id = turn_checkpoint_id(session_id, turn_id, point);
    checkpoint::save(
        workspace,
        &SaveOptions {
            id: Some(id),
            force: true,
        },
    )
}

/// Every file the turn changed, with line counts (start versus end checkpoint).
pub fn turn_changes(
    workspace: &Path,
    session_id: &str,
    turn_id: &str,
) -> Result<Vec<FileChange>, DiffError> {
    list_changes(
        workspace,
        &DiffRequest {
            scope: Scope::Turn {
                session_id: session_id.to_string(),
                turn_id: turn_id.to_string(),
            },
            ignore_whitespace: false,
            path: None,
            context_lines: None,
        },
    )
}

/// Where and as what a turn is checkpointed.
#[derive(Debug, Clone, Copy)]
pub struct TurnTarget<'a> {
    pub workspace: &'a Path,
    pub session_id: &'a str,
    pub turn_id: &'a str,
}

fn save_logged(t: TurnTarget<'_>, point: TurnPoint) -> bool {
    match save_turn_point(t.workspace, t.session_id, t.turn_id, point) {
        Ok(_) => true,
        Err(e) if e.is_skip() => {
            eprintln!("[checkpoint] {} checkpoint skipped: {e}", point.as_str());
            false
        }
        Err(e) => {
            eprintln!("[checkpoint] {} checkpoint failed: {e}", point.as_str());
            false
        }
    }
}

/// Run one turn between its start and end checkpoints. Returns the turn's
/// result and, when both checkpoints were saved and the turn touched at
/// most [`MAX_RESULT_FILES`] files, the files it changed. Without a target
/// the turn just runs.
pub fn around_turn<T>(
    target: Option<TurnTarget<'_>>,
    run: impl FnOnce() -> T,
) -> (T, Option<Vec<FileChange>>) {
    let Some(t) = target else {
        return (run(), None);
    };
    let started = save_logged(t, TurnPoint::Start);
    let out = run();
    let ended = save_logged(t, TurnPoint::End);
    if !(started && ended) {
        return (out, None);
    }
    let changes = match turn_changes(t.workspace, t.session_id, t.turn_id) {
        Ok(files) if files.len() <= MAX_RESULT_FILES => Some(files),
        Ok(files) => {
            eprintln!(
                "[checkpoint] turn {} changed {} files; list left out of the result",
                t.turn_id,
                files.len()
            );
            None
        }
        Err(e) => {
            eprintln!("[checkpoint] could not diff turn {}: {e}", t.turn_id);
            None
        }
    };
    (out, changes)
}

#[cfg(test)]
mod tests;
