use std::cell::RefCell;
use std::collections::VecDeque;
use std::io;
use std::path::{Path, PathBuf};

use super::gh::{Addressing, CmdOutput, Gh, GhError, MergeMethod, MergeMethodCache, Runner, Var};

#[derive(Default)]
pub(super) struct Fake {
    pub calls: RefCell<Vec<(Vec<String>, Option<PathBuf>)>>,
    pub replies: RefCell<VecDeque<CmdOutput>>,
}

impl Fake {
    pub fn reply(&self, code: i32, stdout: &str, stderr: &str) {
        let out = CmdOutput {
            code,
            stdout: stdout.into(),
            stderr: stderr.into(),
        };
        self.replies.borrow_mut().push_back(out);
    }
    pub fn last_args(&self) -> Vec<String> {
        self.calls.borrow().last().expect("a call").0.clone()
    }
}

impl Runner for &Fake {
    fn run(&self, program: &Path, args: &[String], cwd: Option<&Path>) -> io::Result<CmdOutput> {
        assert_eq!(program, Path::new("/bin/gh"));
        self.calls
            .borrow_mut()
            .push((args.to_vec(), cwd.map(Path::to_path_buf)));
        let ok = CmdOutput {
            code: 0,
            stdout: String::new(),
            stderr: String::new(),
        };
        Ok(self.replies.borrow_mut().pop_front().unwrap_or(ok))
    }
}

pub(super) fn gh_cwd(fake: &Fake) -> Gh<&Fake> {
    Gh {
        runner: fake,
        gh_path: "/bin/gh".into(),
        addressing: Addressing::Cwd("/w".into()),
    }
}

fn gh_repo(fake: &Fake) -> Gh<&Fake> {
    let addressing = Addressing::repo("acme/app").unwrap();
    Gh {
        runner: fake,
        gh_path: "/bin/gh".into(),
        addressing,
    }
}

#[test]
fn graphql_variables_are_typed_safely() {
    let f = Fake::default();
    let vars = [
        ("branch".to_string(), Var::Str("123".into())),
        ("n".to_string(), Var::Int(7)),
        ("has".to_string(), Var::Bool(true)),
    ];
    gh_cwd(&f).graphql("test", "query{}", &vars).unwrap();
    let want = vec![
        "api",
        "graphql",
        "-f",
        "branch=123",
        "-F",
        "n=7",
        "-F",
        "has=true",
        "-f",
        "query=query{}",
    ];
    assert_eq!(f.last_args(), want);
}

fn methods(squash: bool, rebase: bool, merge: bool) -> String {
    format!(
        r#"{{"data":{{"repository":{{"squashMergeAllowed":{squash},"rebaseMergeAllowed":{rebase},"mergeCommitAllowed":{merge}}}}}}}"#
    )
}

