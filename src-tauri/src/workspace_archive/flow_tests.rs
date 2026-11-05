//! The whole archive against a real `conductor.db` (in memory), the script
//! service and a repository with a worktree.

use std::collections::BTreeMap;
use std::fs;
use std::sync::Arc;

use openconductor_db::repos::{self, NewRepo};
use openconductor_db::workspaces::{self, NewWorkspace, WorkspaceState};

use super::super::tests::{g, write, Fixture};
use super::*;

struct Env {
    f: Fixture,
    pool: SqlitePool,
    scripts: ScriptService,
    manager: WorkspaceManager,
    in_flight: InFlightArchives,
}

/// The fixture's worktree as a `ready` row, with `settings` as the
/// repository's `.conductor/settings.local.toml`.
async fn env(tag: &str, settings: &str) -> Env {
    let f = Fixture::new(tag);
    write(f.repo(), ".conductor/settings.local.toml", settings);
    let pool = openconductor_db::open_in_memory().await.unwrap();
    repos::insert(
        &pool,
        &NewRepo {
            id: "repo".into(),
            name: "repo".into(),
            root_path: f.repo().display().to_string(),
            remote_url: None,
            remote: None,
            default_branch: Some("main".into()),
            hidden: false,
        },
    )
    .await
    .unwrap();
    workspaces::insert(
        &pool,
        &NewWorkspace {
            local_id: "repo/ws".into(),
            repository_id: "repo".into(),
            directory_name: "ws".into(),
            workspace_name: None,
            branch: "sven/ws".into(),
            placeholder_branch_name: None,
            state: WorkspaceState::Ready,
            initialization_parent_branch: Some("main".into()),
            intended_target_branch: None,
            workspace_path: Some(f.ws().display().to_string()),
        },
    )
    .await
    .unwrap();
    let scripts = ScriptService::new(
        f.tmp.0.join("home/.conductor"),
        f.tmp.0.join("logs"),
        Arc::new(|_| {}),
    )
    .with_base_env(BTreeMap::from([("PATH".into(), "/usr/bin:/bin".into())]));
    let manager = WorkspaceManager::new(f.tmp.0.join("data")).with_root(f.tmp.0.join("root"));
    Env {
        f,
        pool,
        scripts,
        manager,
        in_flight: InFlightArchives::default(),
    }
}

impl Env {
    async fn archive(
        &self,
        mode: Option<&str>,
        delete_branch: bool,
    ) -> Result<ArchiveResultDto, ArchiveFailureDto> {
        let setting = move |_: &Path, _: &Path| delete_branch;
        let deps = Deps {
            pool: &self.pool,
            scripts: &self.scripts,
            manager: &self.manager,
            delete_branch_on_archive: &setting,
            in_flight: &self.in_flight,
        };
        archive_workspace(&deps, "repo/ws", mode).await
    }
    async fn unarchive(&self) -> Result<UnarchiveResultDto, ArchiveFailureDto> {
        self.unarchive_with(false).await
    }
    async fn unarchive_with(
        &self,
        use_new_branch: bool,
    ) -> Result<UnarchiveResultDto, ArchiveFailureDto> {
        let setting = |_: &Path, _: &Path| false;
        let deps = Deps {
            pool: &self.pool,
            scripts: &self.scripts,
            manager: &self.manager,
            delete_branch_on_archive: &setting,
            in_flight: &self.in_flight,
        };
        unarchive_workspace(&deps, "repo/ws", use_new_branch).await
    }
    async fn row(&self) -> workspaces::Workspace {
        workspaces::get(&self.pool, "repo/ws")
            .await
            .unwrap()
            .unwrap()
            .workspace
    }
}

