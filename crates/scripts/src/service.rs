//! One entry point that the app's commands call: settings, env, ports,
//! setup and run managers, and archive scripts, per workspace.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::config::{
    self, default_script, Location, ResolvedScripts, RunMode, SettingsPaths, SharedSource,
};
use crate::env::{self, ScriptKind, WorkspaceContext};
use crate::launch::{self, LaunchSpec, OutputSink};
use crate::ports::PortAllocator;
use crate::runner::{should_auto_run, RunManager, RunRequest};
use crate::setup::{SetupManager, SetupOutcome, SetupState};
use crate::shell_env;

/// How long an archive script may run before it is stopped.
pub const ARCHIVE_TIMEOUT: Duration = Duration::from_secs(120);

/// The workspace a call is about, as the app's workspace layer knows it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRef {
    pub workspace_id: String,
    pub repository_id: String,
    pub repo_root: PathBuf,
    pub workspace_path: PathBuf,
    pub workspace_name: String,
    /// The repository's default branch; shared settings are read from `origin/<it>`.
    pub default_branch: String,
    /// Branch the workspace targets; `None` reports the default branch.
    pub target_branch: Option<String>,
}

/// Something the UI wants to hear about.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ScriptEvent {
    #[serde(rename_all = "camelCase")]
    Output {
        workspace_id: String,
        kind: &'static str,
        script_id: String,
        chunk: String,
    },
    SetupFinished(SetupOutcome),
}

pub type EventSink = Arc<dyn Fn(ScriptEvent) + Send + Sync>;

/// Starts Spotlight in place of the default run script when auto-run after
/// setup fires. The app sets it (Spotlight lives in the app crate). Given the
/// workspace and the settings paths it resolves against, it returns `None`
/// when the repository has `spotlight_testing` off, so the run script starts,
/// and `Some(result)` when Spotlight took the run's place. The reference's
/// auto-run (`IRt`) starts Spotlight with `isSpotlight` set to the setting and
/// no run-script concurrency.
pub type AutoRunSpotlight = Arc<
    dyn Fn(&ScriptService, &WorkspaceRef, &SettingsPaths) -> Option<Result<(), String>>
        + Send
        + Sync,
>;

#[derive(Clone)]
pub struct ScriptService {
    conductor_dir: PathBuf,
    pub setup: SetupManager,
    pub runs: RunManager,
    ports: Arc<PortAllocator>,
    base_env: Arc<OnceLock<BTreeMap<String, String>>>,
    events: EventSink,
    counter: Arc<AtomicU64>,
    auto_run_spotlight: Arc<OnceLock<AutoRunSpotlight>>,
}

impl ScriptService {
    /// `conductor_dir` is `~/.conductor`; `log_dir` holds setup logs.
    pub fn new(conductor_dir: PathBuf, log_dir: PathBuf, events: EventSink) -> Self {
        Self {
            conductor_dir,
            setup: SetupManager::new(log_dir),
            runs: RunManager::default(),
            ports: Arc::default(),
            base_env: Arc::default(),
            events,
            counter: Arc::default(),
            auto_run_spotlight: Arc::default(),
        }
    }

    /// Use this environment instead of capturing the login shell (tests).
    pub fn with_base_env(self, env: BTreeMap<String, String>) -> Self {
        let _ = self.base_env.set(env);
        self
    }

    /// Let `hook` start Spotlight in place of the run script after setup.
    /// Only the first call takes effect.
    pub fn set_auto_run_spotlight(&self, hook: AutoRunSpotlight) {
        let _ = self.auto_run_spotlight.set(hook);
    }

    /// The settings files a workspace's settings resolve against.
    pub fn settings_paths(&self, ws: &WorkspaceRef) -> SettingsPaths {
        SettingsPaths {
            user_dir: self.conductor_dir.clone(),
            repo_root: ws.repo_root.clone(),
            workspace: Some(ws.workspace_path.clone()),
            shared_from: SharedSource::GitRef(format!("origin/{}", ws.default_branch)),
        }
    }

