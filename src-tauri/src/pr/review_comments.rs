// parity:diff.comments-github:command
//! A workspace PR's GitHub comments, fetched with `gh api graphql` and turned
//! into rows for the `diff_comments` store.
//!
//! Behavior follows the reference app as recovered from its shipped
//! frontend bundle (`evidence/diff/comments-github.md`):
//!
//! * Review threads are read 100 at a time with each thread's first 100
//!   comments; a thread with more comments is paged through on its own.
//!   PR-level ("general") comments are read separately.
//! * Each review comment becomes one row with a stable id,
//!   `github-<thread id>-<database id>`, sharing the thread's id as
//!   `thread_id`; a reply points at its parent's row id. A general comment
//!   is `github-general-<database id>`, a whole-PR row with no file.
//! * The anchor is the thread's start line (else its line) on the start
//!   side; an outdated thread has no line. Resolved and outdated come from
//!   the thread. For a comment on lines GitHub still has in its diff hunk,
//!   the original code is kept as `suggestion_base_code` so a
//!   ```` ```suggestion ```` block can be shown as a change.
//! * A failed review-thread read fails the sync; a failed general-comment
//!   read only skips that half (nothing of it is deleted).
//! * Resolving a remote thread runs the `resolveReviewThread` mutation and
//!   requires GitHub to confirm it. There is no unresolve and no reply
//!   posting.
//!
//! Kept free of `tauri` and the database crate so the PR harness
//! (`evidence/pr/run-tests.sh`) builds and tests it.

use std::collections::HashMap;

use serde::Deserialize;

use super::gh::{Gh, GhError, Runner, Var};

/// Page size for threads and comments, as the reference uses.
pub const PAGE: u64 = 100;

const COMMENT_FIELDS: &str = "id body diffHunk author { login avatarUrl } createdAt updatedAt url databaseId replyTo { id databaseId }";

fn threads_query() -> String {
    format!(
        "query($owner: String!, $repo: String!, $prNumber: Int!, $threadCursor: String) {{ \
         repository(owner: $owner, name: $repo) {{ pullRequest(number: $prNumber) {{ \
         reviewThreads(first: {PAGE}, after: $threadCursor) {{ nodes {{ \
         id isOutdated isResolved path line startLine originalLine originalStartLine startDiffSide diffSide \
         comments(first: {PAGE}) {{ nodes {{ {COMMENT_FIELDS} }} pageInfo {{ hasNextPage endCursor }} }} \
         }} pageInfo {{ hasNextPage endCursor }} }} }} }} }}"
    )
}

fn thread_comments_query() -> String {
    format!(
        "query($threadId: ID!, $commentCursor: String) {{ node(id: $threadId) {{ \
         ... on PullRequestReviewThread {{ comments(first: {PAGE}, after: $commentCursor) {{ \
         nodes {{ {COMMENT_FIELDS} }} pageInfo {{ hasNextPage endCursor }} }} }} }} }}"
    )
}

fn general_query() -> String {
    format!(
        "query($owner: String!, $repo: String!, $prNumber: Int!, $commentCursor: String) {{ \
         repository(owner: $owner, name: $repo) {{ pullRequest(number: $prNumber) {{ \
         comments(first: {PAGE}, after: $commentCursor) {{ nodes {{ \
         id body author {{ login avatarUrl }} createdAt updatedAt url databaseId }} \
         pageInfo {{ hasNextPage endCursor }} }} }} }} }}"
    )
}

const RESOLVE_MUTATION: &str = "mutation($threadId: ID!) { resolveReviewThread(input: {threadId: $threadId}) { thread { id isResolved } } }";

