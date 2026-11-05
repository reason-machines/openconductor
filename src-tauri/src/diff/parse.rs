// parity:diff.file-render:backend
//! Parser for git's unified diff output (`git diff --no-color --no-ext-diff`
//! with the default `a/` and `b/` prefixes).

use super::model::{DiffLine, FileDiff, FileStatus, Hunk, LineKind};
use super::paths::{split_git_header, strip_side, unquote};
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    /// 1-based line number in the patch text.
    pub line: usize,
    pub message: String,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "patch line {}: {}", self.line, self.message)
    }
}

impl std::error::Error for ParseError {}

/// Parse a multi-file unified diff into one `FileDiff` per file.
pub fn parse_unified(patch: &str) -> Result<Vec<FileDiff>, ParseError> {
    let mut files: Vec<FileDiff> = Vec::new();
    // Remaining old/new lines of the hunk being read, if any.
    let mut remaining: Option<(u32, u32)> = None;
    let mut in_binary_patch = false;
    let mut old_mode: Option<String> = None;

    for (idx, raw) in patch.lines().enumerate() {
        let lineno = idx + 1;
        let err = |message: &str| ParseError {
            line: lineno,
            message: message.to_string(),
        };

        if let Some((old_left, new_left)) = remaining {
            if old_left > 0 || new_left > 0 || raw.starts_with('\\') {
                let file = files.last_mut().ok_or_else(|| err("hunk without file"))?;
                let hunk = file
                    .hunks
                    .last_mut()
                    .ok_or_else(|| err("line without hunk"))?;
                remaining =
                    Some(push_hunk_line(hunk, raw, old_left, new_left).map_err(|m| err(&m))?);
                continue;
            }
            remaining = None;
        }

        if let Some(rest) = raw.strip_prefix("diff --git ") {
            in_binary_patch = false;
            old_mode = None;
            let (old, new) = split_git_header(rest);
            let mut file = FileDiff::new(new.clone(), FileStatus::Modified);
            if old != new {
                file.old_path = Some(old);
            }
            files.push(file);
            continue;
        }
        if in_binary_patch {
            continue;
        }
        let Some(file) = files.last_mut() else {
            // Text before the first file header (for example a commit message).
            continue;
        };

        if raw.starts_with("@@") {
            let hunk = parse_hunk_header(raw).ok_or_else(|| err("malformed hunk header"))?;
            remaining = Some((hunk.old_lines, hunk.new_lines));
            file.hunks.push(hunk);
        } else if raw.starts_with("new file mode") {
            file.status = FileStatus::Added;
        } else if raw.starts_with("deleted file mode") {
            file.status = FileStatus::Deleted;
        } else if let Some(p) = raw.strip_prefix("rename from ") {
            file.status = FileStatus::Renamed;
            file.old_path = Some(unquote(p));
        } else if let Some(p) = raw.strip_prefix("rename to ") {
            file.status = FileStatus::Renamed;
            file.path = unquote(p);
        } else if let Some(p) = raw.strip_prefix("copy from ") {
            file.status = FileStatus::Copied;
            file.old_path = Some(unquote(p));
        } else if let Some(p) = raw.strip_prefix("copy to ") {
            file.status = FileStatus::Copied;
            file.path = unquote(p);
        } else if let Some(mode) = raw.strip_prefix("old mode ") {
            old_mode = Some(mode.to_string());
        } else if let Some(mode) = raw.strip_prefix("new mode ") {
            // The first three octal digits are the object type (file, link, gitlink).
            if old_mode.as_deref().and_then(|m| m.get(..3)) != mode.get(..3) {
                file.status = FileStatus::TypeChanged;
            }
        } else if raw.starts_with("Binary files ") || raw == "GIT binary patch" {
            file.binary = true;
            in_binary_patch = raw == "GIT binary patch";
        } else if let Some(p) = raw.strip_prefix("--- ") {
            if p != "/dev/null" {
                let old = strip_side(&unquote(p), "a/");
                if file.status != FileStatus::Deleted && old != file.path {
                    file.old_path = Some(old);
                }
            }
        } else if let Some(p) = raw.strip_prefix("+++ ") {
            if p != "/dev/null" {
                file.path = strip_side(&unquote(p), "b/");
            }
        }
        // "index", "similarity index" and other extended headers
        // carry nothing the viewer shows.
    }

    if let Some((old_left, new_left)) = remaining {
        if old_left > 0 || new_left > 0 {
            return Err(ParseError {
                line: patch.lines().count(),
                message: "patch ended inside a hunk".to_string(),
            });
        }
    }

    for file in &mut files {
        if file.old_path.as_deref() == Some("") || file.old_path.as_deref() == Some(&file.path) {
            file.old_path = None;
        }
        file.recount();
    }
    Ok(files)
}

fn push_hunk_line(
    hunk: &mut Hunk,
    raw: &str,
    old_left: u32,
    new_left: u32,
) -> Result<(u32, u32), String> {
    let old_next = hunk.old_start + hunk.old_lines - old_left;
    let new_next = hunk.new_start + hunk.new_lines - new_left;
    let (marker, text) = match raw.char_indices().nth(1) {
        Some((i, _)) => (&raw[..i], &raw[i..]),
        None => (raw, ""),
    };
    let (kind, old_line, new_line, left) = match marker {
        // An empty line inside a hunk is a context line whose space was stripped.
        " " | "" => (
            LineKind::Context,
            Some(old_next),
            Some(new_next),
            (sub(old_left)?, sub(new_left)?),
        ),
        "-" => (
            LineKind::Deletion,
            Some(old_next),
            None,
            (sub(old_left)?, new_left),
        ),
        "+" => (
            LineKind::Addition,
            None,
            Some(new_next),
            (old_left, sub(new_left)?),
        ),
        "\\" => {
            if let Some(last) = hunk.lines.last_mut() {
                last.no_newline_at_eof = true;
            }
            return Ok((old_left, new_left));
        }
        other => return Err(format!("unexpected hunk line marker {other:?}")),
    };
    hunk.lines.push(DiffLine {
        kind,
        old_line,
        new_line,
        text: text.to_string(),
        no_newline_at_eof: false,
    });
    Ok(left)
}

fn sub(n: u32) -> Result<u32, String> {
    n.checked_sub(1)
        .ok_or_else(|| "hunk has more lines than its header declares".to_string())
}

/// `@@ -12,7 +12,9 @@ fn main() {`; a missing count means 1.
fn parse_hunk_header(raw: &str) -> Option<Hunk> {
    let rest = raw.strip_prefix("@@ -")?;
    let (ranges, section) = rest.split_once(" @@")?;
    let (old, new) = ranges.split_once(" +")?;
    let range = |s: &str| -> Option<(u32, u32)> {
        match s.split_once(',') {
            Some((a, b)) => Some((a.parse().ok()?, b.parse().ok()?)),
            None => Some((s.parse().ok()?, 1)),
        }
    };
    let (old_start, old_lines) = range(old)?;
    let (new_start, new_lines) = range(new)?;
    Some(Hunk {
        old_start,
        old_lines,
        new_start,
        new_lines,
        section: section.trim().to_string(),
        lines: Vec::new(),
    })
}
