//! The composer's "/" menu: the slash commands and skills a chat's agent
//! offers in a folder, answered per agent type as Conductor 0.87.6's sidecar
//! does (`getSlashCommandsRequest { sessionId, agentType }` ->
//! `getSlashCommandsResponse { slashCommands, skills, sourceSha }`,
//! `conductor-runtime.js`; evidence/chat/slash-menu/README.md):
//!
//! * Claude Code: `slashCommands` is what the CLI's `initialize` reports
//!   (Conductor's `supportedCommands()`): built-ins, user, project and plugin
//!   skills, custom commands. `skills` is empty, as in Conductor: Claude Code
//!   runs a skill as `/name`, so it is one of its commands.
//! * Codex: `slashCommands` is Conductor's one Codex command (`review`);
//!   `skills` is `skills/list` for the folder, plus the bundled OpenConductor
//!   skill.
//! * Reason: no commands (its ACP agent sends no `available_commands_update`;
//!   Reason CLI 0.2.689 checked); `skills` is `reason skills list`.
//!
//! When the CLI cannot answer, Claude Code's and Codex's lists are read from
//! their skill and command folders instead ([`scan`]), and `source` says so.

pub mod query;
pub mod scan;

#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::agent::{AgentKind, ClaudeLaunch};
use crate::sidecar_stores::completions::{Skill, SlashCommand};

/// How long an agent CLI gets to answer before the folders are read instead.
const QUERY_TIMEOUT: Duration = Duration::from_secs(20);

/// Where a response's lists came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    /// The agent's CLI answered.
    Agent,
    /// The CLI could not answer; the agent's folders were read.
    Scan,
}

/// Conductor's `getSlashCommandsResponse`, plus where it came from.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCommands {
    pub slash_commands: Vec<SlashCommand>,
    pub skills: Vec<Skill>,
    pub source: Source,
    /// Why the CLI could not answer, when `source` is `scan`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Conductor's one Codex command (`getSlashCommands` of its Codex runner).
pub fn codex_commands() -> Vec<SlashCommand> {
    vec![SlashCommand {
        name: "review".into(),
        description: "Review uncommitted changes, or describe what to review".into(),
        argument_hint: "instructions".into(),
    }]
}

/// The bundled plugin's name (`.claude-plugin/plugin.json`) and folder.
pub fn plugin_of(dir: &Path) -> Option<(String, PathBuf)> {
    let manifest: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(dir.join(".claude-plugin/plugin.json")).ok()?,
    )
    .ok()?;
    Some((
        manifest.get("name")?.as_str()?.to_owned(),
        dir.to_path_buf(),
    ))
}

/// The bundled OpenConductor skill, as Codex gets it (Claude Code loads it
/// as a plugin with `--plugin-dir`).
pub fn bundled_skills(plugin_dirs: &[PathBuf]) -> Vec<Skill> {
    plugin_dirs
        .iter()
        .flat_map(|d| scan::skills_in(&d.join("skills")))
        .collect()
}

