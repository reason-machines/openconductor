//! Whether this computer's Reason login can run cloud workspaces: the data
//! behind Settings › Cloud setup and the create composer's Cloud switch.
//!
//! OpenConductor's cloud workspaces are Reason Sessions on Reason cloud
//! computers (`reason acp --cloud`). Conductor 0.87.6 gates its own cloud
//! on three steps (`Hua` and `Pet` in `renderApp-D_fmY7hW.js`, REA-read on
//! sven m5 max): a plan, an agent credential and GitHub access. Here each
//! step is a read of the Reason HTTP API through the user's own CLI login
//! (`reason call OPERATION`), so the app never holds a Reason token:
//!
//! * plan: `getSelf` with `cloud_activation=1` (signed in, workspace, cloud
//!   entitlement) and `getSelfReadiness` (`funding`);
//! * agents: `getAgentAuthStatus` (`reason`: Reason's managed inference);
//! * GitHub: `listRepositories` (repositories the workspace's GitHub App or
//!   the caller's personal grant reaches; `createSession` takes their
//!   `full_name`).
//!
//! Output format is that of `reason` 0.2.699 (signed in, sven m5 max) and
//! 0.2.695 (signed out, a Reason cloud computer): one JSON line
//! `{"schema_version":1,"ok":true,"data":…}`, or `"ok":false` with
//! `error: {code, message}` on stdout and exit status 1
//! (evidence/reason-cloud/README.md).

use std::io::{Read, Write};
use std::path::Path;
use std::process::Stdio;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use super::cli::LaunchConfig;

/// How long one `reason call` may take.
const CALL_TIMEOUT: Duration = Duration::from_secs(20);

/// A `reason call` that did not return data.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CallError {
    /// `authentication_required`, `command_failed`, … or `unreadable`
    /// (not the CLI's JSON) and `timeout`.
    pub code: String,
    pub message: String,
}

impl CallError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        CallError {
            code: code.into(),
            message: message.into(),
        }
    }

    /// The CLI has no login and no `REASON_API_KEY`.
    pub fn is_signed_out(&self) -> bool {
        self.code == "authentication_required"
    }
}

/// Reads what `reason call` printed: its `data`, or its error.
pub fn parse_call(stdout: &str) -> Result<Value, CallError> {
    let line = stdout
        .lines()
        .rev()
        .find(|l| l.trim_start().starts_with('{'))
        .ok_or_else(|| CallError::new("unreadable", first_line(stdout)))?;
    let v: Value = serde_json::from_str(line.trim())
        .map_err(|_| CallError::new("unreadable", first_line(stdout)))?;
    if v["ok"] == true {
        return Ok(v["data"].clone());
    }
    let err = &v["error"];
    let code = err["code"].as_str().unwrap_or("command_failed");
    let message = err["message"]
        .as_str()
        .or_else(|| err.as_str())
        .unwrap_or("The Reason CLI could not complete the call.");
    Err(CallError::new(code, message))
}

fn first_line(s: &str) -> String {
    let line = s.lines().map(str::trim).find(|l| !l.is_empty());
    line.unwrap_or("The Reason CLI printed nothing.")
        .to_string()
}

fn text(v: &Value) -> Option<String> {
    v.as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// One `getSelfReadiness` check (`funding`, `github`, …).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Check {
    /// `ready`, `blocked`, `unknown` or `not_applicable`.
    pub status: String,
    pub detail: String,
    /// What a person does to resolve it (`action`), for whom (`actor`).
    pub actions: Vec<CheckAction>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CheckAction {
    pub code: String,
    pub actor: String,
    pub action: String,
}

pub fn parse_check(v: &Value) -> Option<Check> {
    let status = text(&v["status"])?;
    let actions = v["actions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|a| {
            Some(CheckAction {
                code: text(&a["code"])?,
                actor: text(&a["actor"]).unwrap_or_default(),
                action: text(&a["action"]).unwrap_or_default(),
            })
        })
        .collect();
    Some(Check {
        status,
        detail: text(&v["detail"]).unwrap_or_default(),
        actions,
    })
}

/// Who `getSelf` says the login is.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub email: Option<String>,
    pub name: Option<String>,
    pub workspace_name: Option<String>,
    pub workspace_slug: Option<String>,
    /// `cloud_activation.ready`; `None` when the deployment does not report it.
    pub cloud_ready: Option<bool>,
}

pub fn parse_self(data: &Value) -> Identity {
    let activation = &data["cloud_activation"];
    Identity {
        email: text(&data["email"]),
        name: text(&data["user_name"]).or_else(|| text(&data["service_user_name"])),
        workspace_name: text(&data["organization_name"])
            .or_else(|| text(&activation["organization"]["name"])),
        workspace_slug: text(&data["organization_slug"])
            .or_else(|| text(&activation["organization"]["slug"])),
        cloud_ready: activation["ready"].as_bool(),
    }
}

