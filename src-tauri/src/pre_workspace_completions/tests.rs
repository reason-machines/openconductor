use super::*;

#[cfg(workspace_std_only)]
#[path = "link_tests.rs"]
mod link_tests;
#[cfg(workspace_std_only)]
use std::sync::Arc;

struct Fixture {
    dir: PathBuf,
    root: PathBuf,
    data: PathBuf,
    cache: PathBuf,
    service: WorkspaceService,
    id: String,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

fn git(root: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(root)
        .args([
            "-c",
            "user.name=Synthetic Test",
            "-c",
            "user.email=test@example.invalid",
            "-c",
            "commit.gpgSign=false",
        ])
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap().trim_end().into()
}
fn write(root: &Path, path: &str, text: &str) {
    let path = root.join(path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
fn skill(description: &str) -> String {
    format!("---\nname: deploy\ndescription: {description}\n---\nDo local work.\n")
}
fn fixture() -> Fixture {
    let dir = std::env::temp_dir().join(format!("oc-ref-fixture-{}", uuid::Uuid::new_v4()));
    let root = dir.join("repo");
    fs::create_dir_all(&root).unwrap();
    git(&root, &["init", "-b", "main"]);
    write(&root, "first.txt", "first tree\n");
    write(&root, "src/old.rs", "// old\n");
    write(
        &root,
        ".claude/commands/ship.md",
        "---\ndescription: first command\nargument-hint: <env>\n---\nfirst body\n",
    );
    write(
        &root,
        ".claude/skills/deploy/SKILL.md",
        &skill("first Claude"),
    );
    write(
        &root,
        ".codex/skills/deploy/SKILL.md",
        &skill("first Codex"),
    );
    write(
        &root,
        ".agents/skills/shared/SKILL.md",
        "---\nname: shared\ndescription: first shared\n---\n",
    );
    write(
        &root,
        ".codex/skills/deploy/scripts/helper.sh",
        "first inert resource\n",
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            root.join(".codex/skills/deploy/scripts/helper.sh"),
            fs::Permissions::from_mode(0o700),
        )
        .unwrap();
    }
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "first"]);
    git(&root, &["tag", "first"]);
    git(&root, &["switch", "-c", "second"]);
    fs::remove_file(root.join("first.txt")).unwrap();
    fs::remove_file(root.join("src/old.rs")).unwrap();
    write(&root, "second.txt", "second tree\n");
    write(&root, "src/new.rs", "// new\n");
    write(
        &root,
        ".claude/commands/ship.md",
        "---\ndescription: second command\nargument-hint: <target>\n---\nsecond body\n",
    );
    write(
        &root,
        ".claude/skills/deploy/SKILL.md",
        &skill("second Claude"),
    );
    write(
        &root,
        ".codex/skills/deploy/SKILL.md",
        &skill("second Codex"),
    );
    write(
        &root,
        ".codex/skills/deploy/scripts/helper.sh",
        "second inert resource\n",
    );
    write(
        &root,
        ".codex/skills/orphan/notes.md",
        "not a skill package\n",
    );
    write(
        &root,
        ".claude/commands/not-a-command.sh",
        "not a command\n",
    );
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-m", "second"]);
    // The current checkout is deliberately dirty and disagrees with both refs.
    write(&root, "dirty-only.txt", "not in either ref\n");
    write(
        &root,
        ".codex/skills/deploy/SKILL.md",
        &skill("DIRTY Codex"),
    );
    write(&root, ".claude/commands/ship.md", "DIRTY command\n");
    let data = dir.join("data");
    let cache = dir.join("cache");
    let service = WorkspaceService::new(&data).unwrap();
    let id = service.add_repository(&root).unwrap().id;
    Fixture {
        dir,
        root,
        data,
        cache,
        service,
        id,
    }
}
fn run(f: &Fixture, reference: &str, agent: &str) -> Result<Completions, String> {
    complete(&f.service, &f.id, reference, agent, &f.cache, None)
}
fn names(c: &Completions) -> Vec<&str> {
    c.files.iter().map(|e| e.path.as_str()).collect()
}
fn deploy(c: &Completions) -> &Skill {
    c.skills.iter().find(|s| s.name == "deploy").unwrap()
}

