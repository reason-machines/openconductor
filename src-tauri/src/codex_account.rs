//! Settings › Agents › Codex: the Codex account and the in-app ChatGPT
//! sign-in.
//!
//! Both go through `codex app-server`, the protocol Conductor's own Codex
//! client speaks (`account/login/start`; evidence/providers/
//! codex-conductor-client.md row 2), so OpenConductor never reads Codex's
//! credential file:
//!
//! - [`codex_account`]: `account/read` gives the account type (`chatgpt`,
//!   `apiKey`, ...), the ChatGPT email, plan and workspace. The process runs
//!   with the Codex routing variables cleared, so it reports the CLI's own
//!   login, not an API key in the app's environment.
//! - [`codex_chatgpt_login_start`]: `account/login/start {type: "chatgpt"}`.
//!   Codex starts its local callback server (127.0.0.1:1455) and answers
//!   with the browser `authUrl`, which this returns for the page to open.
//!   The process stays up until Codex sends `account/login/completed`, the
//!   page cancels ([`codex_chatgpt_login_cancel`]) or [`LOGIN_TIMEOUT`]
//!   passes; the result arrives as a [`LOGIN_EVENT`] with the account.
//!   Codex writes the new login to `~/.codex/auth.json` itself, as
//!   `codex login` does.
//!
//! Observed on Codex CLI 0.167.0 (Linux): `account/read` on a fresh
//! `CODEX_HOME` returns `{account: null, requiresOpenaiAuth: true}`;
//! `account/login/start` returns `{type: "chatgpt", loginId, authUrl}`
//! with `redirect_uri=http://127.0.0.1:1455/auth/callback`; cancelling sends
//! `account/login/completed {success: false}` and answers
//! `{status: "canceled"}`.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime, State};

use crate::agent::codex_cli::CodexLaunch;
use crate::agent::codex_events::{Notification, ServerMessage};
use crate::agent::codex_rpc::ClientRequest;
use crate::agent::codex_session::{CodexEvent, CodexSession};
use crate::agent::{AgentKind, LaunchEnv};
use crate::codex_chat::CodexChats;
use crate::settings::service::SettingsService;

/// Window event with a sign-in's end: a [`LoginEvent`].
pub const LOGIN_EVENT: &str = "codex-login-event";
/// How long a browser sign-in may take before the app gives up on it.
pub const LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const CALL: Duration = Duration::from_secs(15);
/// The client name Codex puts in the sign-in URL (`originator`).
const CLIENT: &str = "openconductor";

/// The account `account/read` reports.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAccount {
    /// `chatgpt`, `apiKey`, or another Codex account type; absent when signed out.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    /// ChatGPT plan (`plus`, `pro`, `team`, ...).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_name: Option<String>,
    /// Codex needs an OpenAI login for its model provider.
    pub requires_openai_auth: bool,
}

/// `account/read`'s result to a [`CodexAccount`].
pub fn parse_account(result: &Value) -> CodexAccount {
    let account = result.get("account").filter(|a| a.is_object());
    let field = |k: &str| {
        account
            .and_then(|a| a.get(k))
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    };
    CodexAccount {
        kind: field("type"),
        email: field("email"),
        plan_type: field("planType"),
        workspace_name: field("workspaceName"),
        requires_openai_auth: result
            .get("requiresOpenaiAuth")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

/// A started sign-in: the page opens `auth_url` in the browser.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStarted {
    pub login_id: String,
    pub auth_url: String,
}

/// How a sign-in ended.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum LoginOutcome {
    Success { account: CodexAccount },
    Failed { error: String },
    Cancelled,
    TimedOut,
}

/// [`LOGIN_EVENT`]'s payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginEvent {
    pub login_id: String,
    #[serde(flatten)]
    pub outcome: LoginOutcome,
}

/// An app-server for account calls: `exe` in `cwd` with the Codex routing
/// variables (API keys, base URL) cleared and the login shell's `PATH`.
pub fn account_launch(exe: PathBuf, cwd: PathBuf, path: Option<String>) -> CodexLaunch {
    let mut env = LaunchEnv::cleared_for(AgentKind::Codex);
    if let Some(path) = path {
        env.set("PATH", path);
    }
    let mut launch = CodexLaunch::new(cwd, env);
    launch.executable = exe;
    launch
}

