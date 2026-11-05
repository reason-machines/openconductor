use std::cell::RefCell;
use std::collections::VecDeque;
use std::io;
use std::path::{Path, PathBuf};

use super::gh::{Addressing, CmdOutput, Gh, GhError, MergeMethod, Runner, Var};

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
