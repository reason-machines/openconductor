//! Model metadata from local CLI handshakes, without starting a chat turn.

mod protocol;

use std::cell::RefCell;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::agent::{AgentKind, ClaudeLaunch};
use crate::agent_binaries::Agent;
use crate::agent_commands::query::converse;
use crate::settings::service::SettingsService;
use protocol::{CatalogModel, CodexCatalog, LocalAgent};

const TIMEOUT: Duration = Duration::from_secs(20);

fn command(app: &AppHandle, agent: LocalAgent) -> Result<Command, String> {
    let (binary, kind, name) = match agent {
        LocalAgent::Claude => (Agent::Claude, AgentKind::Claude, "Claude Code"),
        LocalAgent::Codex => (Agent::Codex, AgentKind::Codex, "Codex"),
    };
    let exe = crate::agent_launch::current(app, binary)
        .ok_or_else(|| {
            format!("{name} is not installed; set its local executable in Settings › Agents")
        })?
        .path;
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or("The local home directory is unavailable")?;
    let env = app.state::<SettingsService>().launch_env(kind)?;
    let mut cmd = match agent {
        LocalAgent::Claude => {
            let mut launch = ClaudeLaunch::new(&home, env);
            launch.executable = exe;
            launch.prompt_over_stdio = false;
            launch.plugin_dirs.clear();
            launch.settings = Some(serde_json::json!({"disableAllHooks":true}));
            let mut cmd = launch.command();
            cmd.args(["--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}"]);
            cmd
        }
        LocalAgent::Codex => {
            let mut cmd = Command::new(exe);
            cmd.args(["app-server", "--listen", "stdio://"])
                .current_dir(home);
            env.apply(&mut cmd);
            cmd
        }
    };
    if let Some(path) = crate::agent_launch::login_shell_path() {
        cmd.env("PATH", path);
    }
    Ok(cmd)
}

fn fetch(cmd: Command, agent: LocalAgent) -> Result<Vec<CatalogModel>, String> {
    match agent {
        LocalAgent::Claude => converse(
            cmd,
            &[protocol::claude_initialize()],
            TIMEOUT,
            |_, _| {},
            protocol::claude_models,
        ),
        LocalAgent::Codex => {
            let catalog = RefCell::new(CodexCatalog::default());
            converse(
                cmd,
                &[CodexCatalog::initialize()],
                TIMEOUT,
                |_, stdin| {
                    for request in catalog.borrow_mut().take_requests() {
                        let _ = stdin.write_all(request.as_bytes());
                    }
                    let _ = stdin.flush();
                },
                |line| catalog.borrow_mut().accept(line),
            )
        }
    }
}

#[tauri::command]
pub async fn local_model_catalog(
    app: AppHandle,
    agent: LocalAgent,
) -> Result<Vec<CatalogModel>, String> {
    tauri::async_runtime::spawn_blocking(move || fetch(command(&app, agent)?, agent))
        .await
        .map_err(|e| e.to_string())?
}