/// Starts the app-server and runs `initialize`.
pub fn open(launch: &CodexLaunch) -> Result<CodexSession, String> {
    let mut session = CodexSession::spawn(launch).map_err(|e| e.to_string())?;
    session
        .initialize(CLIENT, env!("CARGO_PKG_VERSION"), CALL)
        .map_err(|e| e.to_string())?;
    Ok(session)
}

pub fn read_account(session: &mut CodexSession) -> Result<CodexAccount, String> {
    let result = session
        .call(&ClientRequest::AccountRead, CALL)
        .map_err(|e| e.to_string())?;
    Ok(parse_account(&result))
}

pub fn start_chatgpt_login(session: &mut CodexSession) -> Result<LoginStarted, String> {
    let result = session
        .call(&ClientRequest::AccountLoginChatgpt, CALL)
        .map_err(|e| e.to_string())?;
    let text = |k: &str| result.get(k).and_then(Value::as_str).map(str::to_owned);
    match (text("loginId"), text("authUrl")) {
        (Some(login_id), Some(auth_url)) => Ok(LoginStarted { login_id, auth_url }),
        _ => Err("Codex did not return a sign-in link".into()),
    }
}

/// `account/login/completed` for `login_id`: `Some(Ok(()))` on success,
/// `Some(Err(reason))` on failure, `None` for anything else.
fn completion(event: &CodexEvent, login_id: &str) -> Option<Result<(), String>> {
    let CodexEvent::Message(ServerMessage::Notification(Notification::Other { method, params })) =
        event
    else {
        return None;
    };
    if method != "account/login/completed" {
        return None;
    }
    let id = params.get("loginId").and_then(Value::as_str);
    if id.is_some_and(|id| id != login_id) {
        return None;
    }
    if params.get("success").and_then(Value::as_bool) == Some(true) {
        Some(Ok(()))
    } else {
        let error = params.get("error").and_then(Value::as_str);
        Some(Err(error.unwrap_or("Sign-in failed").to_owned()))
    }
}

/// Waits for the sign-in to end, `cancel` to be set, or `timeout`; on
/// success reads the account from the same process.
pub fn wait_for_login(
    session: &mut CodexSession,
    login_id: &str,
    cancel: &AtomicBool,
    timeout: Duration,
) -> LoginOutcome {
    let deadline = Instant::now() + timeout;
    loop {
        if cancel.load(Ordering::SeqCst) {
            let _ = session.call(
                &ClientRequest::AccountLoginCancel {
                    login_id: login_id.to_owned(),
                },
                Duration::from_secs(2),
            );
            return LoginOutcome::Cancelled;
        }
        if Instant::now() >= deadline {
            return LoginOutcome::TimedOut;
        }
        let Some(event) = session.next_event(Duration::from_millis(200)) else {
            continue;
        };
        if let CodexEvent::Closed = event {
            return LoginOutcome::Failed {
                error: "Codex stopped before the sign-in finished".into(),
            };
        }
        match completion(&event, login_id) {
            Some(Ok(())) => {
                return match read_account(session) {
                    Ok(account) => LoginOutcome::Success { account },
                    Err(error) => LoginOutcome::Failed { error },
                }
            }
            Some(Err(error)) => return LoginOutcome::Failed { error },
            None => {}
        }
    }
}

/// The running sign-in, if any: one at a time, as Codex has one callback port.
#[derive(Default)]
pub struct CodexLogins {
    current: Mutex<Option<(String, Arc<AtomicBool>)>>,
}

impl CodexLogins {
    fn cancel_current(&self) {
        if let Some((_, cancel)) = self.current.lock().unwrap().take() {
            cancel.store(true, Ordering::SeqCst);
        }
    }
}

fn launch_for(chats: &CodexChats, settings: &SettingsService) -> Result<CodexLaunch, String> {
    let exe = chats
        .executable(settings)
        .ok_or("The Codex CLI was not found. Install it, or set the Codex executable path.")?;
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let path = chats.path().map(|p| p.to_string_lossy().into_owned());
    Ok(account_launch(exe, home, path))
}

