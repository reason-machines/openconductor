use super::*;
use crate::test_exe::write_executable;
use std::fs;
use std::path::PathBuf;

/// A `gh` stand-in in a scratch dir: `api user` prints a login, `api user/orgs`
/// prints `orgs` (or fails when `None`), and `repo view acme/taken` succeeds
/// while any other name is not found.
fn fake_gh(name: &str, orgs: Option<&str>) -> (GitHub, PathBuf) {
    let dir = std::env::temp_dir().join(format!("oc-ghrepo-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let orgs = match orgs {
        Some(out) => format!("printf '{out}'"),
        None => "echo 'HTTP 403: Resource not accessible' >&2; exit 1".into(),
    };
    let script = format!(
        "#!/bin/sh\ncase \"$1 $2 $3\" in\n\
         \"api user --jq\") echo octocat ;;\n\
         \"api user/orgs --paginate\") {orgs} ;;\n\
         \"repo view acme/taken\") echo taken ;;\n\
         \"repo view \"*) echo \"GraphQL: Could not resolve to a Repository with the name '$3'.\" >&2; exit 1 ;;\n\
         *) exit 2 ;;\nesac\n"
    );
    let path = dir.join("gh");
    write_executable(&path, &script, 0o755);
    let gh = GitHub {
        gh: path.display().to_string(),
    };
    (gh, dir)
}

#[test]
fn availability_follows_gh_repo_view() {
    use Availability::*;
    assert_eq!(classify_view(true, "demo", ""), Ok(Taken));
    let missing = "GraphQL: Could not resolve to a Repository with the name 'acme/x'.";
    assert_eq!(classify_view(false, "", missing), Ok(Available));
    assert_eq!(
        classify_view(false, "", "HTTP 404: Not Found"),
        Ok(Available)
    );
    let auth = classify_view(false, "", "HTTP 401: Bad credentials");
    assert_eq!(auth, Err("HTTP 401: Bad credentials".into()));
    let empty = classify_view(false, "", "");
    assert_eq!(
        empty,
        Err("Failed to check GitHub repository availability".into())
    );

    let (gh, dir) = fake_gh("view", Some(""));
    assert_eq!(gh.availability("acme", "taken"), Ok(Taken));
    assert_eq!(gh.availability("acme", "fresh"), Ok(Available));
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn owners_are_user_then_orgs() {
    let (gh, dir) = fake_gh("owners", Some("acme\\n\\nwidgets\\n"));
    let owners = gh.owners().unwrap();
    let logins: Vec<_> = owners
        .owners
        .iter()
        .map(|o| (o.login.as_str(), o.kind))
        .collect();
    let expected = [
        ("octocat", OwnerKind::User),
        ("acme", OwnerKind::Org),
        ("widgets", OwnerKind::Org),
    ];
    assert_eq!(logins, expected);
    assert_eq!(owners.orgs_error, None);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn failing_orgs_still_offer_the_personal_account() {
    let (gh, dir) = fake_gh("noorgs", None);
    let owners = gh.owners().unwrap();
    assert_eq!(owners.owners.len(), 1);
    assert_eq!(owners.owners[0].login, "octocat");
    let err = owners.orgs_error.as_deref();
    assert_eq!(err, Some("HTTP 403: Resource not accessible"));
    fs::remove_dir_all(dir).unwrap();
}

/// A scratch dir holding an empty `project/` folder and a `gh` stand-in whose
/// `repo create` adds a local bare repo as `origin` (or fails with HTTP 422)
/// and whose `repo view` prints a github.com URL.
fn create_fixture(name: &str, create_fails: bool) -> (GitHub, PathBuf) {
    let root = std::env::temp_dir().join(format!("oc-ghcreate-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("project")).unwrap();
    let create = if create_fails {
        "echo 'HTTP 422: name already exists on this account' >&2; exit 1".to_string()
    } else {
        format!(
            "git init -q --bare '{0}' && git remote add origin '{0}'",
            root.join("remote.git").display()
        )
    };
    let script = format!(
        "#!/bin/sh\ncase \"$1 $2\" in\n\
         \"repo create\") {create} ;;\n\
         \"repo view\") echo \"https://github.com/$3\" ;;\n\
         *) exit 2 ;;\nesac\n"
    );
    let path = root.join("gh");
    write_executable(&path, &script, 0o755);
    let gh = GitHub {
        gh: path.display().to_string(),
    };
    (gh, root)
}

fn git(dir: &Path, args: &[&str]) -> String {
    let out = run("git", args, dir).unwrap();
    assert!(out.ok, "git {args:?}: {}", out.stderr);
    out.stdout
}

fn request(root: &Path, existing_origin_url: Option<&str>) -> CreateRequest {
    CreateRequest {
        owner: "acme".into(),
        repo_path: root.join("project").display().to_string(),
        repository_name: "demo".into(),
        existing_origin_url: existing_origin_url.map(String::from),
    }
}

fn add_origin(project: &Path, remote: &str, url: &str) {
    git(project, &["remote", "add", remote, url]);
}

#[test]
fn ssh_host_key_failures_get_a_fix() {
    let changed = ssh_hint("@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @");
    assert!(changed.contains("ssh-keygen -R github.com"));
    let unknown = ssh_hint("Host key verification failed.");
    assert!(unknown.contains("ssh -T git@github.com"));
    assert_eq!(ssh_hint("permission denied"), "permission denied");
}

#[test]
fn plain_folder_is_initialised_committed_and_pushed() {
    let (gh, root) = create_fixture("plain", false);
    let created = gh.create(&request(&root, None)).unwrap();
    let project = root.join("project");
    let remote = root.join("remote.git");
    assert_eq!(created.github_url, "https://github.com/acme/demo");
    assert_eq!(created.origin_remote_url, remote.display().to_string());
    // The empty folder got a .gitkeep so the initial commit has content.
    assert!(project.join(".gitkeep").exists());
    assert_eq!(
        git(&remote, &["log", "-1", "--format=%s"]),
        "Initial commit"
    );
    let local = git(&project, &["rev-parse", "HEAD"]);
    assert_eq!(local, git(&remote, &["rev-parse", "HEAD"]));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn non_github_origin_moves_to_upstream_and_back_on_failure() {
    let gitlab = "https://gitlab.com/acme/demo.git";
    let (failing, root) = create_fixture("origin", true);
    let project = root.join("project");
    fs::write(project.join("README.md"), "hi").unwrap();
    git(&project, &["init", "-q"]);
    add_origin(&project, "origin", gitlab);
    let req = request(&root, Some(gitlab));

    let err = failing.create(&req).unwrap_err();
    assert!(
        err.starts_with("Failed to create GitHub repository: HTTP 422"),
        "{err}"
    );
    assert_eq!(git(&project, &["remote"]), "origin");
    assert_eq!(git(&project, &["remote", "get-url", "origin"]), gitlab);

    let (working, other_root) = create_fixture("origin-ok", false);
    working.create(&req).unwrap();
    assert_eq!(git(&project, &["remote", "get-url", "upstream"]), gitlab);
    assert_eq!(
        git(&project, &["log", "-1", "--format=%s"]),
        "Initial commit"
    );
    fs::remove_dir_all(root).unwrap();
    fs::remove_dir_all(other_root).unwrap();
}

#[test]
fn existing_upstream_blocks_moving_origin() {
    let (gh, root) = create_fixture("upstream", false);
    let project = root.join("project");
    git(&project, &["init", "-q"]);
    add_origin(&project, "origin", "https://gitlab.com/acme/demo.git");
    add_origin(&project, "upstream", "https://gitlab.com/other/demo.git");
    let err = gh.create(&request(&root, Some("x"))).unwrap_err();
    assert!(err.contains("an 'upstream' remote already exists"), "{err}");
    let origin = git(&project, &["remote", "get-url", "origin"]);
    assert_eq!(origin, "https://gitlab.com/acme/demo.git");
    fs::remove_dir_all(root).unwrap();
}

/// A `gh` that runs `body` (a shell snippet) for every call.
fn scripted_gh(name: &str, body: &str) -> (GitHub, PathBuf) {
    let dir = std::env::temp_dir().join(format!("oc-ghrepo-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("gh");
    write_executable(&path, &format!("#!/bin/sh\n{body}\n"), 0o755);
    let gh = GitHub {
        gh: path.display().to_string(),
    };
    (gh, dir)
}

#[test]
fn recent_repos_parse_the_api_shape_and_report_errors() {
    let json = r#"[{"id":7,"full_name":"acme/web","description":null,"clone_url":"https://github.com/acme/web.git","ssh_url":"git@github.com:acme/web.git","owner":{"avatar_url":"https://a/1","login":"acme"},"private":true}]"#;
    let body = format!("[ \"$1 $2\" = \"api {RECENT_REPOS_PATH}\" ] || exit 9\necho '{json}'");
    let (gh, dir) = scripted_gh("recent", &body);
    let repos = gh.recent_repos().unwrap();
    assert_eq!(repos.len(), 1);
    assert_eq!(repos[0].full_name, "acme/web");
    assert_eq!(repos[0].description, None);
    assert_eq!(repos[0].owner.avatar_url, "https://a/1");
    fs::remove_dir_all(dir).unwrap();

    let (gh, dir) = scripted_gh("recent-err", "echo 'HTTP 401: Bad credentials' >&2; exit 1");
    assert_eq!(
        gh.recent_repos(),
        Err("GitHub API error: HTTP 401: Bad credentials".into())
    );
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn git_protocol_is_ssh_only_when_gh_says_so() {
    let (gh, dir) = scripted_gh(
        "proto-ssh",
        "[ \"$*\" = \"config get git_protocol\" ] && echo ssh",
    );
    assert_eq!(gh.git_protocol(), "ssh");
    fs::remove_dir_all(dir).unwrap();
    let (gh, dir) = scripted_gh("proto-https", "echo https");
    assert_eq!(gh.git_protocol(), "https");
    fs::remove_dir_all(dir).unwrap();
    let missing = GitHub {
        gh: "/nonexistent/gh".into(),
    };
    assert_eq!(missing.git_protocol(), "https");
}
