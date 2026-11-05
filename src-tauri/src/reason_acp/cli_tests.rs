//! Finding the CLI, the argument list and a real spawn of a fake `reason`.

use super::cli::{find_reason_cli, AgentProcess, LaunchConfig, LaunchError};
use std::fs;
use std::io::{BufRead, BufReader};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("reason-acp-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir.canonicalize().unwrap()
}

fn script(dir: &Path, body: &str, mode: u32) -> PathBuf {
    fs::create_dir_all(dir).unwrap();
    let path = dir.join("reason");
    fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(mode)).unwrap();
    path
}

#[test]
fn finds_the_first_executable_on_path_then_the_install_folder() {
    let root = temp_dir("find");
    let (a, b, home) = (root.join("a"), root.join("b"), root.join("home"));
    script(&a, "", 0o644); // not executable: skipped
    let want = script(&b, "", 0o755);
    let path = std::env::join_paths([PathBuf::from("rel/bin"), a, b]).unwrap();
    assert_eq!(find_reason_cli(Some(&path), None), Some(want));

    let installed = script(&home.join(".local/bin"), "", 0o755);
    let empty = root.join("empty");
    assert_eq!(
        find_reason_cli(Some(empty.as_os_str()), Some(&home)),
        Some(installed)
    );
}

#[test]
fn args_put_workspace_before_acp_and_accept_defaults() {
    let cfg = LaunchConfig::new("/usr/local/bin/reason").unwrap();
    assert_eq!(cfg.args(), ["acp", "-y"]);
    let cfg = cfg
        .workspace("reason-tests")
        .unwrap()
        .model("byok:anthropic:claude-opus-5-5")
        .unwrap()
        .reasoning_effort("high")
        .unwrap();
    assert_eq!(
        cfg.args(),
        [
            "--workspace",
            "reason-tests",
            "acp",
            "-y",
            "--model",
            "byok:anthropic:claude-opus-5-5",
            "--reasoning-effort",
            "high"
        ]
    );
}

#[test]
fn rejects_relative_paths_and_flag_like_or_odd_values() {
    assert_eq!(
        LaunchConfig::new("reason"),
        Err(LaunchError::RelativeCliPath("reason".into()))
    );
    let cfg = LaunchConfig::new("/bin/reason").unwrap();
    for bad in ["", "--cloud", "a b", "x;rm"] {
        assert!(cfg.clone().workspace(bad).is_err(), "{bad:?} accepted");
    }
}

#[test]
fn spawns_without_a_shell_in_the_folder_and_keeps_stderr() {
    let root = temp_dir("spawn");
    let cli = script(
        &root.join("bin"),
        r#"echo "reason log line" >&2
printf '%s\n' "$PWD" "$@" "$PATH"
read _"#,
        0o755,
    );
    let work = root.join("work");
    fs::create_dir_all(&work).unwrap();
    let cfg = LaunchConfig::new(&cli).unwrap().workspace("ws").unwrap();
    let (mut process, stdin, stdout) = AgentProcess::spawn(&cfg, &work).unwrap();
    let lines: Vec<String> = BufReader::new(stdout)
        .lines()
        .take(5)
        .map(Result::unwrap)
        .collect();
    assert_eq!(lines[0], work.to_str().unwrap());
    assert_eq!(lines[1..5], ["--workspace", "ws", "acp", "-y"]);
    assert!(process.is_running());
    let deadline = Instant::now() + Duration::from_secs(5);
    while process.stderr_tail().is_empty() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(process.stderr_tail(), ["reason log line"]);
    drop(stdin);
    process.kill();
    assert!(!process.is_running());
}

#[test]
fn path_gets_the_cli_folder_for_a_bare_gui_path() {
    let root = temp_dir("path");
    let cli = script(&root.join("bin"), r#"printf '%s\n' "$PATH""#, 0o755);
    let cfg = LaunchConfig::new(&cli).unwrap();
    let (_p, _stdin, stdout) = AgentProcess::spawn(&cfg, &root).unwrap();
    let mut line = String::new();
    BufReader::new(stdout).read_line(&mut line).unwrap();
    let dirs: Vec<_> = std::env::split_paths(line.trim()).collect();
    assert!(dirs.contains(&root.join("bin")), "{line}");
    assert!(dirs.contains(&PathBuf::from("/usr/local/bin")), "{line}");
}

/// Against a real CLI: `REASON_CLI=$(command -v reason) run-rust-tests.sh`.
/// `initialize` needs no sign-in; everything after it does. CI installs the
/// CLI and sets `REASON_ACP_REQUIRE_LIVE=1`, so a missing CLI fails there
/// instead of skipping.
#[test]
fn live_cli_answers_initialize() {
    let Some(cli) = std::env::var_os("REASON_CLI") else {
        assert!(
            std::env::var_os("REASON_ACP_REQUIRE_LIVE").is_none(),
            "REASON_ACP_REQUIRE_LIVE is set but REASON_CLI is not"
        );
        return;
    };
    let cfg = LaunchConfig::new(PathBuf::from(cli)).unwrap();
    let (mut process, stdin, stdout) = AgentProcess::spawn(&cfg, &std::env::temp_dir()).unwrap();
    let conn = super::rpc::RpcConnection::start(stdout, stdin, Box::new(|_, _| {}));
    let params = serde_json::json!({"protocolVersion": 1, "clientCapabilities": {}});
    let init = match conn.call("initialize", params, Some(Duration::from_secs(30))) {
        Ok(v) => v,
        Err(e) => {
            // Give the stderr thread a moment to drain what the CLI logged.
            std::thread::sleep(Duration::from_millis(500));
            panic!(
                "initialize failed: {e:?}; running: {}; stderr:\n{}",
                process.is_running(),
                process.stderr_tail().join("\n")
            );
        }
    };
    assert_eq!(init["agentInfo"]["name"], "reason");
    let caps = &init["agentCapabilities"];
    assert_eq!(caps["loadSession"], true);
    for cap in ["list", "resume", "close"] {
        assert!(caps["sessionCapabilities"].get(cap).is_some(), "{cap}");
    }
}