#[test]
fn selected_refs_isolate_files_commands_skills_and_dirty_checkout() {
    let f = fixture();
    let a = run(&f, "first", "codex").unwrap();
    let b = run(&f, "second", "codex").unwrap();
    assert!(names(&a).contains(&"first.txt") && !names(&a).contains(&"second.txt"));
    assert!(names(&b).contains(&"second.txt") && !names(&b).contains(&"first.txt"));
    assert!(!names(&a).contains(&"dirty-only.txt") && !names(&b).contains(&"dirty-only.txt"));
    assert_eq!(deploy(&a).description, "first Codex");
    assert_eq!(deploy(&b).description, "second Codex");
    assert_ne!(deploy(&a).path, deploy(&b).path);
    assert!(fs::read_to_string(&deploy(&a).path)
        .unwrap()
        .contains("first Codex"));
    assert!(fs::read_to_string(&deploy(&b).path)
        .unwrap()
        .contains("second Codex"));
    assert_eq!(a.slash_commands, codex_commands());
    for (reference, description, hint, skill_description) in [
        ("first", "first command", "<env>", "first Claude"),
        ("second", "second command", "<target>", "second Claude"),
    ] {
        let c = run(&f, reference, "claude").unwrap();
        assert!(c.skills.is_empty());
        let command = c.slash_commands.iter().find(|c| c.name == "ship").unwrap();
        assert_eq!(
            (&*command.description, &*command.argument_hint),
            (description, hint)
        );
        assert_eq!(
            c.slash_commands
                .iter()
                .find(|c| c.name == "deploy")
                .unwrap()
                .description,
            skill_description
        );
    }
    assert!(a
        .files
        .iter()
        .any(|e| e.path == "src" && e.is_directory && e.name == "src"));
    assert!(a.files.iter().all(|e| !Path::new(&e.path).is_absolute()));
}

#[test]
fn immutable_commit_survives_branch_move_and_cache_hit_resolves_ref_again() {
    let f = fixture();
    let repo = Repository::open(&f.root).unwrap();
    let pinned = repo.snapshot("main").unwrap();
    let second = git(&f.root, &["rev-parse", "second"]);
    git(&f.root, &["update-ref", "refs/heads/main", &second]);
    let path = pinned.materialize(&repo, &f.id, &f.cache).unwrap();
    assert!(
        fs::read_to_string(path.join(".codex/skills/deploy/SKILL.md"))
            .unwrap()
            .contains("first Codex")
    );
    let moved = run(&f, "main", "codex").unwrap();
    assert_eq!(deploy(&moved).description, "second Codex");
    git(&f.root, &["update-ref", "-d", "refs/heads/main"]);
    assert!(
        run(&f, "main", "codex").is_err(),
        "must not return a stale cached ref"
    );
}

#[test]
fn invalid_unknown_and_deleted_refs_never_fall_back() {
    let f = fixture();
    for reference in [
        "",
        "--all",
        "../main",
        "main\n",
        "main\0",
        "main:foo",
        "HEAD~1",
        "HEAD@{0}",
        "a//b",
        "a/.hidden",
        "a.lock",
        "missing",
    ] {
        assert!(run(&f, reference, "codex").is_err(), "{reference:?}");
    }
    assert!(complete(&f.service, "absent", "first", "codex", &f.cache, None).is_err());
    assert!(run(&f, "first", "remote-provider").is_err());
    let oid = git(&f.root, &["rev-parse", "first"]);
    assert_eq!(
        deploy(&run(&f, &oid, "codex").unwrap()).description,
        "first Codex"
    );
    git(&f.root, &["tag", "-d", "first"]);
    assert!(run(&f, "first", "codex").is_err());
}

#[test]
fn repository_and_registration_cache_isolation() {
    let a = fixture();
    let b = fixture();
    let a1 = run(&a, "first", "codex").unwrap();
    let b1 = complete(&b.service, &b.id, "first", "codex", &a.cache, None).unwrap();
    assert_ne!(deploy(&a1).path, deploy(&b1).path);
    let id2 = a.service.add_repository(&a.root).unwrap().id;
    let a2 = complete(&a.service, &id2, "first", "codex", &a.cache, None).unwrap();
    assert_ne!(deploy(&a1).path, deploy(&a2).path);
    a.service.forget_repository(&a.id).unwrap();
    assert!(run(&a, "first", "codex").is_err());
}

#[test]
fn no_workspace_index_checkout_or_registry_mutation() {
    let f = fixture();
    let before = (
        git(&f.root, &["status", "--porcelain=v1"]),
        git(&f.root, &["worktree", "list", "--porcelain"]),
        git(&f.root, &["rev-parse", "HEAD"]),
        fs::read(f.root.join(".git/index")).unwrap(),
        fs::read(f.data.join("repositories.tsv")).unwrap(),
    );
    for agent in ["claude", "codex", "reason", "acp"] {
        run(&f, "first", agent).unwrap();
    }
    assert_eq!(
        before,
        (
            git(&f.root, &["status", "--porcelain=v1"]),
            git(&f.root, &["worktree", "list", "--porcelain"]),
            git(&f.root, &["rev-parse", "HEAD"]),
            fs::read(f.root.join(".git/index")).unwrap(),
            fs::read(f.data.join("repositories.tsv")).unwrap()
        )
    );
    assert_eq!(fs::read_dir(&f.data).unwrap().count(), 1);
    for agent in ["reason", "acp"] {
        let c = run(&f, "first", agent).unwrap();
        assert!(c.slash_commands.is_empty() && c.skills.is_empty());
        assert!(!c.files.is_empty());
    }
}