#[tokio::test]
async fn archive_runs_the_script_records_the_row_and_removes_the_worktree() {
    let log = "archive-script.log";
    // The script runs in the worktree, with the workspace's env, before removal.
    let e = env(
        "flow-full",
        &format!("[scripts]\narchive = \"pwd > ../{log}; ls a.txt >> ../{log}; echo $CONDUCTOR_WORKSPACE_NAME >> ../{log}\"\n"),
    )
    .await;
    let head = g(e.f.ws(), &["rev-parse", "HEAD"]);
    write(e.f.ws(), "wip.txt", "unsaved\n");

    let r = e.archive(None, true).await.unwrap();
    assert!(r.archived);
    assert_eq!(r.archive_commit.as_deref(), Some(head.as_str()));
    assert_eq!(r.branch.as_deref(), Some("sven/ws"));
    assert!(r.notices.is_empty(), "{:?}", r.notices);

    let script_log = fs::read_to_string(e.f.tmp.0.join("workspaces").join(log)).unwrap();
    assert_eq!(script_log, format!("{}\na.txt\nws\n", e.f.ws().display()));

    let row = e.row().await;
    assert_eq!(row.state, WorkspaceState::Archived);
    assert_eq!(row.archive_commit.as_deref(), Some(head.as_str()));
    assert_eq!(row.branch.as_deref(), Some("sven/ws"));

    assert!(!e.f.ws().exists());
    assert!(
        !e.f.branch_exists("sven/ws"),
        "delete_branch_on_archive is on"
    );
    assert_eq!(
        g(
            e.f.repo(),
            &[
                "show",
                "refs/conductor-checkpoints/conductor-archive-repo-ws:wip.txt"
            ]
        ),
        "unsaved"
    );
    let record = fs::read_to_string(e.f.tmp.0.join("root/archived/repo/ws.ws")).unwrap();
    assert_eq!(record, format!("branch=sven/ws\ncommit={head}\n"));

    // Archiving again is a no-op, as Conductor's early return for archived rows.
    let again = e.archive(None, true).await.unwrap();
    assert!(!again.archived);
    assert_eq!(again.archive_commit.as_deref(), Some(head.as_str()));
}

#[tokio::test]
async fn a_failing_archive_script_is_reported_and_the_archive_goes_on() {
    let e = env("flow-script", "[scripts]\narchive = \"exit 3\"\n").await;
    let r = e.archive(None, false).await.unwrap();
    assert!(r.archived);
    assert_eq!(r.notices.len(), 1);
    assert_eq!(
        (r.notices[0].kind, r.notices[0].message.as_str()),
        ("error", "Archive script failed (exit code 3)")
    );
    assert_eq!(e.row().await.state, WorkspaceState::Archived);
    assert!(!e.f.ws().exists());
    assert!(
        e.f.branch_exists("sven/ws"),
        "delete_branch_on_archive is off"
    );
}

#[tokio::test]
async fn a_git_operation_blocks_safe_mode_without_changing_anything() {
    let e = env("flow-merge", "").await;
    e.f.conflicting_merge();
    let err = e.archive(None, false).await.unwrap_err();
    assert_eq!(err.code, "WorkspaceArchiveBlockedByGitOperationError");
    assert_eq!(err.message, super::super::GIT_OPERATION_MESSAGE);
    assert_eq!(e.row().await.state, WorkspaceState::Ready);
    assert!(e.f.ws().exists());

    let r = e
        .archive(Some("discardGitOperationState"), false)
        .await
        .unwrap();
    assert!(r.archived);
    assert!(!e.f.ws().exists());
}

#[tokio::test]
async fn a_missing_directory_is_workspace_corrupted_and_unknown_ids_fail() {
    let e = env("flow-missing", "").await;
    fs::remove_dir_all(e.f.ws()).unwrap();
    let err = e.archive(None, false).await.unwrap_err();
    assert_eq!(
        (err.code, err.message.as_str()),
        ("WORKSPACE_CORRUPTED", "Workspace directory not found")
    );
    assert_eq!(e.row().await.state, WorkspaceState::Ready);

    let setting = |_: &Path, _: &Path| false;
    let deps = Deps {
        pool: &e.pool,
        scripts: &e.scripts,
        manager: &e.manager,
        delete_branch_on_archive: &setting,
        in_flight: &e.in_flight,
    };
    let err = archive_workspace(&deps, "repo/nope", None)
        .await
        .unwrap_err();
    assert_eq!(
        (err.code, err.message.as_str()),
        ("ArchiveFailed", "Workspace not found")
    );
    let err = archive_workspace(&deps, "repo/ws", Some("bogus"))
        .await
        .unwrap_err();
    assert_eq!(err.message, "unknown archive mode: bogus");
}

