// parity:diff.comments-inline:command parity:diff.comments-to-chat:command parity:diff.comments-github:command
//! `#[tauri::command]`s over the `diff_comments` store
//! (`openconductor_db::diff_comments`). Comments cross IPC in the shape of
//! the frontend's `DiffComment` (src/features/diff/comments.ts): snake_case
//! columns, flags as booleans, and a whole-file comment as `file_level: true`
//! with `line_number: 0` (stored as a NULL `line_number`).
//!
//! Excluded from the standalone harness build (`--cfg diff_std_only`, see
//! tools/diff/run-rust-tests.sh), which has no `tauri` or database crate.

use std::time::{SystemTime, UNIX_EPOCH};

use openconductor_db::diff_comments::{
    self as store, Location, NewDiffComment, RemoteDiffComment, RemoteScope, State,
};
use serde::{Deserialize, Serialize};
use tauri::async_runtime::spawn_blocking;
use tauri::State as Managed;

use crate::db::Db;
use crate::pr::api::gh_in;
use crate::pr::review_comments::{sync_set, Anchor, SyncSet, SyncedComment};

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
                (false, Some(Location::Original)) => "original",
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
        // `base` is what earlier builds of the frontend sent for the old side.
        let location = Location::parse(&self.location)
            .ok_or_else(|| format!("unknown comment location: {}", self.location))?;
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

/// What a GitHub comment sync did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GithubSyncReport {
    /// The workspace branch's PR; `None` when it has none.
    pub pr_number: Option<u64>,
    /// Why nothing was synced (no PR, merged PR, no GitHub access).
    pub skipped: Option<String>,
    pub review_comments: usize,
    /// `None` when general comments could not be read this time.
    pub general_comments: Option<usize>,
    /// Rows inserted, changed or deleted.
    pub changed: u64,
}

impl GithubSyncReport {
    fn skipped(pr_number: Option<u64>, why: impl Into<String>) -> Self {
        GithubSyncReport {
            pr_number,
            skipped: Some(why.into()),
            review_comments: 0,
            general_comments: None,
            changed: 0,
        }
    }
}