#[test]
fn missing_or_replaced_registered_repo_does_not_discover_parent_repo() {
    let f = fixture();
    let repo = Repository::open(&f.root).unwrap();
    fs::rename(&f.root, f.dir.join("old-repo")).unwrap();
    fs::create_dir(&f.root).unwrap();
    assert!(repo.snapshot("first").is_err());
    assert!(run(&f, "first", "codex").is_err());
    // A directory registered inside another repo must not use that parent.
    assert!(Repository::open(&f.dir.join("old-repo/src")).is_err());
}

#[test]
fn stable_private_cache_contains_only_allowed_trees_and_inert_skill_resources() {
    let f = fixture();
    let a = run(&f, "first", "codex").unwrap();
    let b = run(&f, "first", "codex").unwrap();
    assert_eq!(a, b);
    assert!(deploy(&a).path.ends_with("/SKILL.md"));
    assert!(!deploy(&a).path.contains(char::is_whitespace));
    assert!(!deploy(&a).path.contains(')'));
    let snapshot = Path::new(&deploy(&a).path).ancestors().nth(4).unwrap();
    assert!(snapshot.join(".claude/commands/ship.md").is_file());
    assert!(!snapshot.join("first.txt").exists());
    let resource = snapshot.join(".codex/skills/deploy/scripts/helper.sh");
    assert_eq!(
        fs::read_to_string(&resource).unwrap(),
        "first inert resource\n"
    );
    assert!(!snapshot.join(".codex/skills/orphan").exists());
    assert!(!snapshot.join(".claude/commands/not-a-command.sh").exists());
    let b = run(&f, "second", "codex").unwrap();
    let second = Path::new(&deploy(&b).path)
        .parent()
        .unwrap()
        .join("scripts/helper.sh");
    assert_eq!(
        fs::read_to_string(second).unwrap(),
        "second inert resource\n"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(snapshot).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(&deploy(&a).path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(&resource).unwrap().permissions().mode() & 0o777,
            0o700
        );
    }
}

#[test]
fn cache_tampering_extra_files_and_unsafe_paths_are_errors() {
    let f = fixture();
    let a = run(&f, "first", "codex").unwrap();
    let path = Path::new(&deploy(&a).path);
    let original = fs::read(path).unwrap();
    fs::write(path, b"poison").unwrap();
    assert!(run(&f, "first", "codex").is_err());
    fs::write(path, &original).unwrap();
    fs::write(path.parent().unwrap().join("unexpected.md"), "poison").unwrap();
    assert!(run(&f, "first", "codex").is_err());
    let bad = f.dir.join("space cache");
    assert!(complete(&f.service, &f.id, "first", "codex", &bad, None).is_err());
}

#[test]
#[cfg(unix)]
fn git_and_cache_symlinks_are_never_followed() {
    use std::os::unix::fs::symlink;
    let f = fixture();
    let outside = f.dir.join("outside");
    fs::create_dir(&outside).unwrap();
    write(&outside, "SKILL.md", &skill("outside poison"));
    symlink(&outside, f.root.join(".codex/skills/evil")).unwrap();
    symlink(
        outside.join("SKILL.md"),
        f.root.join(".claude/commands/evil.md"),
    )
    .unwrap();
    git(&f.root, &["add", "-A"]);
    git(&f.root, &["commit", "-m", "symlinks"]);
    let c = run(&f, "HEAD", "codex").unwrap();
    assert!(!c.skills.iter().any(|s| s.name == "evil"));
    assert!(!names(&c).contains(&".codex/skills/evil"));
    assert!(!run(&f, "HEAD", "claude")
        .unwrap()
        .slash_commands
        .iter()
        .any(|s| s.name == "evil"));
    let path = Path::new(&deploy(&c).path);
    fs::remove_file(path).unwrap();
    symlink(outside.join("SKILL.md"), path).unwrap();
    assert!(run(&f, "HEAD", "codex").is_err());
    assert!(fs::read_to_string(outside.join("SKILL.md"))
        .unwrap()
        .contains("outside poison"));
    let base = f.dir.join("linked-cache");
    fs::create_dir(&base).unwrap();
    symlink(&outside, base.join("pre-workspace-v1")).unwrap();
    assert!(complete(&f.service, &f.id, "first", "codex", &base, None).is_err());
}

