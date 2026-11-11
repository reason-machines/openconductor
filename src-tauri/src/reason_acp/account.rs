//! What Settings › Agents › Reason shows and does with the `reason` CLI:
//! the account (`reason status --json`), signing in from the app (`reason
//! login`) and connecting this computer (`reason connect`).
//!
//! Formats are those of `reason` 0.2.692 on Sven's Mac and 0.2.673 on a
//! Reason cloud computer (evidence/reason-acp/account.md).

use std::path::Path;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use super::cli::LaunchConfig;

/// How long `reason status --json` may take.
const STATUS_TIMEOUT: Duration = Duration::from_secs(20);
/// `reason connect` installs and starts the background connection.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(120);

/// One saved workspace of the signed-in account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Workspace {
    pub slug: String,
    pub name: String,
    /// The one `reason` uses without `--workspace` (the desktop selection).
    pub selected: bool,
    /// This computer's `reason connect` serves the workspace.
    pub connected: bool,
}

/// The account part of `reason status --json`.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub version: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
    /// How `reason` is signed in: `login`, or an API key.
    pub credential: Option<String>,
    /// Why the account could not be read (a revoked key, offline).
    pub error: Option<String>,
    pub organization: Option<String>,
    pub workspaces: Vec<Workspace>,
    /// `reason connect` runs on this computer for at least one workspace.
    pub computer_connected: bool,
}

impl Account {
    pub fn signed_in(&self) -> bool {
        self.error.is_none() && (self.email.is_some() || self.name.is_some())
    }
}

fn text(v: &Value) -> Option<String> {
    v.as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// Reads `reason status --json`; `None` when it is not that JSON.
pub fn parse_status(json: &str) -> Option<Account> {
    let v: Value = serde_json::from_str(json.trim()).ok()?;
    if !v.is_object() {
        return None;
    }
    let connected: Vec<&str> = v["connection"]["workspaces"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|w| w["state"] == "connected" && w["blocked"] != true)
        .filter_map(|w| w["organization_id"].as_str())
        .collect();
    let workspaces = v["workspaces"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|w| {
            let slug = text(&w["slug"])?;
            let id = w["id"].as_str().unwrap_or_default();
            Some(Workspace {
                name: text(&w["name"]).unwrap_or_else(|| slug.clone()),
                slug,
                selected: w["selected"] == true,
                connected: !id.is_empty() && connected.contains(&id),
            })
        })
        .collect();
    Some(Account {
        version: text(&v["version"]),
        name: text(&v["account"]["name"]),
        email: text(&v["account"]["email"]),
        credential: text(&v["account"]["credential"]),
        error: text(&v["account_error"]).or_else(|| text(&v["account_error"]["message"])),
        organization: text(&v["organization"]["name"]),
        workspaces,
        computer_connected: !connected.is_empty(),
    })
}

/// What `reason login` printed for a sign-in in the browser.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct LoginPrompt {
    /// The `https://` link to open.
    pub url: Option<String>,
    /// The code the page shows, to compare (`4S7V-AE6D`).
    pub code: Option<String>,
    /// Everything it printed, for when there is no link (already signed in).
    pub message: String,
}

/// Reads `reason login` without a terminal:
///
/// ```text
/// Open this link to sign in to Reason: https://reasonmachines.com/cli/connect?request=…
/// The page shows the code 4S7V-AE6D.
/// It finishes on its own once you have; run `reason login` again any time to see where it stands.
/// ```
pub fn parse_login(out: &str) -> LoginPrompt {
    let url = out
        .split_whitespace()
        .find(|w| {
            w.starts_with("https://")
                || w.starts_with("http://127.0.0.1:")
                || w.starts_with("http://localhost:")
        })
        .map(|w| w.trim_end_matches(['.', ',', ')']).to_string());
    let code = out.split("the code ").nth(1).and_then(|rest| {
        let code: String = rest
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '-')
            .collect();
        (!code.is_empty()).then_some(code)
    });
    LoginPrompt {
        url,
        code,
        message: out.trim().to_string(),
    }
}

/// The result of a `reason` command the page ran.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommandResult {
    pub ok: bool,
    /// Its output (stdout, then stderr), trimmed.
    pub message: String,
}

fn output_text(out: &std::process::Output) -> String {
    let mut text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let err = String::from_utf8_lossy(&out.stderr);
    if !err.trim().is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(err.trim());
    }
    text
}

impl LaunchConfig {
    /// `reason status --json`; `None` when it could not run or answer.
    pub fn account(&self, dir: &Path) -> Option<Account> {
        let out = self.run_for(dir, &["status", "--json"], true, STATUS_TIMEOUT)?;
        parse_status(&String::from_utf8_lossy(&out.stdout))
    }

    /// Starts a browser sign-in: `reason login` without a terminal prints
    /// a link and a code and finishes on its own once the link was used.
    pub fn login(&self, dir: &Path) -> Result<LoginPrompt, String> {
        super::login::login_prompt(
            self,
            dir,
            &std::sync::atomic::AtomicBool::new(false),
            super::login::LOGIN_TIMEOUT,
        )
        .map_err(|_| "Reason could not start browser sign-in. Try again.".into())
    }

    /// `reason logout`: signs this computer out of Reason (Settings ›
    /// Account › Sign out, Conductor's `account:sign-out`).
    pub fn logout(&self, dir: &Path) -> CommandResult {
        match self.run_for(dir, &["logout"], true, STATUS_TIMEOUT) {
            Some(out) => CommandResult {
                ok: out.status.success(),
                message: output_text(&out),
            },
            None => CommandResult {
                ok: false,
                message: "`reason logout` did not answer".into(),
            },
        }
    }

    /// `reason connect`: connects this computer to Reason in the background.
    pub fn connect_computer(&self, dir: &Path) -> CommandResult {
        match self.run_for(dir, &["connect"], true, CONNECT_TIMEOUT) {
            Some(out) => CommandResult {
                ok: out.status.success(),
                message: output_text(&out),
            },
            None => CommandResult {
                ok: false,
                message: "`reason connect` did not finish within 2 minutes".into(),
            },
        }
    }
}
