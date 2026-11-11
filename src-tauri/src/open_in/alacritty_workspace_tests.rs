use super::{find, run_macos_open};
use std::path::Path;

#[test]
fn l01_alacritty_workspace_reuses_ipc_then_activates() {
    let dir = Path::new("/Users/me/workspaces/app with spaces");
    let mut calls = Vec::new();
    let result = run_macos_open(find("alacritty").unwrap(), dir, false, |program, args| {
        calls.push((program.to_string(), args.to_vec()));
        Ok(())
    });
    assert_eq!(result, Ok(()));
    assert_eq!(calls, vec![
        ("alacritty".to_string(), vec![
            "msg".to_string(), "create-window".to_string(),
            "--working-directory".to_string(), dir.to_string_lossy().into_owned(),
        ]),
        ("open".to_string(), vec!["-a".to_string(), "Alacritty".to_string()]),
    ]);
}

#[test]
fn l02_alacritty_workspace_starts_a_new_instance_after_ipc_failure() {
    let dir = Path::new("/Users/me/workspaces/app with spaces");
    let mut calls = Vec::new();
    let result = run_macos_open(find("alacritty").unwrap(), dir, false, |program, args| {
        calls.push((program.to_string(), args.to_vec()));
        if calls.len() == 1 { Err("spawn failed".to_string()) } else { Ok(()) }
    });
    assert_eq!(result, Ok(()));
    assert_eq!(calls, vec![
        ("alacritty".to_string(), vec![
            "msg".to_string(), "create-window".to_string(),
            "--working-directory".to_string(), dir.to_string_lossy().into_owned(),
        ]),
        ("open".to_string(), vec![
            "-na".to_string(), "Alacritty".to_string(), "--args".to_string(),
            "--working-directory".to_string(), dir.to_string_lossy().into_owned(),
        ]),
    ]);
}

#[test]
fn l03_alacritty_workspace_reports_the_failed_fallback() {
    let mut calls = Vec::new();
    let result = run_macos_open(
        find("alacritty").unwrap(), Path::new("/workspace"), false,
        |program, args| {
            calls.push((program.to_string(), args.to_vec()));
            if calls.len() == 1 { Err("spawn failed".to_string()) }
            else { Err("start failed".to_string()) }
        },
    );
    assert_eq!(result, Err("start failed".to_string()));
    assert_eq!(calls, vec![
        ("alacritty".to_string(), vec![
            "msg".to_string(), "create-window".to_string(),
            "--working-directory".to_string(), "/workspace".to_string(),
        ]),
        ("open".to_string(), vec![
            "-na".to_string(), "Alacritty".to_string(), "--args".to_string(),
            "--working-directory".to_string(), "/workspace".to_string(),
        ]),
    ]);
}