#[test]
fn bounded_blobs_trees_and_metadata_paths() {
    let f = fixture();
    write(
        &f.root,
        ".claude/commands/huge.md",
        &"x".repeat(MAX_BLOB_BYTES + 1),
    );
    git(&f.root, &["add", "-A"]);
    git(&f.root, &["commit", "-m", "oversized"]);
    assert!(run(&f, "HEAD", "claude").unwrap_err().contains("limits"));
    assert!(Repository::open(&f.root)
        .unwrap()
        .git(&["ls-tree", "-r", "--full-tree", "HEAD"], 16)
        .unwrap_err()
        .contains("limit"));
    for path in [
        "../escape",
        "/absolute",
        ".codex/skills/../SKILL.md",
        "a\nb",
        "a\\b",
        ".GIT/config",
    ] {
        assert!(!safe_path(path), "{path}");
    }
    for path in [".claude/commands/a/b/c/do.md", ".agents/skills/x/SKILL.md"] {
        assert!(metadata_path(path));
    }
    for path in [
        ".claude/commands/a/b/c/d/do.md",
        ".codex/skills/x/run.sh",
        ".agents/skills/x/deep/SKILL.md",
        "src/secrets.md",
    ] {
        assert!(!metadata_path(path));
    }
    let oid = "a".repeat(40);
    let tree: Vec<u8> = (0..=MAX_ENTRIES)
        .flat_map(|i| format!("100644 blob {oid} 0\tf{i}\0").into_bytes())
        .collect();
    assert!(parse_tree(&tree).unwrap_err().contains("too many"));
}

#[test]
fn local_global_scans_keep_existing_precedence_without_runtime() {
    let f = fixture();
    let home = f.dir.join("home");
    write(
        &home,
        ".codex/skills/deploy/SKILL.md",
        &skill("global loses"),
    );
    write(
        &home,
        ".agents/skills/other/SKILL.md",
        "---\nname: other\ndescription: global local-only\n---\n",
    );
    write(&home, ".claude/commands/ship.md", "global loses\n");
    write(&home, ".claude/commands/global.md", "global command\n");
    let c = complete(&f.service, &f.id, "first", "codex", &f.cache, Some(&home)).unwrap();
    assert_eq!(deploy(&c).description, "first Codex");
    assert!(c.skills.iter().any(|s| s.name == "other"));
    let c = complete(&f.service, &f.id, "first", "claude", &f.cache, Some(&home)).unwrap();
    assert_eq!(
        c.slash_commands
            .iter()
            .find(|s| s.name == "ship")
            .unwrap()
            .description,
        "first command"
    );
    assert!(c.slash_commands.iter().any(|s| s.name == "global"));
}

