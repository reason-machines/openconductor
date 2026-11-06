//! Starting Spotlight from the scripts service: the Spotlight command and
//! auto-run after setup share [`start_session`], and [`hook`] is what the
//! app hands [`ScriptService::set_auto_run_spotlight`].
//!
//! Reference (`IRt` in the frontend bundle, `evidence/spotlight/NOTES.md`):
//! once a local workspace's setup completes, or it has no setup script, and
//! the repository has auto-run after setup on and a run script, it starts
//! Spotlight when the workspace's effective `spotlight_testing` is on, and
//! the default run script otherwise.

use std::path::Path;
use std::sync::Arc;

use oc_scripts::service::{AutoRunSpotlight, ScriptService};

use super::service::SpotlightService;
use super::setting;

/// Stop the repository's run scripts, then start the session: the order the
/// reference's `startProcess` follows with `allowRunScriptConcurrency: false`.
/// `Ok(false)`: this workspace was already spotlighted into the root.
pub fn start_session(
    spotlight: &SpotlightService,
    scripts: &ScriptService,
    repo_id: &str,
    workspace_id: &str,
    workspace_path: &Path,
    repo_root: &Path,
) -> Result<bool, String> {
    scripts.runs.stop_repository(repo_id);
    spotlight.start(workspace_id, workspace_path, repo_root)
}

/// Auto-run after setup starts Spotlight instead of the run script when
/// the workspace's effective `spotlight_testing` is on. A setting that cannot
/// be read counts as off, so the run script starts.
pub fn hook(spotlight: Arc<SpotlightService>) -> AutoRunSpotlight {
    Arc::new(move |scripts, ws, paths| {
        if !setting::read(paths).is_ok_and(|s| s.enabled) {
            return None;
        }
        Some(
            start_session(
                &spotlight,
                scripts,
                &ws.repository_id,
                &ws.workspace_id,
                &ws.workspace_path,
                &ws.repo_root,
            )
            .map(|_| ()),
        )
    })
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::fs;
    use std::time::{Duration, Instant};

    use oc_scripts::runner::RunState;
    use oc_scripts::service::WorkspaceRef;

    use super::super::tests::fixture;
    use super::*;

    fn scripts(base: &Path) -> ScriptService {
        ScriptService::new(
            base.join("home/.conductor"),
            base.join("logs"),
            Arc::new(|_| {}),
        )
        .with_base_env(BTreeMap::from([("PATH".into(), "/usr/bin:/bin".into())]))
    }

    fn workspace(id: &str, path: &Path, root: &Path) -> WorkspaceRef {
        WorkspaceRef {
            workspace_id: id.into(),
            repository_id: "r1".into(),
            repo_root: root.to_path_buf(),
            workspace_path: path.to_path_buf(),
            workspace_name: id.into(),
            default_branch: "main".into(),
            target_branch: None,
        }
    }

    #[test]
    fn off_leaves_the_run_script_to_start() {
        let f = fixture();
        let svc = scripts(f.root.parent().unwrap());
        let spotlight = Arc::new(SpotlightService::new(Arc::new(|_| {})));
        let ws = workspace("w1", &f.ws, &f.root);
        let answer = hook(spotlight.clone())(&svc, &ws, &svc.settings_paths(&ws));
        assert!(answer.is_none());
        assert_eq!(spotlight.active_workspace(&f.root), None);
    }

    #[test]
    fn on_stops_the_repositorys_runs_and_spotlights_the_workspace() {
        let f = fixture();
        let base = f.root.parent().unwrap();
        let svc = scripts(base);
        let other_path = base.join("other");
        fs::create_dir_all(other_path.join(".conductor")).unwrap();
        let other = workspace("w2", &other_path, &f.root);
        fs::create_dir_all(f.root.join(".conductor")).unwrap();
        fs::write(
            f.root.join(".conductor/settings.local.toml"),
            "[scripts.run.dev]\ncommand = \"sleep 30\"\n",
        )
        .unwrap();
        svc.start_run(&other, Some("dev")).unwrap();
        assert_eq!(svc.runs.state("w2", "dev"), RunState::Running);
        setting::write_local(&f.root, true).unwrap();

        let spotlight = Arc::new(SpotlightService::new(Arc::new(|_| {})));
        let ws = workspace("w1", &f.ws, &f.root);
        let answer = hook(spotlight.clone())(&svc, &ws, &svc.settings_paths(&ws));
        assert_eq!(answer, Some(Ok(())));
        assert_eq!(spotlight.active_workspace(&f.root).as_deref(), Some("w1"));
        let deadline = Instant::now() + Duration::from_secs(10);
        while svc.runs.state("w2", "dev") != RunState::Stopped {
            assert!(
                Instant::now() < deadline,
                "the other workspace's run kept going"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(spotlight.stop(&f.root));
    }
}
