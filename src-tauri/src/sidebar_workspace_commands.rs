//! Sidebar row actions written to `conductor.db`: pin, unread and the manual
//! status override. Conductor does these as single-column updates on
//! `workspaces` (`UPDATE workspaces SET manual_status = ? WHERE local_id = ?`
//! in its frontend, REA-extracted, read as data); the setters live in
//! `openconductor_db::workspaces`.

use openconductor_db::{workspaces, SqlitePool};
use tauri::State;

use crate::db::Db;
use crate::diff::git::{list_changes, DiffRequest, Scope};
use crate::diff::model::FileChange;

/// Conductor's workspace status values (`uJn` order).
pub const STATUSES: [&str; 5] = ["backlog", "in-progress", "in-review", "done", "canceled"];

/// `None` clears the override; anything else must be one of [`STATUSES`].
pub fn parse_status(status: Option<&str>) -> Result<Option<&str>, String> {
    match status {
        None => Ok(None),
        Some(s) if STATUSES.contains(&s) => Ok(Some(s)),
        Some(s) => Err(format!("unknown workspace status: {s}")),
    }
}

/// `secs` since the Unix epoch as SQLite `datetime('now')` text, UTC:
/// `2026-11-05 12:00:00`, the format of the table's other timestamps.
pub fn sqlite_datetime(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02}",
        rem / 3_600,
        rem % 3_600 / 60,
        rem % 60
    )
}

