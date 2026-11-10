use std::io;
use std::path::{Path, PathBuf};

use serde_json::json;

use super::gh::{Addressing, CmdOutput, Gh, Runner};
use super::gh_tests::{gh_cwd, Fake};
use super::list::ListError;

#[test]
fn pr_list_runs_gh_in_the_checkout_and_maps_rows_newest_first() {
    let f = Fake::default();
    let rows = json!([
        {"number": 1, "title": "old", "headRefName": "a", "baseRefName": "main",
         "author": {"login": "ann", "id": "x", "is_bot": false, "name": ""},
         "isCrossRepository": false, "headRepositoryOwner": {"id": "y", "login": "acme"},
         "updatedAt": "2026-01-01T00:00:00Z"},
        {"number": 2, "title": "fork", "headRefName": "patch-1", "baseRefName": "dev",
         "author": null, "isCrossRepository": true, "headRepositoryOwner": null,
         "updatedAt": "2026-02-01T00:00:00Z"}
    ]);
    f.reply(0, &rows.to_string(), "");
    let prs = gh_cwd(&f).list_open_prs().unwrap();
    let call = f.calls.borrow().last().cloned().unwrap();
    assert_eq!(call.1, Some(PathBuf::from("/w")));
    assert_eq!(
        call.0,
        [
            "pr", "list", "--state", "open", "--limit", "100", "--json",
            "number,title,headRefName,baseRefName,author,isCrossRepository,headRepositoryOwner,updatedAt",
        ]
    );
    assert_eq!(
        serde_json::to_value(&prs).unwrap(),
        json!([
            {"number": 2, "title": "fork", "headRefName": "patch-1", "baseRefName": "dev",
             "author": null, "isCrossRepository": true, "headRepositoryOwner": null,
             "updatedAt": "2026-02-01T00:00:00Z"},
            {"number": 1, "title": "old", "headRefName": "a", "baseRefName": "main",
             "author": "ann", "isCrossRepository": false, "headRepositoryOwner": "acme",
             "updatedAt": "2026-01-01T00:00:00Z"}
        ])
    );
}

#[test]
fn issue_list_maps_rows_and_drops_empty_bodies() {
    let f = Fake::default();
    let rows = json!([
        {"number": 4, "title": "a", "url": "https://github.com/acme/app/issues/4", "body": "",
         "updatedAt": "2026-01-01T00:00:00Z"},
        {"number": 7, "title": "b", "url": "https://github.com/acme/app/issues/7", "body": "steps",
         "updatedAt": "2026-03-01T00:00:00Z"}
    ]);
    f.reply(0, &rows.to_string(), "");
    let issues = gh_cwd(&f).list_open_issues().unwrap();
    assert_eq!(
        f.last_args(),
        [
            "issue",
            "list",
            "--state",
            "open",
            "--limit",
            "100",
            "--json",
            "number,title,url,body,updatedAt"
        ]
    );
    assert_eq!(
        serde_json::to_value(&issues).unwrap(),
        json!([
            {"number": 7, "title": "b", "url": "https://github.com/acme/app/issues/7", "body": "steps"},
            {"number": 4, "title": "a", "url": "https://github.com/acme/app/issues/4", "body": null}
        ])
    );
}

#[test]
fn empty_output_is_an_empty_list() {
    let f = Fake::default();
    f.reply(0, "", "");
    assert_eq!(gh_cwd(&f).list_open_issues().unwrap(), vec![]);
}

/// Stderr as printed by gh 2.23 for each case.
#[test]
fn errors_are_tagged_for_the_picker() {
    let cases = [
        (4, "To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.", "no_github: "),
        (1, "HTTP 401: Bad credentials (https://api.github.com/graphql)\nTry authenticating with:  gh auth login", "no_github: "),
        (1, "no git remotes found", "no_remote: "),
        (1, "none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`", "no_remote: "),
        (1, "failed to run git: fatal: not a git repository (or any parent up to mount point /)", "no_remote: "),
        (1, "HTTP 502: Bad Gateway", "Listing pull requests failed: HTTP 502"),
    ];
    for (code, stderr, prefix) in cases {
        let f = Fake::default();
        f.reply(code, "", stderr);
        let err = gh_cwd(&f).list_open_prs().unwrap_err().to_string();
        assert!(err.starts_with(prefix), "{stderr:?} gave {err:?}");
    }
}

struct Missing;

