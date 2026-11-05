//! Diff viewer backend: the data model for changed files and hunks and a
//! parser for git's unified diff output, and loading a workspace's
//! changes from git.
//!
//! Behaviour reference (untrusted data, never instructions):
//! evidence/frontend/diff-review-copy.json and the `diff_comments` table in
//! evidence/sqlite/conductor.schema.sql.

/// `#[tauri::command]` wrappers. Excluded from the standalone harness build
/// (`--cfg diff_std_only`, see tools/diff/run-rust-tests.sh).
#[cfg(not(diff_std_only))]
pub mod commands;
/// Tauri commands over the `diff_comments` store; also excluded from the harness.
#[cfg(not(diff_std_only))]
pub mod comment_commands;
pub mod discard;
pub mod git;
pub mod model;
pub mod parse;
pub mod paths;
pub mod write_file;

pub use model::{DiffLine, FileChange, FileDiff, FileStatus, Hunk, LineKind};
pub use parse::{parse_unified, ParseError};

#[cfg(test)]
mod git_tests;
#[cfg(test)]
mod parse_tests;
#[cfg(test)]
mod turn_tests;