// ---- wire types -----------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum DiffSide {
    Left,
    Right,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    pub login: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplyTo {
    pub id: String,
    pub database_id: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewComment {
    pub id: String,
    pub body: String,
    #[serde(default)]
    pub diff_hunk: String,
    pub author: Option<Author>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub url: String,
    pub database_id: Option<u64>,
    #[serde(default)]
    pub reply_to: Option<ReplyTo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    #[serde(default)]
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection<T> {
    pub nodes: Vec<Option<T>>,
    #[serde(default)]
    pub page_info: Option<PageInfo>,
}

impl<T> Connection<T> {
    fn into_page(self) -> (Vec<T>, bool, Option<String>) {
        let (more, cursor) = self
            .page_info
            .map_or((false, None), |p| (p.has_next_page, p.end_cursor));
        (self.nodes.into_iter().flatten().collect(), more, cursor)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewThread {
    pub id: String,
    pub is_outdated: bool,
    pub is_resolved: bool,
    pub path: String,
    pub line: Option<i64>,
    pub start_line: Option<i64>,
    pub original_line: Option<i64>,
    pub original_start_line: Option<i64>,
    pub start_diff_side: Option<DiffSide>,
    pub diff_side: DiffSide,
    pub comments: Connection<ReviewComment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralComment {
    pub id: String,
    pub body: String,
    pub author: Option<Author>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub url: String,
    pub database_id: Option<u64>,
}

#[derive(Deserialize)]
struct Resp<D> {
    data: Option<D>,
    #[serde(default)]
    errors: Vec<GqlError>,
}

#[derive(Deserialize)]
struct GqlError {
    message: String,
}

#[derive(Deserialize)]
struct RepoData<P> {
    repository: Option<PrData<P>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrData<P> {
    pull_request: Option<P>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThreadsPr {
    review_threads: Connection<ReviewThread>,
}

#[derive(Deserialize)]
struct GeneralPr {
    comments: Connection<GeneralComment>,
}

#[derive(Deserialize)]
struct NodeData {
    node: Option<NodeComments>,
}

#[derive(Deserialize)]
struct NodeComments {
    comments: Option<Connection<ReviewComment>>,
}

fn parse<T: for<'de> Deserialize<'de>>(stdout: &str) -> Result<Resp<T>, GhError> {
    serde_json::from_str(stdout).map_err(|e| GhError::Parse(e.to_string()))
}

/// The PR checked out in a workspace: `gh pr view` for its branch.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct BranchPr {
    pub number: u64,
    /// `OPEN`, `CLOSED` or `MERGED`.
    pub state: String,
}

impl BranchPr {
    /// The reference syncs every PR it finds except a merged one.
    pub fn syncs(&self) -> bool {
        !self.state.eq_ignore_ascii_case("MERGED")
    }
}

// ---- fetching -------------------------------------------------------------

impl<R: Runner> Gh<R> {
    fn pr_vars(&self, number: u64, cursor_name: &str, cursor: Option<&str>) -> Vec<(String, Var)> {
        let mut vars = self.repo_vars().to_vec();
        vars.push(("prNumber".into(), Var::Int(number)));
        if let Some(c) = cursor {
            vars.push((cursor_name.into(), Var::Str(c.into())));
        }
        vars
    }

    /// The PR for the branch checked out at the working directory; `None`
    /// when the branch has none.
    pub fn branch_pr(&self) -> Result<Option<BranchPr>, GhError> {
        let args = ["pr", "view", "--json", "number,state"]
            .map(String::from)
            .to_vec();
        let out = self
            .runner
            .run(&self.gh_path, &args, self.cwd())
            .map_err(GhError::Io)?;
        if out.code != 0 {
            if out.stderr.contains("no pull requests found") {
                return Ok(None);
            }
            return Err(GhError::Failed {
                action: "Finding the workspace's PR",
                stderr: out.stderr,
            });
        }
        serde_json::from_str(&out.stdout)
            .map(Some)
            .map_err(|e| GhError::Parse(e.to_string()))
    }

    /// Every review thread with all of its comments. `None` when GitHub
    /// returns no pull request.
    pub fn review_threads(&self, number: u64) -> Result<Option<Vec<ReviewThread>>, GhError> {
        let query = threads_query();
        let mut threads = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let vars = self.pr_vars(number, "threadCursor", cursor.as_deref());
            let out = self.graphql("Fetching PR review comments", &query, &vars)?;
            let resp: Resp<RepoData<ThreadsPr>> = parse(&out)?;
            let Some(pr) = resp
                .data
                .and_then(|d| d.repository)
                .and_then(|r| r.pull_request)
            else {
                return Ok(None);
            };
            let (page, more, next) = pr.review_threads.into_page();
            for mut t in page {
                let (first, c_more, c_next) = std::mem::replace(
                    &mut t.comments,
                    Connection {
                        nodes: Vec::new(),
                        page_info: None,
                    },
                )
                .into_page();
                let mut comments = first;
                if c_more {
                    comments.extend(self.rest_of_thread(&t.id, c_next)?);
                }
                t.comments = Connection {
                    nodes: comments.into_iter().map(Some).collect(),
                    page_info: None,
                };
                threads.push(t);
            }
            if !more {
                return Ok(Some(threads));
            }
            cursor =
                Some(next.ok_or_else(|| {
                    GhError::Parse("review thread page is missing endCursor".into())
                })?);
        }
    }

    fn rest_of_thread(
        &self,
        thread_id: &str,
        mut cursor: Option<String>,
    ) -> Result<Vec<ReviewComment>, GhError> {
        let query = thread_comments_query();
        let mut out = Vec::new();
        loop {
            let after = cursor.ok_or_else(|| {
                GhError::Parse("review thread comment page is missing endCursor".into())
            })?;
            let vars = vec![
                ("threadId".to_string(), Var::Str(thread_id.into())),
                ("commentCursor".to_string(), Var::Str(after)),
            ];
            let stdout = self.graphql("Fetching PR review comments", &query, &vars)?;
            let resp: Resp<NodeData> = parse(&stdout)?;
            let conn = resp
                .data
                .and_then(|d| d.node)
                .and_then(|n| n.comments)
                .ok_or_else(|| GhError::Parse(format!("no comments for thread {thread_id}")))?;
            let (page, more, next) = conn.into_page();
            out.extend(page);
            if !more {
                return Ok(out);
            }
            cursor = next;
        }
    }

    /// PR-level comments. `None` when they could not be read; the reference
    /// treats that as "unavailable" rather than failing the sync.
    pub fn general_comments(&self, number: u64) -> Option<Vec<GeneralComment>> {
        let query = general_query();
        let mut all = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let vars = self.pr_vars(number, "commentCursor", cursor.as_deref());
            let out = self.graphql("Fetching PR comments", &query, &vars).ok()?;
            let resp: Resp<RepoData<GeneralPr>> = parse(&out).ok()?;
            let pr = resp.data?.repository?.pull_request?;
            let (page, more, next) = pr.comments.into_page();
            all.extend(page);
            if !more {
                return Some(all);
            }
            cursor = Some(next?);
        }
    }

    /// Resolve a review thread on GitHub; errors unless GitHub confirms it.
    pub fn resolve_thread(&self, thread_id: &str) -> Result<(), GhError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Data {
            resolve_review_thread: Option<Payload>,
        }
        #[derive(Deserialize)]
        struct Payload {
            thread: Option<Thread>,
        }
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Thread {
            is_resolved: bool,
        }
        let vars = [("threadId".to_string(), Var::Str(thread_id.into()))];
        let out = self.graphql("Resolving the comment on GitHub", RESOLVE_MUTATION, &vars)?;
        let resp: Resp<Data> = parse(&out)?;
        if let Some(e) = resp.errors.into_iter().next() {
            return Err(GhError::Failed {
                action: "Resolving the comment on GitHub",
                stderr: e.message,
            });
        }
        let resolved = resp
            .data
            .and_then(|d| d.resolve_review_thread)
            .and_then(|p| p.thread)
            .is_some_and(|t| t.is_resolved);
        if !resolved {
            return Err(GhError::Parse(
                "GitHub did not confirm the thread was resolved".into(),
            ));
        }
        Ok(())
    }
}

// ---- mapping to rows ------------------------------------------------------

/// Where a synced comment is anchored, in our store's terms.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Anchor {
    /// New side (`modified`).
    Modified,
    /// Old side. The reference stores `original`; our store calls it `base`.
    Base,
    /// The PR as a whole (general comments).
    File,
}

/// One `diff_comments` row built from GitHub.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncedComment {
    pub id: String,
    pub file_path: Option<String>,
    pub line_number: Option<i64>,
    pub end_line_number: Option<i64>,
    pub body: String,
    pub anchor: Anchor,
    /// Milliseconds since the Unix epoch.
    pub created_at: i64,
    pub updated_at: Option<i64>,
    pub remote_url: String,
    pub author: Option<String>,
    pub author_avatar_url: Option<String>,
    pub thread_id: Option<String>,
    pub reply_to_comment_id: Option<String>,
    pub is_outdated: bool,
    pub is_resolved: bool,
    pub suggestion_base_code: Option<String>,
}

/// What one sync read. A scope's id list is `None` when that half could
/// not be read, so its rows must not be deleted as missing.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SyncSet {
    pub comments: Vec<SyncedComment>,
    pub review_ids: Option<Vec<String>>,
    pub general_ids: Option<Vec<String>>,
}

