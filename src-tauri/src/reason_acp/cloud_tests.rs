//! Settings › Cloud setup's reads: `reason call` output parsing and a real
//! run of a fake `reason`.

use super::cli::LaunchConfig;
use super::cloud::{
    combine, parse_call, parse_check, parse_repositories, parse_self, CallError, Reads,
};
use super::test_exe::write_executable;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

/// `reason call getSelf` (0.2.699, signed in) with ids and names replaced.
const SELF: &str = r#"{"schema_version":1,"ok":true,"data":{"principal_type":"user","user_id":"u1","user_name":"Ada Lovelace","email":"ada@example.com","org_id":"o1","scopes":["run","sessions:read"],"organization_name":"Reason Tests","organization_slug":"reason-tests","cloud_activation":{"ready":true,"organization":{"id":"o1","slug":"reason-tests","name":"Reason Tests"},"poll_after_ms":2000},"mcp_connections":[]}}"#;

/// `reason call getSelf` (0.2.695) on a computer that never signed in.
const SIGNED_OUT: &str = r#"{"schema_version":1,"ok":false,"error":{"code":"authentication_required","message":"Sign in with reason login or supply REASON_API_KEY for the selected API origin."}}"#;

/// `getSelfReadiness`'s funding and github checks (0.2.699), shortened.
const READINESS: &str = r#"{"schema_version":1,"ok":true,"data":{"checked_at":"2026-11-06T16:50:00Z","resource_mode":"consolidated","funding":{"status":"ready","detail":"The API paid-access check passed and this caller has positive usable credit.","actions":[]},"github":{"status":"unknown","detail":"A GitHub connection is recorded, but this read does not refresh credentials.","actions":[{"code":"github_repository_access_unverified","actor":"caller","action":"Use the existing repository-list or repository-read API to verify access."}]}}}"#;

fn data(s: &str) -> Value {
    parse_call(s).unwrap()
}

#[test]
fn call_output_is_data_or_the_cli_error() {
    assert_eq!(data(SELF)["email"], "ada@example.com");
    let err = parse_call(SIGNED_OUT).unwrap_err();
    assert_eq!(err.code, "authentication_required");
    assert!(err.is_signed_out());
    assert!(err.message.starts_with("Sign in with reason login"));
    // A notice line before the JSON (a HOME warning) is skipped.
    let noisy =
        format!("Reason: HOME differs from the account database; using the account home.\n{SELF}");
    assert_eq!(data(&noisy)["organization_slug"], "reason-tests");
    let garbage = parse_call("error: unknown command `call`\n").unwrap_err();
    assert_eq!(garbage.code, "unreadable");
    assert_eq!(garbage.message, "error: unknown command `call`");
    assert_eq!(parse_call("").unwrap_err().code, "unreadable");
}

#[test]
fn self_names_the_login_its_workspace_and_cloud_activation() {
    let id = parse_self(&data(SELF));
    assert_eq!(id.email.as_deref(), Some("ada@example.com"));
    assert_eq!(id.name.as_deref(), Some("Ada Lovelace"));
    assert_eq!(id.workspace_name.as_deref(), Some("Reason Tests"));
    assert_eq!(id.workspace_slug.as_deref(), Some("reason-tests"));
    assert_eq!(id.cloud_ready, Some(true));
    // An API key: a service user, no cloud_activation from an older deployment.
    let key = parse_self(
        &json!({"principal_type":"service_user","service_user_name":"ci-bot","org_id":"o1","scopes":[]}),
    );
    assert_eq!(key.name.as_deref(), Some("ci-bot"));
    assert_eq!(key.email, None);
    assert_eq!(key.cloud_ready, None);
}

#[test]
fn readiness_checks_and_repositories() {
    let r = data(READINESS);
    let funding = parse_check(&r["funding"]).unwrap();
    assert_eq!(funding.status, "ready");
    assert!(funding.actions.is_empty());
    let github = parse_check(&r["github"]).unwrap();
    assert_eq!(github.status, "unknown");
    assert_eq!(
        github.actions[0].code,
        "github_repository_access_unverified"
    );
    assert_eq!(github.actions[0].actor, "caller");
    assert!(parse_check(&json!({})).is_none());

    let repos = json!({"items":[
        {"full_name":"acme/web","archived":false},
        {"full_path":"acme/api"},
        {"full_name":"acme/old","archived":true},
        {"name":"no-full-name"}
    ],"total":4});
    assert_eq!(parse_repositories(&repos), vec!["acme/web", "acme/api"]);
}