/// JS: `invoke("codex_account")`: the Codex CLI's account.
#[tauri::command]
pub async fn codex_account(
    chats: State<'_, CodexChats>,
    settings: State<'_, SettingsService>,
) -> Result<CodexAccount, String> {
    let launch = launch_for(&chats, &settings)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = open(&launch)?;
        let account = read_account(&mut session);
        let _ = session.kill();
        account
    })
    .await
    .map_err(|e| e.to_string())?
}

/// JS: `invoke("codex_chatgpt_login_start")`: starts a ChatGPT sign-in and
/// resolves with its `authUrl`; its end arrives as a [`LOGIN_EVENT`].
/// Starting again cancels a running sign-in first.
#[tauri::command]
pub async fn codex_chatgpt_login_start<R: Runtime>(
    app: AppHandle<R>,
    chats: State<'_, CodexChats>,
    settings: State<'_, SettingsService>,
    logins: State<'_, CodexLogins>,
) -> Result<LoginStarted, String> {
    logins.cancel_current();
    let launch = launch_for(&chats, &settings)?;
    let (mut session, started) = tauri::async_runtime::spawn_blocking(move || {
        let mut session = open(&launch)?;
        let started = start_chatgpt_login(&mut session)?;
        Ok::<_, String>((session, started))
    })
    .await
    .map_err(|e| e.to_string())??;
    let cancel = Arc::new(AtomicBool::new(false));
    *logins.current.lock().unwrap() = Some((started.login_id.clone(), cancel.clone()));
    let login_id = started.login_id.clone();
    std::thread::spawn(move || {
        let outcome = wait_for_login(&mut session, &login_id, &cancel, LOGIN_TIMEOUT);
        let _ = session.kill();
        let event = LoginEvent { login_id, outcome };
        crate::e2e::log_event(
            "codex-login",
            &serde_json::to_value(&event).unwrap_or_default(),
        );
        let _ = app.emit(LOGIN_EVENT, event);
    });
    Ok(started)
}

/// JS: `invoke("codex_chatgpt_login_cancel")`: stops a running sign-in
/// (its [`LOGIN_EVENT`] says `cancelled`); a no-op without one.
#[tauri::command]
pub async fn codex_chatgpt_login_cancel(logins: State<'_, CodexLogins>) -> Result<(), String> {
    logins.cancel_current();
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use std::fs;
    use std::sync::atomic::AtomicU32;

    use super::*;
    use crate::test_exe::write_executable;

    /// Answers like Codex 0.167.0 did (module docs). `$0.mode` = `ok`
    /// completes the sign-in once `$0.go` exists; `fail` fails it.
    const FAKE: &str = r#"#!/bin/sh
signed_in=0
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$0.stdin"
  id=$(printf '%s' "$line" | sed -n 's/^{"id":\([0-9]*\),.*/\1/p')
  case "$line" in
    *'"method":"initialize"'*) echo "{\"id\":$id,\"result\":{\"userAgent\":\"fake/0\"}}" ;;
    *'"method":"account/read"'*)
      if [ -e "$0.signed-in" ]; then
        echo "{\"id\":$id,\"result\":{\"account\":{\"type\":\"chatgpt\",\"email\":\"sven@example.com\",\"planType\":\"pro\",\"workspaceName\":null},\"requiresOpenaiAuth\":true}}"
      else
        echo "{\"id\":$id,\"result\":{\"account\":null,\"requiresOpenaiAuth\":true}}"
      fi ;;
    *'"method":"account/login/start"'*)
      echo "{\"id\":$id,\"result\":{\"type\":\"chatgpt\",\"loginId\":\"L1\",\"authUrl\":\"https://auth.openai.com/oauth/authorize?x=1\"}}"
      ( while [ ! -e "$0.go" ]; do sleep 0.05; done
        if [ "$(cat "$0.mode")" = ok ]; then
          touch "$0.signed-in"
          echo '{"method":"account/login/completed","params":{"loginId":"L1","success":true,"error":null}}'
        else
          echo '{"method":"account/login/completed","params":{"loginId":"L1","success":false,"error":"Login was not completed"}}'
        fi ) & ;;
    *'"method":"account/login/cancel"'*)
      echo "{\"id\":$id,\"result\":{\"status\":\"canceled\"}}" ;;
  esac
