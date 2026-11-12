use super::commands::open_in_app;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

const CLI_SHIM: &str = r#"#!/bin/sh
{
  printf '%s\n' wezterm "$PATH"
  printf '%s\n' "$@"
  printf '%s\n' --END--
} >> "$OC_WZ_LOG"
case "$OC_WZ_CASE" in
  start_transport|activation_transport) /bin/rm "$OC_WZ_ROOT/bin/open" ;;
esac
exit "$OC_WZ_SPAWN"
"#;

const OPEN_SHIM: &str = r#"#!/bin/sh
{
  printf '%s\n' open "$PATH"
  printf '%s\n' "$@"
  printf '%s\n' --END--
} >> "$OC_WZ_LOG"
if [ "$3" = --args ]; then
  if [ "$OC_WZ_CASE" = folder_transport ]; then /bin/rm "$0"; fi
  exit "$OC_WZ_START"
fi
if [ "$#" = 2 ]; then exit "$OC_WZ_ACTIVATE"; fi
printf '%s' "$OC_WZ_STDERR" >&2
printf '%s' "$OC_WZ_STDOUT"
exit "$OC_WZ_FOLDER"
"#;

fn run_case(case: &str, spawn: &str, start: &str, folder: &str, stderr: &str, stdout: &str) {
    let root = std::env::temp_dir().join(format!("oc-wezterm-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(root.join("bin")).unwrap();
    fs::create_dir_all(root.join("home")).unwrap();
    fs::create_dir_all(root.join("app with spaces 'and quotes'")).unwrap();
    for (name, script) in [("wezterm", CLI_SHIM), ("open", OPEN_SHIM)] {
        let path = root.join("bin").join(name);
        fs::write(&path, script).unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let root = root.canonicalize().unwrap();
    let output = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "open_in::wezterm_folder_tests::launch_child", "--nocapture"])
        .env("OC_WZ_CASE", case)
        .env("OC_WZ_ROOT", &root)
        .env("OC_WZ_LOG", root.join("calls"))
        .env("OC_WZ_SPAWN", spawn)
        .env("OC_WZ_START", start)
        .env("OC_WZ_FOLDER", folder)
        .env("OC_WZ_ACTIVATE", if case == "activation_nonzero" { "7" } else { "0" })
        .env("OC_WZ_STDERR", stderr)
        .env("OC_WZ_STDOUT", stdout)
        .env("PATH", root.join("bin"))
        .env("HOME", root.join("home"))
        .output()
        .unwrap();
    fs::remove_dir_all(root).unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        output.status.success(),
        "case {case}:\n{stdout}\n{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(stdout.contains("test result: ok. 1 passed"), "child test did not run: {stdout}");
}

#[test]
fn w01_nonzero_start_falls_back_to_opening_the_folder() {
    run_case("second_fallback", "1", "2", "0", "", "");
}

#[test]
fn w02_second_fallback_preserves_folder_stderr() {
    run_case("stderr_error", "1", "127", "3", "folder refused\n", "other");
    run_case("whitespace_error", "1", "127", "3", " \n", "other");
}

#[test]
fn w03_second_fallback_uses_stdout_then_exit_code() {
    run_case("stdout_error", "1", "127", "7", "", "folder output\n");
    run_case("exit_error", "1", "127", "7", "", "");
}

#[test]
fn w04_successful_start_does_not_open_the_folder_again() {
    run_case("start_ok", "1", "0", "9", "", "");
}

#[test]
fn w05_successful_mux_spawn_only_activates_the_application() {
    run_case("spawn_ok", "0", "9", "9", "", "");
}

#[test]
fn w06_start_transport_error_does_not_try_the_second_fallback() {
    run_case("start_transport", "1", "0", "0", "", "");
}

#[test]
fn w07_completed_activation_failure_does_not_start_again() {
    run_case("activation_nonzero", "0", "9", "9", "", "");
}

#[test]
fn w08_activation_transport_error_does_not_start_again() {
    run_case("activation_transport", "0", "0", "0", "", "");
}

#[test]
fn w09_folder_transport_error_is_not_a_completed_folder_failure() {
    run_case("folder_transport", "1", "2", "0", "", "");
}

fn expected_call(program: &str, path: &str, args: &[&str]) -> Vec<String> {
    std::iter::once(program)
        .chain(std::iter::once(path))
        .chain(args.iter().copied())
        .map(str::to_string)
        .collect()
}

#[test]
fn launch_child() {
    let Ok(case) = std::env::var("OC_WZ_CASE") else {
        return;
    };
    let root_string = std::env::var("OC_WZ_ROOT").unwrap();
    let root = Path::new(&root_string);
    let dir = root.join("app with spaces 'and quotes'");
    let dir_string = dir.to_string_lossy().into_owned();
    let inherited_path = root.join("bin").to_string_lossy().into_owned();
    let path = std::env::join_paths([
        root.join("bin"),
        "/Applications/WezTerm.app/Contents/MacOS".into(),
        root.join("home/Applications/WezTerm.app/Contents/MacOS"),
    ])
    .unwrap();
    let bundle_path = path.to_string_lossy().into_owned();
    let spawn = expected_call("wezterm", &bundle_path, &["cli", "spawn", "--cwd", &dir_string]);
    let start = expected_call(
        "open",
        &bundle_path,
        &["-a", "WezTerm", "--args", "start", "--cwd", &dir_string],
    );
    let folder = expected_call("open", &bundle_path, &["-a", "WezTerm", &dir_string]);
    let activate = expected_call("open", &inherited_path, &["-a", "WezTerm"]);
    let result = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(open_in_app("wezterm".to_string(), dir_string, None));
    let calls: Vec<Vec<String>> = fs::read_to_string(root.join("calls"))
        .unwrap_or_default()
        .split("--END--\n")
        .filter(|call| !call.is_empty())
        .map(|call| call.lines().map(str::to_string).collect())
        .collect();
    let expected = match case.as_str() {
        "second_fallback" => {
            assert_eq!(result, Ok(()));
            vec![spawn, start, folder]
        }
        "stderr_error" | "whitespace_error" | "stdout_error" | "exit_error" => {
            let message = match case.as_str() {
                "stderr_error" => "folder refused\n",
                "whitespace_error" => " \n",
                "stdout_error" => "folder output\n",
                _ => "exit code 7",
            };
            assert_eq!(result, Err(message.to_string()));
            vec![spawn, start, folder]
        }
        "start_ok" => {
            assert_eq!(result, Ok(()));
            vec![spawn, start]
        }
        "spawn_ok" | "activation_nonzero" => {
            assert_eq!(result, Ok(()));
            vec![spawn, activate]
        }
        "start_transport" | "activation_transport" => {
            assert!(result.is_err_and(|error| error.starts_with("open:")));
            vec![spawn]
        }
        "folder_transport" => {
            assert!(result.is_err_and(|error| error.starts_with("open:")));
            vec![spawn, start]
        }
        _ => panic!("unknown fixture case"),
    };
    assert_eq!(calls, expected);
}