pub async fn set_pinned(pool: &SqlitePool, workspace_id: &str, pinned: bool) -> Result<(), String> {
    let now = pinned.then(|| {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        sqlite_datetime(secs)
    });
    workspaces::set_pinned_at(pool, workspace_id, now.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// JS: `invoke("db_set_workspace_pinned", { workspaceId, pinned })`.
#[tauri::command]
pub async fn db_set_workspace_pinned(
    db: State<'_, Db>,
    workspace_id: String,
    pinned: bool,
) -> Result<(), String> {
    set_pinned(&db.0, &workspace_id, pinned).await
}

/// JS: `invoke("db_set_workspace_unread", { workspaceId, unread })`.
#[tauri::command]
pub async fn db_set_workspace_unread(
    db: State<'_, Db>,
    workspace_id: String,
    unread: bool,
) -> Result<(), String> {
    workspaces::set_unread(&db.0, &workspace_id, unread)
        .await
        .map_err(|e| e.to_string())
}

/// JS: `invoke("db_set_workspace_manual_status", { workspaceId, status })`.
#[tauri::command]
pub async fn db_set_workspace_manual_status(
    db: State<'_, Db>,
    workspace_id: String,
    status: Option<String>,
) -> Result<(), String> {
    let status = parse_status(status.as_deref())?;
    workspaces::set_manual_status(&db.0, &workspace_id, status)
        .await
        .map_err(|e| e.to_string())
}

/// The changed files behind a sidebar row's +/- counts: every file changed
/// since the merge base with `base` (committed and uncommitted), with counts
/// and no hunks. The row sums them, skipping lockfiles, as Conductor's `FPt`
/// does (src/state/sidebarDiffStat.ts).
pub fn workspace_changes(
    worktree: &std::path::Path,
    base: String,
) -> Result<Vec<FileChange>, String> {
    let req = DiffRequest {
        scope: Scope::All { base, remote: None },
        ignore_whitespace: false,
        path: None,
        context_lines: Some(0),
    };
    list_changes(worktree, &req).map_err(|e| e.to_string())
}

/// `invoke("sidebar_workspace_changes", { repo, base })`.
#[tauri::command]
pub async fn sidebar_workspace_changes(
    repo: String,
    base: String,
) -> Result<Vec<FileChange>, String> {
    let worktree = std::path::PathBuf::from(repo);
    if !worktree.is_dir() {
        return Err(format!("worktree not found: {}", worktree.display()));
    }
    tauri::async_runtime::spawn_blocking(move || workspace_changes(&worktree, base))
        .await
        .map_err(|e| format!("diff stat task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::{self as store, KnownRepo, KnownWorkspace};

    #[test]
    fn workspace_changes_cover_commits_and_the_working_tree() {
        use std::process::Command;
        let dir = std::env::temp_dir().join(format!("oc-sidebar-diffstat-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let git = |args: &[&str]| {
            let out = Command::new("git")
                .arg("-C")
                .arg(&dir)
                .args(args)
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "git {args:?}: {}",
                String::from_utf8_lossy(&out.stderr)
            );
        };
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.name", "t"]);
        git(&["config", "user.email", "t@example.invalid"]);
        git(&["config", "commit.gpgsign", "false"]);
        std::fs::write(dir.join("a.txt"), "1\n2\n3\n").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-q", "-m", "base"]);
        git(&["checkout", "-q", "-b", "feature"]);
        std::fs::write(dir.join("a.txt"), "1\nTWO\n3\n4\n").unwrap();
        std::fs::write(dir.join("Cargo.lock"), "x\ny\n").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-q", "-m", "work"]);
        std::fs::write(dir.join("new.txt"), "n\n").unwrap();

        let mut files = workspace_changes(&dir, "main".into()).unwrap();
        files.sort_by(|a, b| a.path.cmp(&b.path));
        let counts: Vec<(&str, u32, u32)> = files
            .iter()
            .map(|f| (f.path.as_str(), f.additions, f.deletions))
            .collect();
        assert_eq!(
            counts,
            vec![("Cargo.lock", 2, 0), ("a.txt", 2, 1), ("new.txt", 1, 0)]
        );
        assert!(workspace_changes(&dir, "no-such-branch".into()).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sqlite_datetime_matches_sqlite_text() {
        assert_eq!(sqlite_datetime(0), "1970-01-01 00:00:00");
        assert_eq!(sqlite_datetime(1_793_880_000), "2026-11-05 12:00:00");
        assert_eq!(sqlite_datetime(951_782_400), "2000-02-29 00:00:00");
    }

    #[test]
    fn status_values_are_conductors() {
        assert_eq!(parse_status(Some("in-review")), Ok(Some("in-review")));
        assert_eq!(parse_status(None), Ok(None));
        assert!(parse_status(Some("archived")).is_err());
    }

    #[tokio::test]
    async fn pin_unread_and_status_round_trip_through_the_list_rows() {
        let pool = openconductor_db::open_in_memory().await.unwrap();
        let repo = KnownRepo {
            id: "app".into(),
            name: "app".into(),
            root: "/src/app".into(),
            default_branch: "main".into(),
        };
        let ws = KnownWorkspace {
            id: "app/oslo".into(),
            repository_id: "app".into(),
            directory_name: "oslo".into(),
            branch: "oslo".into(),
            path: "/data/workspaces/app/oslo".into(),
            archived: false,
        };
        store::record_repository(&pool, &repo).await.unwrap();
        store::finish_workspace(&pool, &ws, Some("main"), None)
            .await
            .unwrap();

        set_pinned(&pool, "app/oslo", true).await.unwrap();
        workspaces::set_unread(&pool, "app/oslo", true)
            .await
            .unwrap();
        workspaces::set_manual_status(&pool, "app/oslo", parse_status(Some("done")).unwrap())
            .await
            .unwrap();
        let row = store::list_workspaces(&pool)
            .await
            .unwrap()
            .into_iter()
            .find(|w| w.id == "app/oslo")
            .unwrap();
        assert!(row.pinned_at.is_some());
        assert!(row.unread);
        assert_eq!(row.manual_status.as_deref(), Some("done"));

        set_pinned(&pool, "app/oslo", false).await.unwrap();
        workspaces::set_unread(&pool, "app/oslo", false)
            .await
            .unwrap();
        workspaces::set_manual_status(&pool, "app/oslo", None)
            .await
            .unwrap();
        let row = store::list_workspaces(&pool)
            .await
            .unwrap()
            .into_iter()
            .find(|w| w.id == "app/oslo")
            .unwrap();
        assert_eq!(
            (row.pinned_at, row.unread, row.manual_status),
            (None, false, None)
        );
    }
}
