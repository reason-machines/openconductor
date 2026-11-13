use serde_json::{json, Value};
use std::fs;
use std::os::unix::fs::{symlink, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Command;

struct Fixture {
    root: PathBuf,
    workspace: PathBuf,
    bin: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("oc-vscode-safety-{}", uuid::Uuid::new_v4()));
        let workspace = root.join("workspace space");
        let bin = root.join("bin");
        fs::create_dir_all(workspace.join("src")).unwrap();
        fs::create_dir_all(root.join("outside")).unwrap();
        fs::create_dir_all(&bin).unwrap();
        fs::write(workspace.join("src/present.ts"), "inside").unwrap();
        fs::write(root.join("outside/present.ts"), "outside").unwrap();
        for program in ["code", "open"] {
            let executable = bin.join(program);
            fs::write(&executable, format!("#!/bin/sh\nprintf '%s\\n' '{program}' >> \"$OC_CALLS\"\nexit 0\n")).unwrap();
            fs::set_permissions(executable, fs::Permissions::from_mode(0o700)).unwrap();
        }
        Self { root, workspace, bin }
    }

    fn request(&self, target: &Path, workspace: &Path) -> (Value, Vec<String>) {
        let capture = self.root.join("calls");
        let response_path = self.root.join("response.json");
        let output = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "open_in::vscode_workspace_context_ipc::ipc_child", "--nocapture"])
            .env("PATH", &self.bin)
            .env("HOME", self.root.join("home"))
            .env("OC_CALLS", &capture)
            .env("OC_VSCODE_BODY", json!({
                "appId": "vscode", "path": target,
                "fileContext": { "workspacePath": workspace },
            }).to_string())
            .env("OC_VSCODE_RESPONSE", &response_path)
            .output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        let response = serde_json::from_slice(&fs::read(response_path).unwrap()).unwrap();
        let calls = fs::read_to_string(capture).unwrap_or_default().lines().map(str::to_owned).collect();
        (response, calls)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

enum UnsafeContext {
    Outside,
    PrefixSibling,
    Traversal,
    RelativeRoot,
    MissingRoot,
    FileRoot,
    RootTraversal,
    RootSymlink,
    ParentSymlink,
    LeafSymlink,
    BrokenSymlink,
    RelativeTarget,
    MissingTarget,
}

fn reject(case: UnsafeContext) {
    let fixture = Fixture::new();
    let file = fixture.workspace.join("src/present.ts");
    let root = fixture.workspace.clone();
    let (target, workspace) = match case {
        UnsafeContext::Outside => (fixture.root.join("outside/present.ts"), root),
        UnsafeContext::PrefixSibling => {
            let sibling = fixture.root.join("workspace space-sibling");
            fs::create_dir(&sibling).unwrap();
            fs::write(sibling.join("present.ts"), "sibling").unwrap();
            (sibling.join("present.ts"), root)
        }
        UnsafeContext::Traversal => (root.join("src/../../outside/present.ts"), root),
        UnsafeContext::RelativeRoot => (file, PathBuf::from("workspace space")),
        UnsafeContext::MissingRoot => (file, fixture.root.join("missing")),
        UnsafeContext::FileRoot => (file.clone(), file),
        UnsafeContext::RootTraversal => {
            let workspace = root.join("src/..");
            (workspace.join("src/present.ts"), workspace)
        }
        UnsafeContext::RootSymlink => {
            let alias = fixture.root.join("alias");
            symlink(&root, &alias).unwrap();
            (alias.join("src/present.ts"), alias)
        }
        UnsafeContext::ParentSymlink => {
            symlink(fixture.root.join("outside"), root.join("linked")).unwrap();
            (root.join("linked/present.ts"), root)
        }
        UnsafeContext::LeafSymlink => {
            symlink(fixture.root.join("outside/present.ts"), root.join("leaf.ts")).unwrap();
            (root.join("leaf.ts"), root)
        }
        UnsafeContext::BrokenSymlink => {
            symlink(fixture.root.join("outside/missing.ts"), root.join("broken.ts")).unwrap();
            (root.join("broken.ts"), root)
        }
        UnsafeContext::RelativeTarget => (PathBuf::from("src/present.ts"), root),
        UnsafeContext::MissingTarget => (root.join("src/missing.ts"), root),
    };
    let (response, calls) = fixture.request(&target, &workspace);
    assert_eq!(response["ok"], false, "unsafe context was accepted: {response}");
    assert!(response["error"].is_string(), "missing IPC error: {response}");
    assert!(calls.is_empty(), "unsafe context launched a child: {calls:?}");
}

