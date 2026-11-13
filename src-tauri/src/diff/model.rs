// parity:diff.changes-list:data parity:diff.file-render:data
//! Diff data model shared by the changes list, the diff renderer and the
//! review comments. Serialized as snake_case JSON for the frontend.

use serde::{Deserialize, Serialize};

/// How a file changed between the two sides of a diff.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    /// File mode or type changed (for example a file became a symlink).
    TypeChanged,
    /// Not tracked by git yet; shown as an addition.
    Untracked,
}

/// Kind of one line inside a hunk.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LineKind {
    Context,
    Addition,
    Deletion,
}

/// One line of a hunk. `old_line` is set for context and deletions,
/// `new_line` for context and additions (1-based).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct DiffLine {
    pub kind: LineKind,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    /// Line content without the leading marker and without the newline.
    pub text: String,
    /// True when git reported "No newline at end of file" for this line.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub no_newline_at_eof: bool,
}

/// One `@@ -a,b +c,d @@ section` block.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct Hunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    /// Text after the closing `@@` (usually the enclosing function), trimmed.
    pub section: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileHideReason {
    FileTooLarge,
}

/// The full diff of one file.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct FileDiff {
    /// Path on the new side (the old path for deletions).
    pub path: String,
    /// Path on the old side when it differs (renames and copies).
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub binary: bool,
    pub additions: u32,
    pub deletions: u32,
    /// Worktree modification time in Unix milliseconds; absent for historical results.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_modified_time: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hide_reason: Option<FileHideReason>,
    pub hunks: Vec<Hunk>,
}

impl FileDiff {
    pub fn new(path: String, status: FileStatus) -> Self {
        Self {
            path,
            old_path: None,
            status,
            binary: false,
            additions: 0,
            deletions: 0,
            last_modified_time: None,
            hide_reason: None,
            hunks: Vec::new(),
        }
    }

    /// Recompute `additions` and `deletions` from the hunks.
    pub fn recount(&mut self) {
        let (mut add, mut del) = (0, 0);
        for line in self.hunks.iter().flat_map(|h| &h.lines) {
            match line.kind {
                LineKind::Addition => add += 1,
                LineKind::Deletion => del += 1,
                LineKind::Context => {}
            }
        }
        self.additions = add;
        self.deletions = del;
    }

    /// The changes-list entry for this file.
    pub fn summary(&self) -> FileChange {
        FileChange {
            path: self.path.clone(),
            old_path: self.old_path.clone(),
            status: self.status,
            binary: self.binary,
            additions: self.additions,
            deletions: self.deletions,
            last_modified_time: self.last_modified_time,
        }
    }
}

/// One row of the changes list: a file and its line counts, without hunks.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct FileChange {
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub binary: bool,
    pub additions: u32,
    pub deletions: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_modified_time: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(kind: LineKind, text: &str) -> DiffLine {
        DiffLine {
            kind,
            old_line: None,
            new_line: None,
            text: text.to_string(),
            no_newline_at_eof: false,
        }
    }

    #[test]
    fn recount_and_summary() {
        let mut f = FileDiff::new("a.rs".into(), FileStatus::Modified);
        f.hunks.push(Hunk {
            old_start: 1,
            old_lines: 2,
            new_start: 1,
            new_lines: 3,
            section: String::new(),
            lines: vec![
                line(LineKind::Context, "x"),
                line(LineKind::Deletion, "y"),
                line(LineKind::Addition, "z"),
                line(LineKind::Addition, "w"),
            ],
        });
        f.recount();
        let s = f.summary();
        assert_eq!((s.additions, s.deletions), (2, 1));
        assert_eq!(s.path, "a.rs");
    }

    #[test]
    fn modification_time_is_optional_and_survives_full_and_summary_roundtrip() {
        let legacy = serde_json::to_value(FileDiff::new("n".into(), FileStatus::Modified)).unwrap();
        assert!(legacy.get("last_modified_time").is_none());
        let decoded: FileDiff = serde_json::from_value(legacy.clone()).unwrap();
        assert!(serde_json::to_value(decoded.summary())
            .unwrap()
            .get("last_modified_time")
            .is_none());
        for time in [0, -1, 1_700_000_000_124_i64] {
            let mut json = legacy.clone();
            json["last_modified_time"] = serde_json::json!(time);
            let decoded: FileDiff = serde_json::from_value(json).unwrap();
            assert_eq!(
                serde_json::to_value(&decoded).unwrap()["last_modified_time"],
                time
            );
            assert_eq!(
                serde_json::to_value(decoded.summary()).unwrap()["last_modified_time"],
                time
            );
        }
    }

    #[test]
    fn serializes_snake_case_and_omits_false_eof_flag() {
        let s = FileDiff::new("n".into(), FileStatus::TypeChanged).summary();
        let json = serde_json::to_value(s).unwrap();
        assert_eq!(json["status"], "type_changed");
        let l = serde_json::to_value(line(LineKind::Deletion, "q")).unwrap();
        assert_eq!(l["kind"], "deletion");
        assert!(l.get("no_newline_at_eof").is_none());
    }
}