    /// The user-scope "Auto-run after setup" toggle (off by default).
    pub fn auto_run_after_setup(&self) -> Result<bool, String> {
        config::user_auto_run_after_setup(&self.conductor_dir)
    }

    /// Turn auto-run after setup on or off for every repository that does
    /// not set it itself. Returns the user value read back.
    pub fn set_auto_run_after_setup(&self, enabled: bool) -> Result<bool, String> {
        config::set_user_auto_run_after_setup(&self.conductor_dir, enabled)?;
        self.auto_run_after_setup()
    }

    pub fn config(&self, ws: &WorkspaceRef) -> Result<ResolvedScripts, String> {
        config::load(&self.settings_paths(ws)).map_err(|e| e.to_string())
    }

    /// Start the setup script. `Ok(false)`: there is none, or it already runs.
    pub fn start_setup(&self, ws: &WorkspaceRef) -> Result<bool, String> {
        let cfg = self.config(ws)?;
        let Some(script) = cfg.setup.clone() else {
            self.after_setup(ws, &cfg, SetupState::Idle);
            return Ok(false);
        };
        let spec = self.spec(
            ws,
            ScriptKind::Setup,
            script.value,
            ws.workspace_path.clone(),
        )?;
        let (this, ws2) = (self.clone(), ws.clone());
        let done = Box::new(move |outcome: SetupOutcome| {
            let state = outcome.state;
            (this.events)(ScriptEvent::SetupFinished(outcome));
            // A run queued while setup ran starts instead of the auto-run, as
            // in the reference; a queued run that fails to start counts too.
            if !matches!(this.runs.setup_finished(&ws2.workspace_id), Ok(false)) {
                return;
            }
            if let Ok(cfg) = this.config(&ws2) {
                this.after_setup(&ws2, &cfg, state);
            }
        });
        let sink = self.sink(ws, "setup", "setup");
        self.setup
            .start(&ws.workspace_id, &spec, Some(sink), done)
            .map_err(|e| e.to_string())
    }

    /// Auto-run after setup. The reference requires a run script even when
    /// Spotlight starts in its place.
    fn after_setup(&self, ws: &WorkspaceRef, cfg: &ResolvedScripts, state: SetupState) {
        let has_run = default_script(&cfg.run, Location::Local).is_some();
        if !should_auto_run(
            cfg.auto_run_after_setup,
            has_run,
            cfg.setup.is_some(),
            state,
        ) {
            return;
        }
        let spotlight = self
            .auto_run_spotlight
            .get()
            .and_then(|hook| hook(self, ws, &self.settings_paths(ws)));
        match spotlight {
            None => {
                let _ = self.start_run(ws, None);
            }
            // The reference only logs a failed auto-run.
            Some(Err(e)) => eprintln!(
                "auto-run after setup: Spotlight did not start for workspace {}: {e}",
                ws.workspace_id
            ),
            Some(Ok(())) => {}
        }
    }

    /// Start a run script (`None`: the default one). Returns its id.
    pub fn start_run(&self, ws: &WorkspaceRef, script_id: Option<&str>) -> Result<String, String> {
        let cfg = self.config(ws)?;
        let offered = config::available(&cfg.run, Location::Local);
        let script = match script_id {
            Some(id) => offered.into_iter().find(|s| s.id.eq_ignore_ascii_case(id)),
            None => default_script(&cfg.run, Location::Local),
        }
        .ok_or_else(|| "No run script is configured for this workspace.".to_string())?;
        let ctx = self.context(ws)?;
        let env = env::script_env(&ctx, ScriptKind::Run, &BTreeMap::new());
        let cwd = env::run_cwd(&ws.workspace_path, script.cwd.as_deref(), &env);
        let spec = self.spec(ws, ScriptKind::Run, script.command_line(), cwd)?;
        let req = RunRequest {
            workspace_id: ws.workspace_id.clone(),
            repo_id: ws.repository_id.clone(),
            script_id: script.id.clone(),
            spec,
            concurrent: cfg.run_mode == RunMode::Concurrent,
            sink: Some(self.sink(ws, "run", &script.id)),
        };
        self.runs
            .start(req, self.setup.state(&ws.workspace_id))
            .map_err(|e| e.to_string())?;
        Ok(script.id.clone())
    }