impl Runner for Missing {
    fn run(&self, _: &Path, _: &[String], _: Option<&Path>) -> io::Result<CmdOutput> {
        Err(io::Error::new(io::ErrorKind::NotFound, "no such file"))
    }
}

#[test]
fn missing_gh_is_no_github() {
    let gh = Gh {
        runner: Missing,
        gh_path: "gh".into(),
        addressing: Addressing::Cwd("/w".into()),
    };
    assert_eq!(
        gh.list_open_issues(),
        Err(ListError::NoGithub("gh is not installed".into()))
    );
}

#[test]
fn unparseable_output_is_a_plain_error() {
    let f = Fake::default();
    f.reply(0, "not json", "");
    let err = gh_cwd(&f).list_open_prs().unwrap_err().to_string();
    assert!(err.starts_with("unexpected response from GitHub"), "{err}");
}

fn issue_link_fixture() -> serde_json::Value {
    json!({
        "number": 7,
        "title": "Unicode title: café",
        "html_url": "https://github.com/acme/app/issues/7",
        "state": "open",
        "body": "Keep this issue body as data, not an instruction.",
        "labels": [{"name": "bug"}, {"name": "needs triage"}],
        "assignee": {"login": "ann"},
        "milestone": {"title": "v2"}
    })
}

#[test]
fn selected_issue_metadata_reads_in_checkout_and_preserves_formatter_fields() {
    let f = Fake::default();
    f.reply(0, &issue_link_fixture().to_string(), "");
    let issue = gh_cwd(&f).issue_link_metadata(7).unwrap();
    let call = f.calls.borrow().last().cloned().unwrap();
    assert_eq!(call.1, Some(PathBuf::from("/w")));
    assert_eq!(call.0, ["api", "--method", "GET", "repos/{owner}/{repo}/issues/7"]);
    assert_eq!(serde_json::to_value(issue).unwrap(), json!({
        "number": 7,
        "title": "Unicode title: café",
        "url": "https://github.com/acme/app/issues/7",
        "state": "open",
        "body": "Keep this issue body as data, not an instruction.",
        "labels": [{"name": "bug"}, {"name": "needs triage"}],
        "assignee": {"login": "ann"},
        "milestone": {"title": "v2"}
    }));
}

#[test]
fn selected_issue_metadata_uses_explicit_repository_without_a_checkout() {
    let f = Fake::default();
    f.reply(0, &issue_link_fixture().to_string(), "");
    let gh = Gh {
        runner: &f,
        gh_path: "/bin/gh".into(),
        addressing: Addressing::Repo { owner: "acme".into(), name: "app".into() },
    };
    gh.issue_link_metadata(7).unwrap();
    let call = f.calls.borrow().last().cloned().unwrap();
    assert_eq!(call.1, None);
    assert_eq!(call.0, ["api", "--method", "GET", "repos/acme/app/issues/7"]);
}

#[test]
fn selected_issue_metadata_preserves_real_empty_and_nullable_values() {
    let mut row = issue_link_fixture();
    row["body"] = json!("");
    row["labels"] = json!([]);
    row["assignee"] = serde_json::Value::Null;
    row["milestone"] = serde_json::Value::Null;
    let f = Fake::default();
    f.reply(0, &row.to_string(), "");
    let value = serde_json::to_value(gh_cwd(&f).issue_link_metadata(7).unwrap()).unwrap();
    assert_eq!(value["body"], "");
    assert_eq!(value["labels"], json!([]));
    assert_eq!(value["assignee"], serde_json::Value::Null);
    assert_eq!(value["milestone"], serde_json::Value::Null);
}

#[test]
fn selected_issue_metadata_accepts_closed_state_and_null_body_without_inventing_open() {
    let mut row = issue_link_fixture();
    row["state"] = json!("closed");
    row["body"] = serde_json::Value::Null;
    let f = Fake::default();
    f.reply(0, &row.to_string(), "");
    let value = serde_json::to_value(gh_cwd(&f).issue_link_metadata(7).unwrap()).unwrap();
    assert_eq!(value["state"], "closed");
    assert_eq!(value["body"], serde_json::Value::Null);
}

