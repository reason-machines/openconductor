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