/// `getAgentAuthStatus.reason`: Reason's managed inference is available.
pub fn parse_agents(data: &Value) -> Option<bool> {
    data["reason"].as_bool()
}

/// `listRepositories`: each reachable repository's `owner/name`.
pub fn parse_repositories(data: &Value) -> Vec<String> {
    data["items"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|r| r["archived"] != true)
        .filter_map(|r| text(&r["full_name"]).or_else(|| text(&r["full_path"])))
        .collect()
}

/// Everything Settings › Cloud setup shows. A part is `None` when its read
/// failed; `error` then says why (the first failure, signed out first).
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSetup {
    pub signed_in: bool,
    pub identity: Option<Identity>,
    pub funding: Option<Check>,
    pub agents_available: Option<bool>,
    pub repositories: Option<Vec<String>>,
    pub error: Option<CallError>,
}

/// The four reads' results, in the order [`LaunchConfig::cloud_setup`]
/// runs them.
pub struct Reads {
    pub self_: Result<Value, CallError>,
    pub readiness: Result<Value, CallError>,
    pub agents: Result<Value, CallError>,
    pub repositories: Result<Value, CallError>,
}

pub fn combine(reads: Reads) -> CloudSetup {
    let mut errors = Vec::new();
    let mut ok = |r: Result<Value, CallError>| match r {
        Ok(v) => Some(v),
        Err(e) => {
            errors.push(e);
            None
        }
    };
    let identity = ok(reads.self_).map(|d| parse_self(&d));
    let funding = ok(reads.readiness).and_then(|d| parse_check(&d["funding"]));
    let agents_available = ok(reads.agents).and_then(|d| parse_agents(&d));
    let repositories = ok(reads.repositories).map(|d| parse_repositories(&d));
    let error = errors
        .iter()
        .find(|e| e.is_signed_out())
        .or(errors.first())
        .cloned();
    CloudSetup {
        signed_in: identity.is_some(),
        identity,
        funding,
        agents_available,
        repositories,
        error,
    }
}

impl LaunchConfig {
    /// `reason call OPERATION [--input-file -]`, with `input` on stdin.
    pub fn call(
        &self,
        dir: &Path,
        operation: &str,
        input: Option<&Value>,
    ) -> Result<Value, CallError> {
        if operation.is_empty() || !operation.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(CallError::new("command_failed", "invalid operation name"));
        }
        let mut cmd = self.base_command(dir);
        cmd.args(self.workspace_args()).args(["call", operation]);
        if input.is_some() {
            cmd.args(["--input-file", "-"]);
        }
        cmd.stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
        let input = input.map(|v| v.to_string());
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let run = || -> std::io::Result<(String, String)> {
                let mut child = cmd.spawn()?;
                if let (Some(mut stdin), Some(input)) = (child.stdin.take(), input) {
                    stdin.write_all(input.as_bytes())?;
                }
                let mut out = String::new();
                let mut err = String::new();
                if let Some(mut s) = child.stdout.take() {
                    s.read_to_string(&mut out)?;
                }
                if let Some(mut s) = child.stderr.take() {
                    s.read_to_string(&mut err)?;
                }
                child.wait()?;
                Ok((out, err))
            };
            let _ = tx.send(run());
        });
        match rx.recv_timeout(CALL_TIMEOUT) {
            Ok(Ok((out, err))) => parse_call(&out).map_err(|e| {
                if e.code == "unreadable" && !err.trim().is_empty() {
                    CallError::new("unreadable", first_line(&err))
                } else {
                    e
                }
            }),
            Ok(Err(e)) => Err(CallError::new("command_failed", e.to_string())),
            Err(_) => Err(CallError::new(
                "timeout",
                format!("`reason call {operation}` did not answer within 20 seconds"),
            )),
        }
    }

    /// Settings › Cloud setup's four reads, run at the same time.
    pub fn cloud_setup(&self, dir: &Path) -> CloudSetup {
        let run = |op: &'static str, input: Option<Value>| {
            let cfg = self.clone();
            let dir = dir.to_path_buf();
            thread::spawn(move || cfg.call(&dir, op, input.as_ref()))
        };
        let self_ = run(
            "getSelf",
            Some(serde_json::json!({ "query": { "cloud_activation": "1" } })),
        );
        let readiness = run("getSelfReadiness", None);
        let agents = run("getAgentAuthStatus", None);
        let repositories = run("listRepositories", None);
        let join = |h: thread::JoinHandle<Result<Value, CallError>>| {
            h.join()
                .unwrap_or_else(|_| Err(CallError::new("command_failed", "the read panicked")))
        };
        combine(Reads {
            self_: join(self_),
            readiness: join(readiness),
            agents: join(agents),
            repositories: join(repositories),
        })
    }
}