    /// Run the archive script to completion before the workspace is removed.
    /// Returns its exit code and output, or `None` when there is none.
    pub fn run_archive(&self, ws: &WorkspaceRef) -> Result<Option<(Option<i32>, String)>, String> {
        self.runs.stop(&ws.workspace_id, None);
        let cfg = self.config(ws)?;
        let Some(script) = cfg.archive else {
            return Ok(None);
        };
        let spec = self.spec(
            ws,
            ScriptKind::Archive,
            script.value,
            ws.workspace_path.clone(),
        )?;
        let mut process = launch::spawn(&spec, None).map_err(|e| e.to_string())?;
        let deadline = std::time::Instant::now() + ARCHIVE_TIMEOUT;
        let exit = loop {
            match process.try_wait().map_err(|e| e.to_string())? {
                Some(exit) => break exit,
                None if std::time::Instant::now() >= deadline => {
                    break process
                        .stop(Duration::from_secs(3))
                        .map_err(|e| e.to_string())?
                }
                None => std::thread::sleep(Duration::from_millis(50)),
            }
        };
        Ok(Some((exit.code, process.transcript.text())))
    }

    fn context(&self, ws: &WorkspaceRef) -> Result<WorkspaceContext, String> {
        let port = self
            .ports
            .ports_for(&ws.repository_id, &ws.workspace_id)
            .ok_or_else(|| "No free port block is left for this workspace.".to_string())?;
        Ok(WorkspaceContext {
            workspace_id: ws.workspace_id.clone(),
            workspace_name: ws.workspace_name.clone(),
            workspace_path: ws.workspace_path.clone(),
            root_path: ws.repo_root.clone(),
            target_branch: Some(
                ws.target_branch
                    .clone()
                    .unwrap_or_else(|| ws.default_branch.clone()),
            ),
            port,
            user_id: None,
            path_prefix: None,
        })
    }

    fn spec(
        &self,
        ws: &WorkspaceRef,
        kind: ScriptKind,
        script: String,
        cwd: PathBuf,
    ) -> Result<LaunchSpec, String> {
        let overlay = env::script_env(&self.context(ws)?, kind, &BTreeMap::new());
        let base_env = self.base_env.get_or_init(|| {
            let shell =
                std::env::var("SHELL").unwrap_or_else(|_| launch::script_shell().to_string());
            shell_env::capture(&shell, None).unwrap_or_default()
        });
        let n = self.counter.fetch_add(1, Ordering::Relaxed);
        let id = format!("{}-{n}", std::process::id());
        Ok(LaunchSpec {
            script,
            script_path: launch::script_path(&self.conductor_dir, &ws.workspace_path, kind, &id),
            cwd,
            base_env: base_env.clone(),
            overlay,
            lang: base_env
                .get("LANG")
                .cloned()
                .or_else(|| Some("en_US.UTF-8".into())),
        })
    }

    fn sink(&self, ws: &WorkspaceRef, kind: &'static str, script_id: &str) -> OutputSink {
        let (events, workspace_id, script_id) = (
            self.events.clone(),
            ws.workspace_id.clone(),
            script_id.to_string(),
        );
        Arc::new(move |bytes: &[u8]| {
            events(ScriptEvent::Output {
                workspace_id: workspace_id.clone(),
                kind,
                script_id: script_id.clone(),
                chunk: String::from_utf8_lossy(bytes).into_owned(),
            })
        })
    }
}

#[cfg(test)]
mod tests;