fn review_row_id(thread_id: &str, node_id: &str, database_id: Option<u64>) -> String {
    match database_id {
        Some(n) => format!("github-{thread_id}-{n}"),
        None => format!("github-{node_id}"),
    }
}

/// Build the rows a sync writes from what GitHub returned.
pub fn sync_set(
    threads: Option<Vec<ReviewThread>>,
    general: Option<Vec<GeneralComment>>,
) -> SyncSet {
    let mut set = SyncSet::default();
    if let Some(threads) = threads {
        let mut ids = Vec::new();
        for t in threads {
            let line = t.start_line.or(t.line);
            let side = if t.start_line.is_some() {
                t.start_diff_side.unwrap_or(t.diff_side)
            } else {
                t.diff_side
            };
            let end = match (t.start_line, t.line) {
                (Some(s), Some(l)) if s != l => Some(l),
                _ => None,
            };
            let thread = &t;
            for c in thread.comments.nodes.iter().flatten() {
                let id = review_row_id(&t.id, &c.id, c.database_id);
                ids.push(id.clone());
                set.comments.push(SyncedComment {
                    id,
                    file_path: Some(t.path.clone()),
                    line_number: line,
                    end_line_number: end,
                    body: c.body.clone(),
                    anchor: if side == DiffSide::Left {
                        Anchor::Base
                    } else {
                        Anchor::Modified
                    },
                    created_at: iso_millis(c.created_at.as_deref()).unwrap_or(0),
                    updated_at: iso_millis(c.updated_at.as_deref()),
                    remote_url: c.url.clone(),
                    author: c.author.as_ref().map(|a| a.login.clone()),
                    author_avatar_url: c.author.as_ref().and_then(|a| a.avatar_url.clone()),
                    thread_id: Some(t.id.clone()),
                    reply_to_comment_id: c
                        .reply_to
                        .as_ref()
                        .map(|r| review_row_id(&t.id, &r.id, r.database_id)),
                    is_outdated: t.is_outdated,
                    is_resolved: t.is_resolved,
                    suggestion_base_code: suggestion_base_code(&c.diff_hunk, thread),
                });
            }
        }
        set.review_ids = Some(ids);
    }
    if let Some(general) = general {
        let mut ids = Vec::new();
        for g in general {
            let id = match g.database_id {
                Some(n) => format!("github-general-{n}"),
                None => format!("github-general-{}", g.id),
            };
            ids.push(id.clone());
            set.comments.push(SyncedComment {
                id,
                file_path: None,
                line_number: None,
                end_line_number: None,
                body: g.body,
                anchor: Anchor::File,
                created_at: iso_millis(g.created_at.as_deref()).unwrap_or(0),
                updated_at: iso_millis(g.updated_at.as_deref()),
                remote_url: g.url,
                author: g.author.as_ref().map(|a| a.login.clone()),
                author_avatar_url: g.author.and_then(|a| a.avatar_url),
                thread_id: None,
                reply_to_comment_id: None,
                is_outdated: false,
                is_resolved: false,
                suggestion_base_code: None,
            });
        }
        set.general_ids = Some(ids);
    }
    set
}