#[test] fn outside_workspace() { reject(UnsafeContext::Outside); }
#[test] fn prefix_sibling() { reject(UnsafeContext::PrefixSibling); }
#[test] fn target_traversal() { reject(UnsafeContext::Traversal); }
#[test] fn relative_workspace() { reject(UnsafeContext::RelativeRoot); }
#[test] fn missing_workspace() { reject(UnsafeContext::MissingRoot); }
#[test] fn file_as_workspace() { reject(UnsafeContext::FileRoot); }
#[test] fn workspace_traversal() { reject(UnsafeContext::RootTraversal); }
#[test] fn symlinked_workspace() { reject(UnsafeContext::RootSymlink); }
#[test] fn symlinked_parent() { reject(UnsafeContext::ParentSymlink); }
#[test] fn symlinked_leaf() { reject(UnsafeContext::LeafSymlink); }
#[test] fn broken_leaf_link() { reject(UnsafeContext::BrokenSymlink); }
#[test] fn relative_target() { reject(UnsafeContext::RelativeTarget); }
#[test] fn missing_target() { reject(UnsafeContext::MissingTarget); }

#[test]
fn valid_context_runs_code_without_open_fallback() {
    let fixture = Fixture::new();
    let (response, calls) = fixture.request(&fixture.workspace.join("src/present.ts"), &fixture.workspace);
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(calls, ["code"]);
}

#[test]
fn missing_cli_is_a_spawn_error_without_open_fallback() {
    let fixture = Fixture::new();
    fs::remove_file(fixture.bin.join("code")).unwrap();
    assert_spawn_error_without_fallback(&fixture);
}

#[test]
fn nonexecutable_cli_is_a_spawn_error_without_open_fallback() {
    let fixture = Fixture::new();
    fs::set_permissions(fixture.bin.join("code"), fs::Permissions::from_mode(0o600)).unwrap();
    assert_spawn_error_without_fallback(&fixture);
}

fn assert_spawn_error_without_fallback(fixture: &Fixture) {
    let mut fallback_called = false;
    let result = super::run_vscode_file(
        &fixture.workspace,
        &fixture.workspace.join("src/present.ts"),
        fixture.bin.as_os_str(),
        || { fallback_called = true; Ok(()) },
    );
    assert!(result.unwrap_err().starts_with("code:"));
    assert!(!fallback_called, "spawn failure invoked the fallback");
    assert!(!fixture.root.join("calls").exists(), "spawn failure ran a child");
}

#[test]
fn cli_search_path_retains_inherited_then_system_and_user_bundles() {
    let inherited = std::env::join_paths(["/fixture/first", "/fixture/second"]).unwrap();
    let home = std::ffi::OsStr::new("/fixture/home space");
    let actual = super::vscode_search_path(Some(&inherited), Some(home)).unwrap();
    assert_eq!(std::env::split_paths(&actual).collect::<Vec<_>>(), [
        PathBuf::from("/fixture/first"),
        PathBuf::from("/fixture/second"),
        PathBuf::from("/Applications/Visual Studio Code.app/Contents/Resources/app/bin"),
        PathBuf::from("/fixture/home space/Applications/Visual Studio Code.app/Contents/Resources/app/bin"),
    ]);
}

#[test]
fn cli_search_path_without_home_keeps_the_system_bundle() {
    let actual = super::vscode_search_path(None, None).unwrap();
    assert_eq!(std::env::split_paths(&actual).collect::<Vec<_>>(), [
        PathBuf::from("/Applications/Visual Studio Code.app/Contents/Resources/app/bin"),
    ]);
}