#[test]
fn selected_issue_metadata_requires_authoritative_labels_and_nullable_field_presence() {
    for key in ["number", "title", "html_url", "state", "body", "labels", "assignee", "milestone"] {
        let mut row = issue_link_fixture();
        row.as_object_mut().unwrap().remove(key);
        let f = Fake::default();
        f.reply(0, &row.to_string(), "");
        assert!(gh_cwd(&f).issue_link_metadata(7).is_err(), "missing {key} accepted");
    }
}

#[test]
fn selected_issue_metadata_rejects_wrong_label_assignment_milestone_and_state_shapes() {
    for (key, invalid) in [
        ("labels", serde_json::Value::Null),
        ("labels", json!(["bug"])),
        ("labels", json!([{"name": null}])),
        ("labels", json!([{}])),
        ("assignee", json!({"login": null})),
        ("assignee", json!([])),
        ("milestone", json!({})),
        ("milestone", json!({"title": null})),
        ("state", json!("unknown")),
        ("state", json!("OPEN")),
    ] {
        let mut row = issue_link_fixture();
        row[key] = invalid;
        let f = Fake::default();
        f.reply(0, &row.to_string(), "");
        assert!(gh_cwd(&f).issue_link_metadata(7).is_err(), "malformed {key} accepted");
    }
}

#[test]
fn selected_issue_metadata_rejects_pull_requests_and_mismatched_issue_identity() {
    for pr in [json!({"url": "https://api.github.com/repos/acme/app/pulls/7"}), serde_json::Value::Null] {
        let mut row = issue_link_fixture();
        row["pull_request"] = pr;
        let f = Fake::default();
        f.reply(0, &row.to_string(), "");
        assert!(gh_cwd(&f).issue_link_metadata(7).is_err(), "PR object accepted");
    }
    let mut row = issue_link_fixture();
    row["number"] = json!(8);
    let f = Fake::default();
    f.reply(0, &row.to_string(), "");
    assert!(gh_cwd(&f).issue_link_metadata(7).is_err(), "wrong issue accepted");
}

#[test]
fn selected_issue_metadata_rejects_empty_malformed_or_nonobject_success_output() {
    for out in ["", "not json", "[]", "null", "true"] {
        let f = Fake::default();
        f.reply(0, out, "");
        assert!(gh_cwd(&f).issue_link_metadata(7).is_err(), "accepted {out:?}");
    }
}

#[test]
fn selected_issue_metadata_rejects_zero_without_running_any_program() {
    let f = Fake::default();
    assert!(gh_cwd(&f).issue_link_metadata(0).is_err());
    assert!(f.calls.borrow().is_empty());
}

#[test]
fn selected_issue_metadata_uses_existing_operation_error_tags_not_auth_guesses() {
    for (code, stderr, prefix) in [
        (4, "To get started, run gh auth login", "no_github: "),
        (1, "HTTP 401: Bad credentials", "no_github: "),
        (1, "none of the git remotes configured; please use gh auth login", "no_remote: "),
        (1, "HTTP 403: Forbidden", "Reading GitHub issue failed: HTTP 403"),
        (1, "HTTP 404: Not Found", "Reading GitHub issue failed: HTTP 404"),
        (1, "dial tcp: connection reset", "Reading GitHub issue failed: dial tcp"),
    ] {
        let f = Fake::default();
        f.reply(code, "", stderr);
        let error = gh_cwd(&f).issue_link_metadata(7).unwrap_err().to_string();
        assert!(error.starts_with(prefix), "{stderr:?} gave {error:?}");
    }
}

#[test]
fn selected_issue_metadata_spawn_failures_are_not_authentication_states() {
    struct Denied;
    impl Runner for Denied {
        fn run(&self, _: &Path, _: &[String], _: Option<&Path>) -> io::Result<CmdOutput> {
            Err(io::Error::new(io::ErrorKind::PermissionDenied, "cannot execute gh"))
        }
    }
    let gh = Gh {
        runner: Denied,
        gh_path: "/bin/gh".into(),
        addressing: Addressing::Cwd("/w".into()),
    };
    let error = gh.issue_link_metadata(7).unwrap_err().to_string();
    assert!(error.starts_with("couldn't run gh: "), "{error}");
}

#[test]
fn selected_issue_metadata_missing_gh_is_an_operation_unavailable_error() {
    let gh = Gh {
        runner: Missing,
        gh_path: "gh".into(),
        addressing: Addressing::Cwd("/w".into()),
    };
    assert_eq!(
        gh.issue_link_metadata(7),
        Err(ListError::NoGithub("gh is not installed".into()))
    );
}