/// Lines of one side of a diff hunk by line number, without their +/-/space
/// prefix. Lines that exist only on the other side are skipped.
fn hunk_side(diff_hunk: &str, side: DiffSide) -> HashMap<i64, String> {
    let mut lines = diff_hunk.split('\n');
    let mut out = HashMap::new();
    let Some((old_start, new_start)) = lines.next().and_then(hunk_starts) else {
        return out;
    };
    let (mut n, other) = match side {
        DiffSide::Left => (old_start, '+'),
        DiffSide::Right => (new_start, '-'),
    };
    for l in lines {
        let mut chars = l.chars();
        let first = chars.next();
        if first == Some('\\') || first == Some(other) {
            continue;
        }
        out.insert(n, chars.as_str().to_string());
        n += 1;
    }
    out
}

/// `@@ -a[,b] +c[,d] @@` -> `(a, c)`.
fn hunk_starts(header: &str) -> Option<(i64, i64)> {
    let rest = header.strip_prefix("@@ -")?;
    let (old, rest) = rest.split_once(' ')?;
    let new = rest.strip_prefix('+')?.split(' ').next()?;
    let start = |s: &str| s.split(',').next()?.parse::<i64>().ok();
    Some((start(old)?, start(new)?))
}

/// The code a suggestion on this thread replaces: the thread's original
/// line range, read from the comment's diff hunk. `None` when the thread
/// has no original line or spans both sides; `Some("")` when the hunk does
/// not cover the whole range.
pub fn suggestion_base_code(diff_hunk: &str, t: &ReviewThread) -> Option<String> {
    let end = t.original_line?;
    if t.start_diff_side.is_some_and(|s| s != t.diff_side) {
        return None;
    }
    let start = t.original_start_line.unwrap_or(end);
    if start > end {
        return None;
    }
    let side = hunk_side(diff_hunk, t.diff_side);
    let mut out = Vec::new();
    for n in start..=end {
        match side.get(&n) {
            Some(l) => out.push(l.as_str()),
            None => return Some(String::new()),
        }
    }
    Some(out.join("\n"))
}

