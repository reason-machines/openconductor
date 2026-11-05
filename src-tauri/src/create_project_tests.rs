use super::*;
use oc_scripts::config::{load, SettingsPaths, SharedSource};
use crate::test_exe::write_executable;
use std::path::PathBuf;

/// A scratch dir with a `gh` stand-in whose `repo create` adds a local bare
/// repo as `origin` (or fails with HTTP 422), and an `npx` stand-in running
/// `npx_body` (`$3` is the project slug, the cwd is the parent folder).
fn fixture(name: &str, create_fails: bool, npx_body: &str) -> (Creator, PathBuf) {
    let root = std::env::temp_dir().join(format!("oc-create-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    let create = if create_fails {
        "echo 'HTTP 422: name already exists on this account' >&2; exit 1".to_string()
    } else {
        format!(
            "git init -q --bare '{0}' && git remote add origin '{0}'",
            root.join("remote.git").display()
        )
    };
    let gh = format!(
        "#!/bin/sh\ncase \"$1 $2\" in\n\
         \"repo create\") {create} ;;\n\
         \"repo view\") echo \"https://github.com/octocat/$3\" ;;\n\
         *) exit 2 ;;\nesac\n"
    );
    let gh_path = script(&root, "gh", &gh);
    let npx_path = script(&root, "npx", &format!("#!/bin/sh\n{npx_body}\n"));
    let creator = Creator {
        github: GitHub {
            gh: gh_path.display().to_string(),
        },
        npx: npx_path.display().to_string(),
    };
    (creator, root)
}

fn script(dir: &Path, name: &str, body: &str) -> PathBuf {
    let path = dir.join(name);
    write_executable(&path, body, 0o755);
    path
}

fn request(parent: &Path, template: Template) -> Request {
    Request {
        parent_dir: parent.join("projects").display().to_string(),
        slug: "demo".into(),
        template,
    }
}

fn collect(creator: &Creator, req: &Request) -> (Result<Created, String>, Vec<Progress>) {
    let mut events = Vec::new();
    let result = creator.create(req, &mut |p| events.push(p));
    (result, events)
}

fn steps(events: &[Progress]) -> Vec<&str> {
    events
        .iter()
        .filter_map(|p| match p {
            Progress::Step(s) => Some(s.as_str()),
            Progress::Line(_) => None,
        })
        .collect()
}

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}");
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

