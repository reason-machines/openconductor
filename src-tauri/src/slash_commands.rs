//! The composer's "/" menu: each agent's own slash commands and skills.
//!
//! Conductor's sidecar answers `fetch_slash_commands` per agent with
//! `{ slashCommands: [{name, description, argumentHint}], skills: [{name,
//! description, path, displayName?}] }` (`evidence/chat/slash-skills/`):
//!
//! - Claude Code: the CLI's own list from the stream-json `initialize`
//!   control request (the Agent SDK's `supportedCommands()`), which already
//!   holds user, project and plugin skills, custom commands and built-ins.
//!   No separate skills.
//! - Codex: one built-in command (`review`) and the skills `codex
//!   app-server` reports for the folder (`skills/list`), enabled ones only.
//! - Reason: no commands (the Reason CLI's ACP agent sends no
//!   `available_commands_update`) and the Session's skills from `reason
//!   skills list` (personal and workspace).
//!
//! The bundled skill (`conductor-skill/skills/conductor/SKILL.md`) is
//! added to the Codex and Reason skills; Claude Code already lists it, as
//! it loads the bundle with `--plugin-dir`.
//!
//! A failed lookup comes back as `error` with empty lists, as Conductor's
//! `fetch_slash_commands_output` does, so the menu still shows the
//! app's built-in commands.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::agent::codex_rpc::ClientRequest;
use crate::agent::codex_session::CodexSession;
use crate::agent::{AgentKind, ClaudeLaunch, PermissionMode};
use crate::codex_chat::CodexChats;
use crate::settings::service::SettingsService;