#[cfg(workspace_std_only)]
#[tokio::test]
async fn callable_command_uses_registered_repository_and_exact_response_schema() {
    // The harness stubs only Tauri's platform edge. This calls the real async
    // wrapper, service lookup, immutable snapshot and serialization together.
    let f = fixture();
    let app = tauri::AppHandle {
        service: Arc::new(WorkspaceService::new(&f.data).unwrap()),
        cache: f.cache.clone(),
    };
    let c = pre_workspace_completions(app, f.id.clone(), "first".into(), "reason".into())
        .await
        .unwrap();
    let json = serde_json::to_value(c).unwrap();
    let mut keys: Vec<_> = json
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort();
    assert_eq!(keys, ["files", "skills", "slashCommands"]);
    let file = json["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["path"] == "first.txt")
        .unwrap();
    assert_eq!(
        file,
        &serde_json::json!({"name":"first.txt","path":"first.txt","is_directory":false})
    );
    let codex = serde_json::to_value(run(&f, "first", "codex").unwrap()).unwrap();
    assert_eq!(codex["slashCommands"][0]["argumentHint"], "instructions");
    assert!(codex["skills"][0].get("displayName").is_none());
}

#[test]
fn command_registration_and_argument_keys_are_pinned() {
    let root = Path::new(file!()).parent().unwrap().parent().unwrap();
    let lib = fs::read_to_string(root.join("lib.rs")).unwrap();
    assert!(lib.contains("mod pre_workspace_completions;"));
    assert_eq!(
        lib.matches("pre_workspace_completions::pre_workspace_completions,")
            .count(),
        1
    );
    let source = fs::read_to_string(root.join("pre_workspace_completions.rs")).unwrap();
    assert!(source.contains("#[tauri::command]\npub async fn pre_workspace_completions("));
    for field in [
        "repository_id: String",
        "r#ref: String",
        "agent_type: String",
    ] {
        assert!(source.contains(field));
    }
    assert!(!source.contains("crate::agent_launch"));
    assert!(!source.contains("create_workspace("));
    assert!(!source.contains("ClaudeLaunch"));
    assert!(!source.contains("query::"));
}

#[test]
fn aggregate_metadata_limits_and_retained_cache_capacity_fail_explicitly() {
    let f = fixture();
    let repo = Repository::open(&f.root).unwrap();
    for (count, size) in [
        (MAX_METADATA_FILES + 1, 0),
        (MAX_METADATA_BYTES / MAX_BLOB_BYTES + 1, MAX_BLOB_BYTES),
    ] {
        let snapshot = Snapshot {
            commit: "a".repeat(40),
            entries: (0..count)
                .map(|i| Entry {
                    file: FileEntry {
                        name: format!("c{i}.md"),
                        path: format!(".claude/commands/c{i}.md"),
                        is_directory: false,
                    },
                    oid: "b".repeat(40),
                    size,
                    executable: false,
                })
                .collect(),
        };
        assert!(snapshot
            .materialize(&repo, &f.id, &f.cache)
            .unwrap_err()
            .contains("limits"));
    }
    let a = run(&f, "first", "codex").unwrap();
    let before = fs::read(&deploy(&a).path).unwrap();
    let base = f.cache.join("pre-workspace-v1");
    for i in 1..MAX_SNAPSHOTS {
        private_dir(&base.join(format!("retained-{i}"))).unwrap();
    }
    assert!(run(&f, "second", "codex").unwrap_err().contains("capacity"));
    assert_eq!(fs::read(&deploy(&a).path).unwrap(), before);
    assert_eq!(run(&f, "first", "codex").unwrap(), a);
}

#[test]
fn unrepresentable_skill_name_or_path_is_never_returned() {
    let f = fixture();
    write(
        &f.root,
        ".codex/skills/with space/SKILL.md",
        "---\nname: valid\n---\n",
    );
    git(&f.root, &["add", "-A"]);
    git(&f.root, &["commit", "-m", "space"]);
    assert!(run(&f, "HEAD", "codex")
        .unwrap_err()
        .contains("skill links"));
    fs::remove_dir_all(f.root.join(".codex/skills/with space")).unwrap();
    write(
        &f.root,
        ".codex/skills/deploy/SKILL.md",
        "---\nname: not valid\n---\n",
    );
    git(&f.root, &["add", "-A"]);
    git(&f.root, &["commit", "-m", "name"]);
    assert!(run(&f, "HEAD", "codex")
        .unwrap_err()
        .contains("skill links"));
}

#[test]
fn registered_linked_worktree_and_pointer_changes_are_checked() {
    let f = fixture();
    let linked = f.dir.join("linked");
    git(
        &f.root,
        &[
            "worktree",
            "add",
            "--detach",
            linked.to_str().unwrap(),
            "first",
        ],
    );
    let id = f.service.add_repository(&linked).unwrap().id;
    let marker = fs::read(linked.join(".git")).unwrap();
    let result = complete(&f.service, &id, "first", "codex", &f.cache, None).unwrap();
    assert_eq!(deploy(&result).description, "first Codex");
    assert_eq!(fs::read(linked.join(".git")).unwrap(), marker);
    let repo = Repository::open(&linked).unwrap();
    fs::write(
        linked.join(".git"),
        "gitdir: /missing-local-git-directory\n",
    )
    .unwrap();
    assert!(repo.snapshot("first").is_err());
    fs::write(linked.join(".git"), &marker).unwrap();
    let common = repo.git_dir.join("commondir");
    let old = fs::read(&common).unwrap();
    fs::write(&common, ".\n").unwrap();
    assert!(repo.snapshot("first").is_err());
    fs::write(&common, old).unwrap();
    assert!(repo.snapshot("first").is_ok());
}

#[test]
#[cfg(unix)]
fn symlinked_git_directory_is_rejected_even_when_target_exists() {
    use std::os::unix::fs::symlink;
    let f = fixture();
    let repo = Repository::open(&f.root).unwrap();
    let original = f.root.join(".git");
    let moved = f.dir.join("moved-git");
    fs::rename(&original, &moved).unwrap();
    symlink(&moved, &original).unwrap();
    assert!(Repository::open(&f.root).is_err());
    assert!(repo.snapshot("first").is_err());
}