#[tokio::test]
async fn a_second_archive_while_one_runs_returns_at_once() {
    // The archive script holds the first archive open.
    let e = env("flow-dedupe", "[scripts]\narchive = \"sleep 1\"\n").await;
    let (first, second) = tokio::join!(e.archive(None, false), async {
        let pause = || std::thread::sleep(std::time::Duration::from_millis(200));
        tokio::task::spawn_blocking(pause).await.unwrap();
        e.archive(None, false).await
    });
    assert!(first.unwrap().archived);
    let second = second.unwrap();
    assert!(!second.archived);
    assert_eq!(second.archive_commit, None);
    assert_eq!(e.row().await.state, WorkspaceState::Archived);
}

#[tokio::test]
async fn unarchive_recreates_the_worktree_with_its_work_and_marks_the_row_ready() {
    let e = env("flow-unarchive", "").await;
    write(e.f.ws(), "wip.txt", "unsaved\n");
    // Not archived yet: nothing to do.
    assert!(!e.unarchive().await.unwrap().restored);

    assert!(e.archive(None, true).await.unwrap().archived);
    let record = e.f.tmp.0.join("root/archived/repo/ws.ws");
    assert!(record.exists() && !e.f.ws().exists() && !e.f.branch_exists("sven/ws"));

    // The branch was deleted on archive: Conductor's restore dialog first,
    // nothing changed.
    let r = e.unarchive().await.unwrap();
    assert!(!r.restored && r.scenario == Some("branchDeleted"), "{r:?}");
    assert!(!e.f.ws().exists());
    assert_eq!(e.row().await.state, WorkspaceState::Archived);

    // "Restore to new branch": `sven/ws-v1` at the archive commit, stored on the row.
    let r = e.unarchive_with(true).await.unwrap();
    assert!(
        r.restored && r.recreated_branch && r.restored_changes && r.scenario.is_none(),
        "{r:?}"
    );
    assert_eq!(r.branch.as_deref(), Some("sven/ws-v1"));
    assert!(r.notices.is_empty());
    assert_eq!(
        fs::read_to_string(e.f.ws().join("wip.txt")).unwrap(),
        "unsaved\n"
    );
    assert_eq!(g(e.f.ws(), &["branch", "--show-current"]), "sven/ws-v1");
    assert_eq!(e.row().await.state, WorkspaceState::Ready);
    assert_eq!(e.row().await.branch.as_deref(), Some("sven/ws-v1"));
    assert!(!record.exists());

    // A directory in the way leaves the row archived.
    assert!(e.archive(None, false).await.unwrap().archived);
    fs::create_dir_all(e.f.ws()).unwrap();
    let err = e.unarchive().await.unwrap_err();
    assert_eq!(err.code, "UnarchiveDirectoryExists");
    assert_eq!(
        err.message,
        format!("Can't unarchive: {} already exists", e.f.ws().display())
    );
    assert_eq!(err.path.as_deref(), Some(e.f.ws().to_str().unwrap()));
    assert_eq!(err.directory_name.as_deref(), Some("ws"));
    assert_eq!(e.row().await.state, WorkspaceState::Archived);

    // "Clear & unarchive": the folder goes, then the unarchive runs.
    assert_eq!(
        unarchive_conflict_path(&e.pool, "repo/ws").await.unwrap(),
        e.f.ws()
    );
    clear_unarchive_conflict(&e.pool, "repo/ws").await.unwrap();
    assert!(!e.f.ws().exists());
    assert!(unarchive_conflict_path(&e.pool, "repo/ws").await.is_err());
    assert!(e.unarchive().await.unwrap().restored);
    // Not archived any more: the conflict commands refuse.
    assert!(clear_unarchive_conflict(&e.pool, "repo/ws").await.is_err());
}

#[tokio::test]
async fn delete_workspace_drops_the_row_and_the_folder() {
    let e = env("flow-delete", "").await;
    assert!(e.f.ws().exists());
    delete_workspace(&e.pool, "repo/ws").await.unwrap();
    assert!(workspaces::get(&e.pool, "repo/ws").await.unwrap().is_none());
    assert!(!e.f.ws().exists());
    assert!(!g(e.f.repo(), &["worktree", "list"]).contains("workspaces/ws"));
    // The branch and the repository stay.
    assert!(e.f.branch_exists("sven/ws"));
    assert!(delete_workspace(&e.pool, "repo/ws").await.is_err());
}