done
"#;

    fn fake(mode: &str) -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "oc-codex-account-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("codex");
        write_executable(&exe, FAKE, 0o755);
        fs::write(dir.join("codex.mode"), mode).unwrap();
        exe
    }

    fn session(exe: &std::path::Path) -> CodexSession {
        open(&account_launch(
            exe.to_path_buf(),
            std::env::temp_dir(),
            None,
        ))
        .unwrap()
    }

    #[test]
    fn parses_chatgpt_api_key_and_signed_out_accounts() {
        let chatgpt = parse_account(&serde_json::json!({
            "account": {"type": "chatgpt", "email": "a@b.c", "planType": "plus", "workspaceName": null},
            "requiresOpenaiAuth": true
        }));
        assert_eq!(chatgpt.kind.as_deref(), Some("chatgpt"));
        assert_eq!(chatgpt.email.as_deref(), Some("a@b.c"));
        assert_eq!(chatgpt.plan_type.as_deref(), Some("plus"));
        assert_eq!(chatgpt.workspace_name, None);
        let key = parse_account(
            &serde_json::json!({"account": {"type": "apiKey"}, "requiresOpenaiAuth": true}),
        );
        assert_eq!((key.kind.as_deref(), key.email), (Some("apiKey"), None));
        let out = parse_account(&serde_json::json!({"account": null, "requiresOpenaiAuth": true}));
        assert_eq!(
            out,
            CodexAccount {
                requires_openai_auth: true,
                ..Default::default()
            }
        );
    }

    #[test]
    fn chatgpt_sign_in_completes_and_reads_the_email() {
        let exe = fake("ok");
        let mut s = session(&exe);
        assert_eq!(read_account(&mut s).unwrap().kind, None);
        let started = start_chatgpt_login(&mut s).unwrap();
        assert_eq!(started.login_id, "L1");
        assert!(started.auth_url.starts_with("https://auth.openai.com/"));
        fs::write(exe.with_extension("go"), "").unwrap();
        let cancel = AtomicBool::new(false);
        match wait_for_login(&mut s, "L1", &cancel, Duration::from_secs(10)) {
            LoginOutcome::Success { account } => {
                assert_eq!(account.email.as_deref(), Some("sven@example.com"));
                assert_eq!(account.plan_type.as_deref(), Some("pro"));
            }
            other => panic!("{other:?}"),
        }
        let sent = fs::read_to_string(exe.with_extension("stdin")).unwrap();
        assert!(
            sent.contains(r#""method":"account/login/start","params":{"type":"chatgpt"}"#),
            "{sent}"
        );
    }

    #[test]
    fn failed_cancelled_and_timed_out_sign_ins() {
        let exe = fake("fail");
        let mut s = session(&exe);
        start_chatgpt_login(&mut s).unwrap();
        fs::write(exe.with_extension("go"), "").unwrap();
        let cancel = AtomicBool::new(false);
        assert_eq!(
            wait_for_login(&mut s, "L1", &cancel, Duration::from_secs(10)),
            LoginOutcome::Failed {
                error: "Login was not completed".into()
            }
        );

        let exe = fake("ok");
        let mut s = session(&exe);
        start_chatgpt_login(&mut s).unwrap();
        assert_eq!(
            wait_for_login(&mut s, "L1", &cancel, Duration::from_millis(300)),
            LoginOutcome::TimedOut
        );
        cancel.store(true, Ordering::SeqCst);
        assert_eq!(
            wait_for_login(&mut s, "L1", &cancel, Duration::from_secs(10)),
            LoginOutcome::Cancelled
        );
        let sent = fs::read_to_string(exe.with_extension("stdin")).unwrap();
        assert!(
            sent.contains(r#""method":"account/login/cancel","params":{"loginId":"L1"}"#),
            "{sent}"
        );
    }

    #[test]
    fn login_event_serializes_for_the_page() {
        let event = LoginEvent {
            login_id: "L1".into(),
            outcome: LoginOutcome::Failed {
                error: "nope".into(),
            },
        };
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            serde_json::json!({"loginId": "L1", "status": "failed", "error": "nope"})
        );
    }
}