#[test]
fn empty_template_creates_commits_and_publishes() {
    let (creator, root) = fixture("empty", false, "exit 9");
    let (result, events) = collect(&creator, &request(&root, Template::Empty));
    let created = result.unwrap();
    let project = root.join("projects/demo");
    assert_eq!(
        steps(&events),
        [
            "Creating project directory...",
            "Initializing Git repository...",
            "Creating GitHub repo...",
        ]
    );
    assert_eq!(created.path, project.display().to_string());
    assert_eq!(created.github_url, "https://github.com/octocat/demo");
    let remote = root.join("remote.git");
    assert_eq!(created.origin_remote_url, remote.display().to_string());
    assert!(project.join(".gitkeep").exists());
    assert_eq!(
        git(&remote, &["log", "-1", "--format=%s"]),
        "Initial commit"
    );
    assert_eq!(
        created.default_branch,
        git(&project, &["rev-parse", "--abbrev-ref", "HEAD"])
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn validation_runs_in_order_and_creates_a_missing_parent() {
    let (creator, root) = fixture("validate", false, "exit 9");
    let mut req = request(&root, Template::Empty);
    req.slug = "  ".into();
    req.parent_dir = String::new();
    assert_eq!(
        collect(&creator, &req).0,
        Err("Enter a project name".into())
    );
    req.slug = "demo".into();
    assert_eq!(collect(&creator, &req).0, Err("Select a directory".into()));

    fs::write(root.join("file"), "").unwrap();
    req.parent_dir = root.join("file/sub").display().to_string();
    let err = collect(&creator, &req).0;
    assert_eq!(err, Err("Couldn't create selected directory".into()));

    let parent = root.join("projects");
    fs::create_dir_all(parent.join("demo")).unwrap();
    req.parent_dir = parent.display().to_string();
    let (err, events) = collect(&creator, &req);
    let expected = format!("Directory \"demo\" already exists in {}", parent.display());
    assert_eq!(err, Err(expected));
    assert!(events.is_empty());
    // A folder that was already there is never deleted.
    assert!(parent.join("demo").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_failed_github_repo_deletes_the_new_folder() {
    let (creator, root) = fixture("ghfail", true, "exit 9");
    let (result, events) = collect(&creator, &request(&root, Template::Empty));
    let err = result.unwrap_err();
    assert!(err.contains("HTTP 422"), "{err}");
    assert_eq!(steps(&events).last(), Some(&"Creating GitHub repo..."));
    assert!(!root.join("projects/demo").exists());
    assert!(root.join("projects").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn nextjs_streams_output_with_extra_path_then_sets_up_env() {
    let body = "echo \"path:$PATH\"\necho \"args:$*\"\necho 'warn: peer deps' >&2\n\
                mkdir \"$3\" && echo '{}' > \"$3/package.json\"\necho 'Success! Created demo'";
    let (creator, root) = fixture("next", false, body);
    let (result, events) = collect(&creator, &request(&root, Template::Nextjs));
    let created = result.unwrap();
    assert_eq!(
        steps(&events),
        [
            "Creating Next.js project...",
            "Setting up environment...",
            "Creating GitHub repo...",
        ]
    );
    let lines: Vec<&str> = events
        .iter()
        .filter_map(|p| match p {
            Progress::Line(l) => Some(l.as_str()),
            Progress::Step(_) => None,
        })
        .collect();
    let path = lines.iter().find(|l| l.starts_with("path:")).unwrap();
    assert!(
        path.starts_with("path:/opt/homebrew/bin:/usr/local/bin:"),
        "{path}"
    );
    assert!(lines.contains(&"warn: peer deps"));
    assert!(lines.contains(&"Success! Created demo"));
    let args = lines.iter().find(|l| l.starts_with("args:")).unwrap();
    assert_eq!(
        *args,
        "args:--yes create-next-app@latest demo --yes --typescript --tailwind --eslint --app --src-dir --import-alias @/* --use-pnpm"
    );
    let project = root.join("projects/demo");
    assert!(project.join(".env.local").exists());
    assert_eq!(created.github_url, "https://github.com/octocat/demo");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn nextjs_failures_report_the_last_line_and_clean_up() {
    // One stream: lines on stdout and stderr arrive in no fixed order.
    let body = "mkdir \"$3\"\necho 'Installing dependencies' >&2\necho 'ERR_PNPM_NO_NETWORK  fetch failed' >&2\nexit 1";
    let (creator, root) = fixture("nextfail", false, body);
    let (result, _) = collect(&creator, &request(&root, Template::Nextjs));
    assert_eq!(result, Err("ERR_PNPM_NO_NETWORK  fetch failed".into()));
    assert!(!root.join("projects/demo").exists());
    fs::remove_dir_all(root).unwrap();

    let (creator, root) = fixture("nextsilent", false, "exit 1");
    let (result, _) = collect(&creator, &request(&root, Template::Nextjs));
    assert_eq!(result, Err("Failed to create Next.js project".into()));
    fs::remove_dir_all(root).unwrap();

    let (creator, root) = fixture("nextnodir", false, "echo done");
    let (result, _) = collect(&creator, &request(&root, Template::Nextjs));
    assert_eq!(
        result,
        Err("create-next-app completed but directory was not created".into())
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn saved_scripts_are_what_the_scripts_loader_resolves() {
    let root = std::env::temp_dir().join(format!("oc-create-scripts-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let settings = root.join(SETTINGS_DIR);
    fs::create_dir_all(&settings).unwrap();
    let file = settings.join(LOCAL_SETTINGS_FILE);
    fs::write(&file, "spotlight_testing = true\n").unwrap();
    let scripts = RepoScripts {
        setup: "ln -sf $CONDUCTOR_ROOT_PATH/.env.local .env.local && pnpm install".into(),
        run: "pnpm run dev".into(),
        run_mode: "concurrent".into(),
    };
    save_local_scripts(&root, &scripts).unwrap();
    let text = fs::read_to_string(&file).unwrap();
    assert!(text.contains("spotlight_testing = true"), "{text}");

    let resolved = load(&SettingsPaths {
        user_dir: root.join("no-user-dir"),
        repo_root: root.clone(),
        workspace: None,
        shared_from: SharedSource::WorkingTree,
    })
    .unwrap();
    assert_eq!(resolved.setup.unwrap().value, scripts.setup);
    assert_eq!(resolved.run[0].command, "pnpm run dev");
    assert_eq!(resolved.run_mode, oc_scripts::config::RunMode::Concurrent);

    fs::write(&file, "not = [toml").unwrap();
    assert!(save_local_scripts(&root, &scripts)
        .unwrap_err()
        .contains("could not parse"));
    assert_eq!(fs::read_to_string(&file).unwrap(), "not = [toml");
    fs::remove_dir_all(root).unwrap();
}