/// Adds `extra` skills whose path is not listed yet.
pub fn with_skills(mut skills: Vec<Skill>, extra: Vec<Skill>) -> Vec<Skill> {
    for s in extra {
        if !skills.iter().any(|k| k.path == s.path || k.name == s.name) {
            skills.push(s);
        }
    }
    skills
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn claude(app: &AppHandle, cwd: &Path) -> AgentCommands {
    let settings = app.state::<crate::settings::service::SettingsService>();
    let env = settings.launch_env(AgentKind::Claude).unwrap_or_default();
    let mut launch = ClaudeLaunch::new(cwd, env);
    let plugins: Vec<(String, PathBuf)> = launch
        .plugin_dirs
        .iter()
        .filter_map(|d| plugin_of(d))
        .collect();
    let asked = crate::claude_chat::commands::cli_path()
        .ok_or_else(|| "Claude Code is not installed".to_owned())
        .and_then(|exe| {
            launch.executable = exe;
            launch.prompt_over_stdio = false;
            query::converse(
                launch.command(),
                &[query::claude_initialize_line()],
                QUERY_TIMEOUT,
                |_, _| {},
                query::claude_commands,
            )
        });
    match asked {
        Ok(slash_commands) => AgentCommands {
            slash_commands,
            skills: Vec::new(),
            source: Source::Agent,
            error: None,
        },
        Err(e) => AgentCommands {
            slash_commands: scan::claude_commands(cwd, home().as_deref(), &plugins),
            skills: Vec::new(),
            source: Source::Scan,
            error: Some(e),
        },
    }
}

fn codex(app: &AppHandle, cwd: &Path) -> AgentCommands {
    let chats = app.state::<crate::codex_chat::CodexChats>();
    let bundled = bundled_skills(&ClaudeLaunch::new(cwd, Default::default()).plugin_dirs);
    let cwd_s = cwd.display().to_string();
    let asked = chats
        .cli()
        .ok_or_else(|| "Codex is not installed".to_owned())
        .and_then(|exe| {
            let mut cmd = Command::new(exe);
            cmd.arg("app-server").current_dir(cwd);
            if let Some(path) = chats.path() {
                cmd.env("PATH", path);
            }
            if let Ok(env) = app
                .state::<crate::settings::service::SettingsService>()
                .launch_env(AgentKind::Codex)
            {
                env.apply(&mut cmd);
            }
            let [init, initialized, list] = query::codex_lines(&cwd_s);
            let mut pending = Some((initialized, list));
            query::converse(
                cmd,
                &[init],
                QUERY_TIMEOUT,
                move |line, stdin| {
                    if line.get("id").and_then(serde_json::Value::as_i64) == Some(1) {
                        if let Some((a, b)) = pending.take() {
                            let _ = stdin
                                .write_all(a.as_bytes())
                                .and_then(|_| stdin.write_all(b.as_bytes()))
                                .and_then(|_| stdin.flush());
                        }
                    }
                },
                |line| query::codex_skills(line, &cwd_s),
            )
        });
    match asked {
        Ok(skills) => AgentCommands {
            slash_commands: codex_commands(),
            skills: with_skills(skills, bundled),
            source: Source::Agent,
            error: None,
        },
        Err(e) => AgentCommands {
            slash_commands: codex_commands(),
            skills: with_skills(scan::codex_skills(cwd, home().as_deref()), bundled),
            source: Source::Scan,
            error: Some(e),
        },
    }
}

fn reason() -> AgentCommands {
    let asked = crate::reason_chat::cli_path()
        .ok_or_else(|| "Reason is not installed".to_owned())
        .and_then(|exe| {
            let mut cmd = Command::new(exe);
            cmd.args(["skills", "list", "--input-file", "-"]);
            query::reason_skills(&query::run_json(cmd, "{}", QUERY_TIMEOUT)?)
        });
    match asked {
        Ok(skills) => AgentCommands {
            slash_commands: Vec::new(),
            skills,
            source: Source::Agent,
            error: None,
        },
        Err(e) => AgentCommands {
            slash_commands: Vec::new(),
            skills: Vec::new(),
            source: Source::Scan,
            error: Some(e),
        },
    }
}

/// The "/" menu's agent commands and skills for a chat on `agent_type`
/// (`claude`, `codex` or `reason`) working in `cwd`.
#[tauri::command]
pub async fn agent_slash_commands(
    app: AppHandle,
    agent_type: String,
    cwd: String,
) -> Result<AgentCommands, String> {
    let cwd = PathBuf::from(cwd);
    tauri::async_runtime::spawn_blocking(move || match agent_type.as_str() {
        "claude" => Ok(claude(&app, &cwd)),
        "codex" => Ok(codex(&app, &cwd)),
        "reason" | "acp" => Ok(reason()),
        other => Err(format!("unknown agent type {other:?}")),
    })
    .await
    .map_err(|e| e.to_string())?
}