/// How long one agent may take to answer.
const LOOKUP_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommand {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub argument_hint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub name: String,
    pub description: String,
    /// The skill's `SKILL.md` (Codex), or `reason-skill:<id>` for a Reason skill.
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommandsOutput {
    pub slash_commands: Vec<SlashCommand>,
    pub skills: Vec<Skill>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl SlashCommandsOutput {
    fn failed(error: impl Into<String>) -> Self {
        Self {
            error: Some(error.into()),
            ..Self::default()
        }
    }
}

/// Codex's own commands (Conductor's Codex runner `getSlashCommands`).
pub fn codex_commands() -> Vec<SlashCommand> {
    vec![SlashCommand {
        name: "review".into(),
        description: "Review uncommitted changes, or describe what to review".into(),
        argument_hint: "instructions".into(),
    }]
}

/// The `name` and `description` of a `SKILL.md`'s front matter (Conductor's
/// `PX8`): plain `key: value` lines between `---` fences, quotes trimmed.
pub fn skill_front_matter(text: &str) -> Option<(String, String)> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut lines = text.lines();
    if lines.next()?.trim_end() != "---" {
        return None;
    }
    let (mut name, mut description) = (None, None);
    for line in lines {
        if line.trim_end() == "---" {
            break;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = value
            .trim()
            .trim_matches(|c| c == '"' || c == '\'')
            .to_owned();
        match key.trim() {
            "name" => name = Some(value),
            "description" => description = Some(value),
            _ => {}
        }
    }
    Some((
        name.filter(|n| !n.is_empty())?,
        description.filter(|d| !d.is_empty())?,
    ))
}

/// The bundled skill of the plugin directory `plugin`, if it has one.
pub fn bundled_skill(plugin: &Path) -> Option<Skill> {
    let path = plugin.join("skills/conductor/SKILL.md");
    let (name, description) = skill_front_matter(&std::fs::read_to_string(&path).ok()?)?;
    Some(Skill {
        name,
        description,
        path: path.display().to_string(),
        display_name: None,
    })
}

/// `skills` with the bundled skill added at the end, unless one of the same
/// name is already there.
fn with_bundled(mut skills: Vec<Skill>) -> Vec<Skill> {
    if let Some(skill) = crate::agent::claude_cli::bundled_plugin().and_then(|p| bundled_skill(&p))
    {
        if !skills.iter().any(|s| s.name == skill.name) {
            skills.push(skill);
        }
    }
    skills
}

// ---------------------------------------------------------------- Claude Code

/// The request id of the one `initialize` the lookup sends.
const CLAUDE_INIT_ID: &str = "oc_slash_init";

/// The `initialize` control request line.
pub fn claude_initialize_line() -> String {
    format!(
        "{}\n",
        json!({"type": "control_request", "request_id": CLAUDE_INIT_ID, "request": {"subtype": "initialize"}})
    )
}

/// What one stdout line of `claude` means for the lookup: `None` while it
/// is not the answer to [`claude_initialize_line`].
pub fn claude_init_answer(line: &str) -> Option<Result<Vec<SlashCommand>, String>> {
    let v: Value = serde_json::from_str(line).ok()?;
    if v["type"] != "control_response" {
        return None;
    }
    let response = &v["response"];
    if response["request_id"] != CLAUDE_INIT_ID {
        return None;
    }
    if response["subtype"] == "error" {
        let error = response["error"]
            .as_str()
            .unwrap_or("Claude Code refused initialize");
        return Some(Err(error.to_owned()));
    }
    Some(Ok(claude_commands_from(&response["response"])))
}

/// `commands` of an `initialize` response, in the CLI's order.
pub fn claude_commands_from(response: &Value) -> Vec<SlashCommand> {
    response["commands"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|c| serde_json::from_value::<SlashCommand>(c.clone()).ok())
                .filter(|c| !c.name.trim().is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Starts `claude` the way a chat does (stream-json, the bundled plugin),
/// asks `initialize` and stops it again.
pub fn claude_lookup(
    launch: &ClaudeLaunch,
    timeout: Duration,
) -> Result<Vec<SlashCommand>, String> {
    let mut child = launch
        .command()
        .spawn()
        .map_err(|e| format!("cannot start {}: {e}", launch.executable.display()))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(answer) = claude_init_answer(&line) {
                let _ = tx.send(answer);
                return;
            }
        }
        let _ = tx.send(Err(
            "Claude Code exited before it listed its commands".into()
        ));
    });
    let sent = child
        .stdin
        .as_mut()
        .ok_or_else(|| "no stdin".to_string())
        .and_then(|stdin| {
            stdin
                .write_all(claude_initialize_line().as_bytes())
                .and_then(|_| stdin.flush())
                .map_err(|e| e.to_string())
        });
    let answer = match sent {
        Ok(()) => rx
            .recv_timeout(timeout)
            .unwrap_or_else(|_| Err("Claude Code did not list its commands in time".into())),
        Err(e) => Err(e),
    };
    let _ = child.kill();
    let _ = child.wait();
    answer
}

// ---------------------------------------------------------------------- Codex

/// The enabled skills of a `skills/list` result for `cwd` (Conductor's
/// `qD5`): the entry for that folder, else the only entry.
pub fn codex_skills_from(result: &Value, cwd: &str) -> Vec<Skill> {
    let entries = result["data"].as_array().cloned().unwrap_or_default();
    let entry = entries
        .iter()
        .find(|e| e["cwd"] == cwd)
        .or_else(|| (entries.len() == 1).then(|| &entries[0]));
    let Some(entry) = entry else {
        return Vec::new();
    };
    entry["skills"]
        .as_array()
        .map(|skills| {
            skills
                .iter()
                .filter(|s| s["enabled"].as_bool().unwrap_or(true))
                .filter_map(|s| {
                    Some(Skill {
                        name: s["name"].as_str()?.to_owned(),
                        description: s["description"].as_str().unwrap_or_default().to_owned(),
                        path: s["path"].as_str()?.to_owned(),
                        display_name: s["interface"]["displayName"].as_str().map(str::to_owned),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Starts `codex app-server`, asks `skills/list` for `cwd` and stops it.
pub fn codex_lookup(
    launch: &crate::agent::codex_cli::CodexLaunch,
    cwd: &str,
    timeout: Duration,
) -> Result<Vec<Skill>, String> {
    let mut session = CodexSession::spawn(launch).map_err(|e| e.to_string())?;
    let result = session
        .initialize("openconductor", env!("CARGO_PKG_VERSION"), timeout)
        .and_then(|_| {
            session.call(
                &ClientRequest::SkillsList {
                    cwds: vec![cwd.to_owned()],
                },
                timeout,
            )
        })
        .map_err(|e| e.to_string());
    let _ = session.kill();
    result.map(|r| codex_skills_from(&r, cwd))
}

// --------------------------------------------------------------------- Reason

/// The enabled skills in `reason skills list` output (`{ ok, data: { items } }`).
pub fn reason_skills_from(stdout: &str) -> Result<Vec<Skill>, String> {
    let v: Value =
        serde_json::from_str(stdout.trim()).map_err(|e| format!("reason skills list: {e}"))?;
    if v["ok"] == false {
        let error = &v["error"];
        let message = error["message"]
            .as_str()
            .or_else(|| error.as_str())
            .unwrap_or("reason skills list failed");
        return Err(message.to_owned());
    }
    let items = v["data"]["items"].as_array().cloned().unwrap_or_default();
    Ok(items
        .iter()
        .filter(|s| s["is_enabled"].as_bool().unwrap_or(true))
        .filter_map(|s| {
            let name = s["name"].as_str()?.trim();
            (!name.is_empty()).then(|| Skill {
                name: name.to_owned(),
                description: s["description"].as_str().unwrap_or_default().to_owned(),
                path: format!("reason-skill:{}", s["skill_id"].as_str().unwrap_or(name)),
                display_name: None,
            })
        })
        .collect())
}

/// Runs `reason skills list` with an empty input and reads its skills.
pub fn reason_lookup(cli: &Path, cwd: &Path, timeout: Duration) -> Result<Vec<Skill>, String> {
    let mut cmd = Command::new(cli);
    cmd.args(["skills", "list", "--input-file", "-"])
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let (code, stdout, stderr) = run(cmd, b"{}\n", timeout)?;
    match reason_skills_from(&stdout) {
        Ok(skills) => Ok(skills),
        Err(_) if code != Some(0) => Err(format!(
            "reason skills list failed: {}",
            stderr.lines().last().unwrap_or("no output")
        )),
        Err(e) => Err(e),
    }
}

/// Runs `cmd` with `input` on stdin; gives up (and kills it) after `timeout`.
fn run(
    mut cmd: Command,
    input: &[u8],
    timeout: Duration,
) -> Result<(Option<i32>, String, String), String> {
    let program = cmd.get_program().to_string_lossy().into_owned();
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("cannot start {program}: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input);
    }
    let read = |mut r: Box<dyn Read + Send>| {
        thread::spawn(move || {
            let mut s = String::new();
            let _ = r.read_to_string(&mut s);
            s
        })
    };
    let out = read(Box::new(child.stdout.take().ok_or("no stdout")?));
    let err = read(Box::new(child.stderr.take().ok_or("no stderr")?));
    let deadline = Instant::now() + timeout;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("{program} did not answer in time"));
        }
        thread::sleep(Duration::from_millis(25));
    };
    Ok((
        status.code(),
        out.join().unwrap_or_default(),
        err.join().unwrap_or_default(),
    ))
}

// ------------------------------------------------------------------ IPC layer

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Conductor's `fetch_slash_commands` for `agentType` (`claude`, `codex` or
/// `reason`) in the chat's folder.
#[tauri::command]
pub async fn fetch_slash_commands(
    codex: State<'_, CodexChats>,
    settings: State<'_, SettingsService>,
    agent_type: String,
    cwd: String,
) -> Result<SlashCommandsOutput, String> {
    let dir = PathBuf::from(&cwd);
    let out = match agent_type.as_str() {
        "claude" => {
            let exe = crate::claude_chat::find_claude_cli(
                std::env::var_os("PATH").as_deref(),
                home().as_deref(),
            );
            match (exe, settings.launch_env(AgentKind::Claude)) {
                (None, _) => SlashCommandsOutput::failed("Claude Code was not found."),
                (_, Err(e)) => SlashCommandsOutput::failed(e),
                (Some(exe), Ok(env)) => {
                    let mut launch = ClaudeLaunch::new(dir, env);
                    launch.executable = exe;
                    launch.permission_mode = PermissionMode::BypassPermissions;
                    launch.prompt_over_stdio = false;
                    blocking(move || claude_lookup(&launch, LOOKUP_TIMEOUT))
                        .await
                        .map_or_else(SlashCommandsOutput::failed, |slash_commands| {
                            SlashCommandsOutput {
                                slash_commands,
                                ..Default::default()
                            }
                        })
                }
            }
        }
        "codex" => match codex.launch(&settings, dir) {
            Err(e) => SlashCommandsOutput {
                slash_commands: codex_commands(),
                skills: with_bundled(Vec::new()),
                error: Some(e),
            },
            Ok(launch) => {
                let result = blocking(move || codex_lookup(&launch, &cwd, LOOKUP_TIMEOUT)).await;
                SlashCommandsOutput {
                    slash_commands: codex_commands(),
                    error: result.as_ref().err().cloned(),
                    skills: with_bundled(result.unwrap_or_default()),
                }
            }
        },
        "reason" => match crate::reason_acp::cli::find_reason_cli(
            std::env::var_os("PATH").as_deref(),
            home().as_deref(),
        ) {
            None => SlashCommandsOutput {
                skills: with_bundled(Vec::new()),
                ..SlashCommandsOutput::failed("The Reason CLI was not found.")
            },
            Some(cli) => match blocking(move || reason_lookup(&cli, &dir, LOOKUP_TIMEOUT)).await {
                Ok(skills) => SlashCommandsOutput {
                    skills: with_bundled(skills),
                    ..Default::default()
                },
                Err(e) => SlashCommandsOutput {
                    skills: with_bundled(Vec::new()),
                    ..SlashCommandsOutput::failed(e)
                },
            },
        },
        other => SlashCommandsOutput::failed(format!("unknown agent {other}")),
    };
    crate::e2e::log_event("slash", &serde_json::to_value(&out).unwrap_or(Value::Null));
    Ok(out)
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
#[path = "slash_commands_tests.rs"]
mod tests;