#[test]
fn allowed_merge_method_prefers_squash_then_rebase_then_merge() {
    let f = Fake::default();
    let gh = gh_cwd(&f);
    for (reply, want) in [
        (methods(true, true, true), MergeMethod::Squash),
        (methods(false, true, true), MergeMethod::Rebase),
        (methods(false, false, true), MergeMethod::Merge),
    ] {
        f.reply(0, &reply, "");
        assert_eq!(gh.allowed_merge_method().unwrap(), want);
    }
    let args = f.last_args();
    assert_eq!(&args[2..6], ["-F", "owner={owner}", "-F", "repo={repo}"]);
    f.reply(0, &methods(false, false, false), "");
    assert!(matches!(
        gh.allowed_merge_method(),
        Err(GhError::MergeMethodUnknown)
    ));
    f.reply(1, "", "HTTP 401");
    assert!(matches!(
        gh.allowed_merge_method(),
        Err(GhError::MergeMethodUnknown)
    ));
    f.reply(0, r#"{"data":{"repository":null}}"#, "");
    assert!(matches!(
        gh.allowed_merge_method(),
        Err(GhError::MergeMethodUnknown)
    ));
    f.reply(0, &methods(true, false, false), "");
    gh_repo(&f).allowed_merge_method().unwrap();
    assert_eq!(&f.last_args()[2..6], ["-f", "owner=acme", "-f", "repo=app"]);
}

#[test]
fn repo_addressing_parses_owner_and_name() {
    let want = Addressing::Repo {
        owner: "group/sub".into(),
        name: "app".into(),
    };
    assert_eq!(Addressing::repo("group/sub/app"), Some(want));
    assert_eq!(Addressing::repo("app"), None);
    assert_eq!(Addressing::repo("/app"), None);
    assert_eq!(Addressing::repo("acme/"), None);
}

fn argv(s: &str) -> Vec<String> {
    s.split(' ').map(String::from).collect()
}

#[test]
fn pr_commands_from_checkout_run_in_it_without_repo_flag() {
    let f = Fake::default();
    let gh = gh_cwd(&f);
    gh.merge(5, MergeMethod::Squash).unwrap();
    assert_eq!(
        f.calls.borrow()[0],
        (argv("pr merge 5 --squash"), Some("/w".into()))
    );
    gh.enable_auto_merge(5, MergeMethod::Rebase).unwrap();
    assert_eq!(f.last_args(), argv("pr merge 5 --rebase --auto"));
    gh.disable_auto_merge(5).unwrap();
    assert_eq!(f.last_args(), argv("pr merge 5 --disable-auto"));
    gh.mark_ready(5).unwrap();
    assert_eq!(f.last_args(), argv("pr ready 5"));
    gh.retarget(5, "release").unwrap();
    assert_eq!(f.last_args(), argv("pr edit 5 --base release"));
}

#[test]
fn explicit_repo_adds_repo_flag_and_no_cwd() {
    let f = Fake::default();
    gh_repo(&f).merge(9, MergeMethod::Merge).unwrap();
    assert_eq!(
        f.calls.borrow()[0],
        (argv("pr merge 9 --merge --repo acme/app"), None)
    );
}

#[test]
fn edit_passes_title_and_body_as_single_arguments() {
    let f = Fake::default();
    let gh = gh_cwd(&f);
    gh.edit(3, Some("Fix: it; rm -rf /"), None).unwrap();
    assert_eq!(
        f.last_args(),
        vec!["pr", "edit", "3", "--title", "Fix: it; rm -rf /"]
    );
    gh.edit(3, None, Some("line 1\nline 2")).unwrap();
    assert_eq!(
        f.last_args(),
        vec!["pr", "edit", "3", "--body", "line 1\nline 2"]
    );
}

#[test]
fn approve_pins_the_reviewed_commit() {
    let f = Fake::default();
    gh_cwd(&f).approve(4, "abc123").unwrap();
    let want = "api repos/{owner}/{repo}/pulls/4/reviews -f event=APPROVE -f commit_id=abc123";
    assert_eq!(f.last_args(), argv(want));
    gh_repo(&f).approve(4, "abc123").unwrap();
    assert_eq!(f.last_args()[1], "repos/acme/app/pulls/4/reviews");
}

#[test]
fn failures_carry_gh_stderr() {
    let f = Fake::default();
    f.reply(1, "", "Pull request is not mergeable\n");
    let err = gh_cwd(&f).merge(1, MergeMethod::Squash).unwrap_err();
    assert_eq!(
        err.to_string(),
        "Merging the PR failed: Pull request is not mergeable"
    );
}

#[test]
fn merge_method_cache_keeps_successes_only() {
    let cache = MergeMethodCache::default();
    let err = cache.get_or_fetch("r1", || Err(GhError::MergeMethodUnknown));
    assert!(err.is_err());
    assert_eq!(
        cache
            .get_or_fetch("r1", || Ok(MergeMethod::Rebase))
            .unwrap(),
        MergeMethod::Rebase
    );
    let cached = cache
        .get_or_fetch("r1", || panic!("must not refetch"))
        .unwrap();
    assert_eq!(cached, MergeMethod::Rebase);
    cache.forget("r1");
    assert_eq!(
        cache
            .get_or_fetch("r1", || Ok(MergeMethod::Squash))
            .unwrap(),
        MergeMethod::Squash
    );
}
