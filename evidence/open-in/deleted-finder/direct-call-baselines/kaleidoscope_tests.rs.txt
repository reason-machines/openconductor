use super::commands::open_in_app;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

const GIT_SHIM: &str = r#"#!/bin/sh
{
  printf '%s\n' git "$PATH"
  printf '%s\n' "$@"
  printf '%s\n' --END--
} >> "$OC_KS_LOG"
if [ "$3" = diff ]; then
  if [ "$OC_KS_CASE" = difftool_transport ]; then /bin/rm "$0"; fi
  if [ "$OC_KS_PROBE" = signal ]; then kill -TERM $$; fi
  exit "$OC_KS_PROBE"
fi
exit "$OC_KS_DIFFTOOL"
"#;

const OPEN_SHIM: &str = r#"#!/bin/sh
{
  printf '%s\n' open "$PATH"
  printf '%s\n' "$@"
  printf '%s\n' --END--
} >> "$OC_KS_LOG"
printf '%s' "$OC_KS_STDERR" >&2
printf '%s' "$OC_KS_STDOUT"
exit "$OC_KS_OPEN"
"#;

const DIFFTOOL_CONFIG: &str =
    "difftool.ksdiff.cmd=ksdiff --partial-changeset --relative-path \"$MERGED\" -- \"$LOCAL\" \"$REMOTE\"";

fn run_case(case: &str, probe: &str, difftool: &str, open: &str, stderr: &str, stdout: &str) {
    let root = std::env::temp_dir().join(format!("oc-kaleidoscope-{}", uuid::Uuid::new_v4()));
    let bin = root.join("bin");
    fs::create_dir_all(&bin).unwrap();
    fs::create_dir_all(root.join("home")).unwrap();
    fs::create_dir_all(root.join("app with spaces 'and quotes'")).unwrap();
    for (name, script) in [("git", GIT_SHIM), ("open", OPEN_SHIM)] {
        let path = bin.join(name);
        fs::write(&path, script).unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }
    if case == "probe_transport" {
        fs::remove_file(bin.join("git")).unwrap();
    }
    let root = root.canonicalize().unwrap();
    let output = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "open_in::kaleidoscope_tests::launch_child", "--nocapture"])
        .env("OC_KS_CASE", case)
        .env("OC_KS_ROOT", &root)
        .env("OC_KS_LOG", root.join("calls"))
        .env("OC_KS_PROBE", probe)
        .env("OC_KS_DIFFTOOL", difftool)
        .env("OC_KS_OPEN", open)
        .env("OC_KS_STDERR", stderr)
        .env("OC_KS_STDOUT", stdout)
        .env("PATH", root.join("bin"))
        .env("HOME", root.join("home"))
        .output()
        .unwrap();
    fs::remove_dir_all(root).unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success(), "case {case}:\n{stdout}\n{}",
        String::from_utf8_lossy(&output.stderr));
    assert!(stdout.contains("test result: ok. 1 passed"), "child test did not run: {stdout}");
}

#[test]
fn k01_dirty_head_opens_the_partial_changeset() {
    run_case("dirty", "1", "0", "0", "", "");
}

#[test]
fn k02_clean_head_opens_the_folder() {
    run_case("clean", "0", "0", "0", "", "");
}

#[test]
fn k03_other_completed_probe_codes_open_the_folder() {
    for code in ["2", "128", "signal"] {
        run_case("other", code, "0", "0", "", "");
    }
}

#[test]
fn k04_difftool_nonzero_falls_back_to_the_folder() {
    run_case("fallback", "1", "127", "0", "", "");
}

#[test]
fn k05_failed_folder_fallback_preserves_its_stderr() {
    run_case("fallback_error", "1", "127", "1", "folder rejected\n", "other");
}

#[test]
fn k06_probe_transport_error_does_not_open_the_folder() {
    run_case("probe_transport", "1", "0", "0", "", "");
}

#[test]
fn k07_difftool_transport_error_does_not_fall_back() {
    run_case("difftool_transport", "1", "0", "0", "", "");
}

#[test]
fn k08_folder_failure_uses_stdout_then_exit_code() {
    run_case("stdout_error", "0", "0", "7", "", "open output\n");
    run_case("exit_error", "0", "0", "7", "", "");
}

fn expected_call(program: &str, path: &str, args: &[&str]) -> Vec<String> {
    std::iter::once(program).chain(std::iter::once(path)).chain(args.iter().copied())
        .map(str::to_string).collect()
}

// The parent re-executes only this test with an isolated PATH/HOME per case.
#[test]
fn launch_child() {
    let Ok(case) = std::env::var("OC_KS_CASE") else { return };
    let root_string = std::env::var("OC_KS_ROOT").unwrap();
    let root = Path::new(&root_string);
    let dir = root.join("app with spaces 'and quotes'");
    let path = std::env::join_paths([
        root.join("bin"),
        "/Applications/Kaleidoscope.app/Contents/MacOS".into(),
        root.join("home/Applications/Kaleidoscope.app/Contents/MacOS"),
    ]).unwrap();
    let inherited_path = root.join("bin").to_string_lossy().into_owned();
    let bundle_path = path.to_string_lossy().into_owned();
    let dir_string = dir.to_string_lossy().into_owned();
    let probe = expected_call("git", &inherited_path,
        &["-C", &dir_string, "diff", "--quiet", "HEAD"]);
    let difftool = expected_call("git", &bundle_path,
        &["-C", &dir_string, "-c", DIFFTOOL_CONFIG, "difftool", "--tool=ksdiff", "--no-prompt", "HEAD"]);
    let folder = expected_call("open", &bundle_path, &["-a", "Kaleidoscope", &dir_string]);
    let result = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()
        .block_on(open_in_app("kaleidoscope".to_string(), dir_string));
    let calls: Vec<Vec<String>> = fs::read_to_string(root.join("calls")).unwrap_or_default()
        .split("--END--\n").filter(|call| !call.is_empty())
        .map(|call| call.lines().map(str::to_string).collect()).collect();
    let expected = match case.as_str() {
        "dirty" => { assert_eq!(result, Ok(())); vec![probe, difftool] }
        "clean" | "other" => { assert_eq!(result, Ok(())); vec![probe, folder] }
        "fallback" => { assert_eq!(result, Ok(())); vec![probe, difftool, folder] }
        "fallback_error" => {
            assert_eq!(result, Err("folder rejected\n".to_string()));
            vec![probe, difftool, folder]
        }
        "probe_transport" => {
            assert!(result.is_err_and(|e| e.starts_with("git:")));
            vec![]
        }
        "difftool_transport" => {
            assert!(result.is_err_and(|e| e.starts_with("git:")));
            vec![probe]
        }
        "stdout_error" => {
            assert_eq!(result, Err("open output\n".to_string()));
            vec![probe, folder]
        }
        "exit_error" => {
            assert_eq!(result, Err("exit code 7".to_string()));
            vec![probe, folder]
        }
        _ => panic!("unknown fixture case"),
    };
    assert_eq!(calls, expected);
}