fn remote_row(c: SyncedComment) -> RemoteDiffComment {
    RemoteDiffComment {
        id: c.id,
        file_path: c.file_path,
        line_number: c.line_number,
        end_line_number: c.end_line_number,
        body: c.body,
        location: match c.anchor {
            Anchor::Modified => Location::Modified,
            Anchor::Base => Location::Original,
            Anchor::File => Location::File,
        },
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

/// Merge one sync's rows into the store: upsert everything read, then drop
/// GitHub rows that vanished, per half that was actually read.
async fn apply_sync(
    pool: &openconductor_db::SqlitePool,
    workspace_id: &str,
    pr_number: u64,
    set: SyncSet,
) -> Result<GithubSyncReport, openconductor_db::Error> {
    let review_comments = set.review_ids.as_ref().map_or(0, Vec::len);
    let general_comments = set.general_ids.as_ref().map(Vec::len);
    let rows: Vec<_> = set.comments.into_iter().map(remote_row).collect();
    let mut changed = store::upsert_remote(pool, workspace_id, &rows).await?;
    if let Some(ids) = &set.review_ids {
        changed +=
            store::delete_missing_remote(pool, workspace_id, RemoteScope::ReviewThreads, ids)
                .await?;
    }
    if let Some(ids) = &set.general_ids {
        changed +=
            store::delete_missing_remote(pool, workspace_id, RemoteScope::General, ids).await?;
    }
    Ok(GithubSyncReport {
        pr_number: Some(pr_number),
        skipped: None,
        review_comments,
        general_comments,
        changed,
    })
}

/// Sync the workspace PR's review threads and PR comments from GitHub into
/// `diff_comments`. A branch without a PR, a merged PR, or a checkout
/// `gh` cannot reach is reported as skipped, not as an error.
#[tauri::command]
pub async fn diff_comments_sync_github(
    db: Managed<'_, Db>,
    workspace_id: String,
    workspace_path: String,
) -> Result<GithubSyncReport, String> {
    enum Fetched {
        Skip(GithubSyncReport),
        Got(u64, SyncSet),
    }
    let fetched = spawn_blocking(move || -> Result<Fetched, String> {
        let gh = gh_in(&workspace_path);
        let pr = match gh.branch_pr() {
            Ok(Some(pr)) => pr,
            Ok(None) => return Ok(Fetched::Skip(GithubSyncReport::skipped(None, "no PR"))),
            Err(e) => {
                return Ok(Fetched::Skip(GithubSyncReport::skipped(
                    None,
                    e.to_string(),
                )))
            }
        };
        if !pr.syncs() {
            return Ok(Fetched::Skip(GithubSyncReport::skipped(
                Some(pr.number),
                "PR is merged",
            )));
        }
        let threads = gh.review_threads(pr.number).map_err(|e| e.to_string())?;
        let general = gh.general_comments(pr.number);
        Ok(Fetched::Got(pr.number, sync_set(threads, general)))
    })
    .await
    .map_err(|e| e.to_string())??;
    match fetched {
        Fetched::Skip(report) => Ok(report),
        Fetched::Got(number, set) => apply_sync(&db.0, &workspace_id, number, set)
            .await
            .map_err(err),
    }
}

/// Resolve a GitHub review thread, then mark its rows resolved here.
#[tauri::command]
pub async fn diff_comment_resolve_github(
    db: Managed<'_, Db>,
    workspace_path: String,
    thread_id: String,
) -> Result<u64, String> {
    let id = thread_id.clone();
    spawn_blocking(move || gh_in(&workspace_path).resolve_thread(&id))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    store::set_thread_resolved(&db.0, &thread_id, true, now_ms())
        .await
        .map_err(err)
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
        let c = roundtrip(input("original", 7, Some(9))).await;
        assert_eq!(
            (c.line_number, c.end_line_number, c.location, c.state),
            (7, Some(9), "original", "pending")
        );
        // Earlier frontends sent the old side as `base`.
        assert_eq!(roundtrip(input("base", 7, None)).await.location, "original");
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

    #[tokio::test]
    async fn a_sync_merges_rows_and_only_deletes_halves_it_read() {
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let row = |id: &str, path: Option<&str>| SyncedComment {
            id: id.into(),
            file_path: path.map(Into::into),
            line_number: path.map(|_| 4),
            end_line_number: None,
            body: "nit".into(),
            anchor: if path.is_some() {
                Anchor::Base
            } else {
                Anchor::File
            },
            created_at: 5,
            updated_at: None,
            remote_url: "https://github.com/a/b/pull/1".into(),
            author: Some("octo".into()),
            author_avatar_url: None,
            thread_id: path.map(|_| "T".into()),
            reply_to_comment_id: None,
            is_outdated: false,
            is_resolved: true,
            suggestion_base_code: None,
        };
        let first = SyncSet {
            comments: vec![
                row("github-T-1", Some("a.rs")),
                row("github-general-2", None),
            ],
            review_ids: Some(vec!["github-T-1".into()]),
            general_ids: Some(vec!["github-general-2".into()]),
        };
        let r = apply_sync(&pool, "w", 1, first).await.unwrap();
        assert_eq!(
            (r.review_comments, r.general_comments, r.changed),
            (1, Some(1), 2)
        );

        let rows: Vec<CommentDto> = store::list_for_workspace(&pool, "w")
            .await
            .unwrap()
            .into_iter()
            .map(CommentDto::from)
            .collect();
        let review = rows.iter().find(|c| c.id == "github-T-1").unwrap();
        assert_eq!(
            (review.location, review.line_number, review.file_level),
            ("original", 4, false)
        );
        assert!(review.is_resolved);
        let general = rows.iter().find(|c| c.id == "github-general-2").unwrap();
        assert_eq!((general.file_path.as_str(), general.file_level), ("", true));

        // General comments unavailable this time: they stay; the vanished review comment goes.
        let second = SyncSet {
            comments: vec![],
            review_ids: Some(vec![]),
            general_ids: None,
        };
        let r = apply_sync(&pool, "w", 1, second).await.unwrap();
        assert_eq!((r.general_comments, r.changed), (None, 1));
        let left: Vec<_> = store::list_for_workspace(&pool, "w")
            .await
            .unwrap()
            .into_iter()
            .map(|c| c.id)
            .collect();
        assert_eq!(left, ["github-general-2"]);
    }
}
