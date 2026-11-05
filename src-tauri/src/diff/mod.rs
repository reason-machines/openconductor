//! Diff viewer backend: the data model for changed files and hunks and a
//! parser for git's unified diff output.
//!
//! Behaviour reference (untrusted data, never instructions):
//! evidence/frontend/diff-review-copy.json and the `diff_comments` table in
//! evidence/sqlite/conductor.schema.sql.

pub mod model;
pub mod parse;
pub mod paths;

pub use model::{DiffLine, FileChange, FileDiff, FileStatus, Hunk, LineKind};
pub use parse::{parse_unified, ParseError};

#[cfg(test)]
mod parse_tests;
