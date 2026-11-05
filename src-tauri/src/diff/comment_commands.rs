// parity:diff.comments-inline:command parity:diff.comments-to-chat:command
//! `#[tauri::command]`s over the `diff_comments` store
//! (`openconductor_db::diff_comments`). Comments cross IPC in the shape of
//! the frontend's `DiffComment` (src/features/diff/comments.ts): snake_case
//! columns, flags as booleans, and a whole-file comment as `file_level: true`
//! with `line_number: 0` (stored as a NULL `line_number`).
//!
//! Excluded from the standalone harness build (`--cfg diff_std_only`, see
//! tools/diff/run-rust-tests.sh), which has no `tauri` or database crate.

use std::time::{SystemTime, UNIX_EPOCH};

use openconductor_db::diff_comments::{self as store, Location, NewDiffComment, State};
use serde::{Deserialize, Serialize};
use tauri::State as Managed;

use crate::db::Db;

/// A comment as the frontend sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommentDto {
    pub id: String,
    pub workspace_id: String,
    pub file_path: String,
    pub line_number: i64,
    pub end_line_number: Option<i64>,
    pub body: String,
    pub state: &'static str,
    pub location: &'static str,
    pub file_level: bool,
    pub created_at: i64,
    pub updated_at: Option<i64>,
    pub remote_url: Option<String>,
    pub author: Option<String>,
    pub author_avatar_url: Option<String>,
    pub thread_id: Option<String>,
    pub reply_to_comment_id: Option<String>,
    pub is_outdated: bool,
    pub is_resolved: bool,
    pub suggestion_base_code: Option<String>,
}

impl From<store::DiffComment> for CommentDto {
    fn from(c: store::DiffComment) -> Self {
        let file_level = c.is_file_level() || c.location == Some(Location::File);
        CommentDto {
            id: c.id,
            workspace_id: c.workspace_id.unwrap_or_default(),
            file_path: c.file_path.unwrap_or_default(),
            line_number: if file_level {
                0
            } else {
                c.line_number.unwrap_or(0)
            },
            end_line_number: if file_level { None } else { c.end_line_number },
            body: c.body.unwrap_or_default(),
            // Rows written by the reference app may leave these NULL.
            state: match c.state {
                Some(State::Sent) => "sent",
                _ => "pending",
            },
            location: match (file_level, c.location) {
                (true, _) => "file",
                (false, Some(Location::Base)) => "base",
                _ => "modified",
            },
            file_level,
            created_at: c.created_at,
            updated_at: c.updated_at,
            remote_url: c.remote_url,
            author: c.author,
            author_avatar_url: c.author_avatar_url,
            thread_id: c.thread_id,
            reply_to_comment_id: c.reply_to_comment_id,
            is_outdated: c.is_outdated,
            is_resolved: c.is_resolved,
            suggestion_base_code: c.suggestion_base_code,
        }
    }
}

/// A new comment from the frontend (`newLocalComment`'s output).
#[derive(Debug, Clone, Deserialize)]
pub struct NewCommentInput {
    pub id: String,
    pub workspace_id: String,
    pub file_path: String,
    pub line_number: i64,
    pub end_line_number: Option<i64>,
    pub body: String,
    pub location: String,
    #[serde(default)]
    pub file_level: bool,
    pub reply_to_comment_id: Option<String>,
}

