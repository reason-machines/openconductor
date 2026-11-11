use super::{alacritty_search_path, find, run_alacritty_folder, run_macos_open, AlacrittyExit};
use std::collections::VecDeque;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

type Call = (String, Vec<String>);

fn launch(outcomes: Vec<Result<AlacrittyExit, String>>) -> (Result<(), String>, Vec<Call>) {
    let mut outcomes = VecDeque::from(outcomes);
    let mut calls = Vec::new();
    let result = run_alacritty_folder(
        Path::new("/Users/me/workspaces/app with spaces"),
        |program, args| {
            calls.push((program.to_string(), args.to_vec()));
            outcomes.pop_front().expect("unexpected command")
        },
    );
    assert!(outcomes.is_empty(), "expected command was not attempted");
    (result, calls)
}

fn ipc() -> Call {
    (
        "alacritty".into(),
        vec![
            "msg".into(),
            "create-window".into(),
            "--working-directory".into(),
            "/Users/me/workspaces/app with spaces".into(),
        ],
    )
}

fn fallback() -> Call {
    (
        "open".into(),
        vec![
            "-na".into(),
            "Alacritty".into(),
            "--args".into(),
            "--working-directory".into(),
            "/Users/me/workspaces/app with spaces".into(),
        ],
    )
}

#[test]
fn completed_ipc_success_activates_even_if_activation_exits_nonzero() {
    let (result, calls) = launch(vec![
        Ok(AlacrittyExit::Success),
        Ok(AlacrittyExit::Nonzero("activation status".into())),
    ]);
    assert_eq!(result, Ok(()));
    assert_eq!(calls, vec![ipc(), ("open".into(), vec!["-a".into(), "Alacritty".into()])]);
}

#[test]
fn ipc_transport_failure_propagates_without_launching_a_new_instance() {
    let (result, calls) = launch(vec![Err("transport unavailable".into())]);
    assert_eq!(result, Err("transport unavailable".into()));
    assert_eq!(calls, vec![ipc()]);
}

#[test]
fn activation_transport_failure_propagates_without_fallback() {
    let (result, calls) = launch(vec![
        Ok(AlacrittyExit::Success),
        Err("activation transport".into()),
    ]);
    assert_eq!(result, Err("activation transport".into()));
    assert_eq!(calls, vec![ipc(), ("open".into(), vec!["-a".into(), "Alacritty".into()])]);
}

#[test]
fn completed_ipc_failure_falls_back_with_explicit_working_directory() {
    let (result, calls) = launch(vec![
        Ok(AlacrittyExit::Nonzero("no socket".into())),
        Ok(AlacrittyExit::Success),
    ]);
    assert_eq!(result, Ok(()));
    assert_eq!(calls, vec![ipc(), fallback()]);
}

#[test]
fn fallback_reports_both_completed_failure_and_transport_failure() {
    for outcome in [
        Ok(AlacrittyExit::Nonzero("new instance failed".into())),
        Err("new instance failed".into()),
    ] {
        let (result, calls) = launch(vec![
            Ok(AlacrittyExit::Nonzero("no socket".into())),
            outcome,
        ]);
        assert_eq!(result, Err("new instance failed".into()));
        assert_eq!(calls, vec![ipc(), fallback()]);
    }
}

#[test]
fn alacritty_file_open_retains_existing_parent_folder_command() {
    let mut calls = Vec::new();
    let result = run_macos_open(
        find("alacritty").unwrap(),
        Path::new("/workspace/src/main.rs"),
        true,
        |program, args| {
            calls.push((program.to_string(), args.to_vec()));
            Ok(())
        },
    );
    assert_eq!(result, Ok(()));
    assert_eq!(
        calls,
        vec![("open".into(), vec!["-a".into(), "Alacritty".into(), "/workspace/src".into()])],
    );
}

#[test]
fn alacritty_bundle_paths_follow_existing_search_directories() {
    let paths = alacritty_search_path(Some(OsStr::new("/usr/bin:/opt/homebrew/bin")), Some(OsStr::new("/Users/me"))).unwrap();
    assert_eq!(
        std::env::split_paths(&paths).collect::<Vec<_>>(),
        vec![
            PathBuf::from("/usr/bin"),
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/Applications/Alacritty.app/Contents/MacOS"),
            PathBuf::from("/Users/me/Applications/Alacritty.app/Contents/MacOS"),
        ],
    );
    let paths = alacritty_search_path(None, None).unwrap();
    assert_eq!(
        std::env::split_paths(&paths).collect::<Vec<_>>(),
        vec![PathBuf::from("/Applications/Alacritty.app/Contents/MacOS")],
    );
}