/// Milliseconds since the epoch for an RFC 3339 UTC timestamp as GitHub
/// sends them (`2024-05-01T12:34:56Z`, optionally with fractional seconds
/// or a numeric offset).
pub fn iso_millis(s: Option<&str>) -> Option<i64> {
    let s = s?;
    let (date, time) = s.split_once('T')?;
    let mut d = date.split('-');
    let (y, mo, da): (i64, i64, i64) = (
        d.next()?.parse().ok()?,
        d.next()?.parse().ok()?,
        d.next()?.parse().ok()?,
    );
    let (clock, offset_secs) = if let Some(c) = time.strip_suffix('Z') {
        (c, 0)
    } else {
        let at = time.rfind(['+', '-'])?;
        let (c, off) = time.split_at(at);
        let sign = if off.starts_with('-') { -1 } else { 1 };
        let (oh, om) = off[1..].split_once(':')?;
        (
            c,
            sign * (oh.parse::<i64>().ok()? * 3600 + om.parse::<i64>().ok()? * 60),
        )
    };
    let (hms, frac) = clock.split_once('.').unwrap_or((clock, ""));
    let mut t = hms.split(':');
    let (h, mi, se): (i64, i64, i64) = (
        t.next()?.parse().ok()?,
        t.next()?.parse().ok()?,
        t.next()?.parse().ok()?,
    );
    let millis: i64 = format!("{frac:0<3}").get(..3)?.parse().ok()?;
    // Days from civil (Howard Hinnant's algorithm).
    let y2 = if mo <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let doy = (153 * (mo + if mo > 2 { -3 } else { 9 }) + 2) / 5 + da - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(((days * 86_400 + h * 3600 + mi * 60 + se - offset_secs) * 1000) + millis)
}