#[test]
fn combine_prefers_the_signed_out_error() {
    let failed = || {
        Err(CallError {
            code: "timeout".into(),
            message: "slow".into(),
        })
    };
    let setup = combine(Reads {
        self_: parse_call(SIGNED_OUT),
        readiness: failed(),
        agents: failed(),
        repositories: failed(),
    });
    assert!(!setup.signed_in);
    assert_eq!(setup.identity, None);
    assert_eq!(setup.error.unwrap().code, "authentication_required");

    let setup = combine(Reads {
        self_: parse_call(SELF),
        readiness: parse_call(READINESS),
        agents: Ok(json!({"reason": true, "codex": false})),
        repositories: failed(),
    });
    assert!(setup.signed_in);
    assert_eq!(setup.funding.unwrap().status, "ready");
    assert_eq!(setup.agents_available, Some(true));
    assert_eq!(setup.repositories, None);
    assert_eq!(setup.error.unwrap().code, "timeout");
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("reason-acp-cloud-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir.canonicalize().unwrap()
}

/// A fake `reason` that answers `call OPERATION` the way 0.2.699 does and
/// records each call's arguments and stdin.
fn fake_cli(dir: &std::path::Path) -> PathBuf {
    let path = dir.join("reason");
    let log = dir.join("calls.log");
    let body = format!(
        r#"#!/bin/sh
input=""
op=""
prev=""
for a in "$@"; do
  if [ "$prev" = "call" ]; then op="$a"; fi
  if [ "$a" = "--input-file" ]; then input=$(cat); fi
  prev="$a"
done
echo "$* | $input" >> "{log}"
case "$op" in
  getSelf) echo 'Reason: HOME differs from the account database; using the account home.' >&2
           echo '{self_}' ;;
  getSelfReadiness) echo '{readiness}' ;;
  getAgentAuthStatus) echo '{{"schema_version":1,"ok":true,"data":{{"reason":true}}}}' ;;
  listRepositories) echo '{{"schema_version":1,"ok":true,"data":{{"items":[{{"full_name":"acme/web"}}],"total":1}}}}' ;;
  *) echo '{{"schema_version":1,"ok":false,"error":{{"code":"unknown_operation","message":"no"}}}}'; exit 1 ;;
esac
"#,
        log = log.display(),
        self_ = SELF,
        readiness = READINESS,
    );
    write_executable(&path, &body, 0o755);
    path
}

#[test]
fn cloud_setup_runs_the_four_reads_through_the_cli() {
    let dir = temp_dir("setup");
    let cli = fake_cli(&dir);
    let cfg = LaunchConfig::new(&cli)
        .unwrap()
        .workspace("reason-tests")
        .unwrap();
    let setup = cfg.cloud_setup(&dir);
    assert!(setup.signed_in, "{setup:?}");
    assert_eq!(setup.error, None);
    assert_eq!(setup.identity.unwrap().cloud_ready, Some(true));
    assert_eq!(setup.funding.unwrap().status, "ready");
    assert_eq!(setup.agents_available, Some(true));
    assert_eq!(setup.repositories, Some(vec!["acme/web".to_string()]));

    let mut calls: Vec<String> = fs::read_to_string(dir.join("calls.log"))
        .unwrap()
        .lines()
        .map(str::to_string)
        .collect();
    calls.sort();
    assert_eq!(
        calls,
        vec![
            "--workspace reason-tests call getAgentAuthStatus | ",
            r#"--workspace reason-tests call getSelf --input-file - | {"query":{"cloud_activation":"1"}}"#,
            "--workspace reason-tests call getSelfReadiness | ",
            "--workspace reason-tests call listRepositories | ",
        ]
    );
}

#[test]
fn call_reports_cli_errors_and_refuses_odd_operation_names() {
    let dir = temp_dir("errors");
    let cfg = LaunchConfig::new(fake_cli(&dir)).unwrap();
    let err = cfg.call(&dir, "deleteEverything", None).unwrap_err();
    assert_eq!(err.code, "unknown_operation");
    let err = cfg.call(&dir, "get Self; rm", None).unwrap_err();
    assert_eq!(err.message, "invalid operation name");
    assert!(
        !dir.join("calls.log").exists()
            || !fs::read_to_string(dir.join("calls.log"))
                .unwrap()
                .contains("rm")
    );
}