impl NewCommentInput {
    fn into_store(self, now: i64) -> Result<NewDiffComment, String> {
        let location = match self.location.as_str() {
            "modified" => Location::Modified,
            "base" => Location::Base,
            "file" => Location::File,
            other => return Err(format!("unknown comment location: {other}")),
        };
        let file_level = self.file_level || location == Location::File;
        if self.body.trim().is_empty() {
            return Err("comment is empty".into());
        }
        Ok(NewDiffComment {
            id: self.id,
            workspace_id: self.workspace_id,
            file_path: self.file_path,
            line_number: (!file_level).then_some(self.line_number),
            end_line_number: if file_level {
                None
            } else {
                self.end_line_number
            },
            body: self.body,
            location: if file_level { Location::File } else { location },
            created_at: now,
            author: None,
            reply_to: self.reply_to_comment_id,
        })
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn err(e: openconductor_db::Error) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn diff_comments_list(
    db: Managed<'_, Db>,
    workspace_id: String,
) -> Result<Vec<CommentDto>, String> {
    let rows = store::list_for_workspace(&db.0, &workspace_id)
        .await
        .map_err(err)?;
    Ok(rows.into_iter().map(CommentDto::from).collect())
}

#[tauri::command]
pub async fn diff_comment_add(
    db: Managed<'_, Db>,
    comment: NewCommentInput,
) -> Result<CommentDto, String> {
    let new = comment.into_store(now_ms())?;
    store::insert(&db.0, &new)
        .await
        .map(CommentDto::from)
        .map_err(err)
}

#[tauri::command]
pub async fn diff_comment_edit(
    db: Managed<'_, Db>,
    id: String,
    body: String,
) -> Result<(), String> {
    if body.trim().is_empty() {
        return Err("comment is empty".into());
    }
    store::update_body(&db.0, &id, &body, now_ms())
        .await
        .map_err(err)
}

/// Deleting a thread's root deletes its replies too.
#[tauri::command]
pub async fn diff_comment_delete(db: Managed<'_, Db>, id: String) -> Result<u64, String> {
    store::delete(&db.0, &id).await.map_err(err)
}

/// Resolve or reopen a whole thread (`thread_id` is the root's id for local comments).
#[tauri::command]
pub async fn diff_comment_resolve(
    db: Managed<'_, Db>,
    thread_id: String,
    resolved: bool,
) -> Result<u64, String> {
    store::set_thread_resolved(&db.0, &thread_id, resolved, now_ms())
        .await
        .map_err(err)
}

/// Mark comments as added to the chat.
#[tauri::command]
pub async fn diff_comments_mark_sent(db: Managed<'_, Db>, ids: Vec<String>) -> Result<u64, String> {
    store::mark_sent(&db.0, &ids, now_ms()).await.map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(location: &str, line: i64, end: Option<i64>) -> NewCommentInput {
        NewCommentInput {
            id: "c1".into(),
            workspace_id: "w".into(),
            file_path: "src/a.rs".into(),
            line_number: line,
            end_line_number: end,
            body: " fix this ".into(),
            location: location.into(),
            file_level: false,
            reply_to_comment_id: None,
        }
    }

    async fn roundtrip(i: NewCommentInput) -> CommentDto {
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let row = store::insert(&pool, &i.into_store(42).unwrap())
            .await
            .unwrap();
        CommentDto::from(row)
    }

    #[tokio::test]
    async fn line_comment_roundtrips_in_the_frontend_shape() {
        let c = roundtrip(input("base", 7, Some(9))).await;
        assert_eq!(
            (c.line_number, c.end_line_number, c.location, c.state),
            (7, Some(9), "base", "pending")
        );
        assert_eq!(
            (c.file_level, c.body.as_str(), c.created_at),
            (false, "fix this", 42)
        );
        assert_eq!(c.thread_id.as_deref(), Some("c1"));
    }

    #[tokio::test]
    async fn file_comment_is_stored_without_a_line_and_read_back_as_file_level() {
        let c = roundtrip(input("file", 3, Some(5))).await;
        assert_eq!(
            (c.file_level, c.line_number, c.end_line_number, c.location),
            (true, 0, None, "file")
        );
    }

    #[test]
    fn rejects_unknown_locations_and_empty_bodies() {
        assert!(input("left", 1, None).into_store(0).is_err());
        let mut empty = input("modified", 1, None);
        empty.body = "  ".into();
        assert!(empty.into_store(0).is_err());
    }

    #[test]
    fn null_state_and_location_from_the_reference_read_as_pending_and_modified() {
        let row = store::DiffComment {
            id: "r".into(),
            workspace_id: Some("w".into()),
            file_path: Some("a".into()),
            line_number: Some(1),
            end_line_number: None,
            body: Some("b".into()),
            state: None,
            location: None,
            created_at: 1,
            updated_at: None,
            remote_url: None,
            author: None,
            author_avatar_url: None,
            thread_id: None,
            reply_to_comment_id: None,
            is_outdated: false,
            is_resolved: false,
            suggestion_base_code: None,
        };
        let c = CommentDto::from(row);
        assert_eq!(
            (c.state, c.location, c.file_level),
            ("pending", "modified", false)
        );
    }
}
