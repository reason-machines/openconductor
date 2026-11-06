//! A real zsh started with the integration's environment prints the
//! reference's `OSC 633 ; Conductor` marks, sources the user's own startup
//! files from their home, keeps history there and puts the path prefix on
//! `PATH`. Skipped when zsh is not installed.

use super::*;
use crate::terminal::shell_integration::ShellIntegration;

fn zsh() -> Option<PathBuf> {
    ["/bin/zsh", "/usr/bin/zsh", "/opt/homebrew/bin/zsh"]
        .iter()
        .map(PathBuf::from)
        .find(|p| p.is_file())
}

const MARK: &str = "\x1b]633;Conductor;";

#[test]
fn zsh_prints_command_marks_and_keeps_the_users_setup() {
    let Some(zsh) = zsh() else {
        eprintln!("zsh not installed; skipping");
        return;
    };
    let root = tempdir("zsh-int");
    let home = root.join("home");
    let data = root.join("data");
    let bin = root.join("bin");
    std::fs::create_dir_all(&home).unwrap();
    std::fs::create_dir_all(&bin).unwrap();
    // The user's own files: each leaves a trace, .zshrc sets the prompt.
    std::fs::write(home.join(".zshenv"), "export OC_ENV=env\n").unwrap();
    std::fs::write(
        home.join(".zshrc"),
        "export OC_RC=rc\nPROMPT='user> '\nsetopt INC_APPEND_HISTORY\n",
    )
    .unwrap();
    crate::test_exe::write_executable(
        &bin.join("oc-prefixed"),
        "#!/bin/sh\necho prefixed-tool-ran\n",
        0o755,
    );

    let si = ShellIntegration::new(&data, Some(home.clone()));
    let mut req = SpawnRequest::argv(&root, [zsh.to_string_lossy().into_owned(), "-i".into()]);
    req.env = si.env_for(&zsh).unwrap();
    req.env
        .push(("HOME".into(), home.to_string_lossy().into_owned()));
    req.env.push((
        "CONDUCTOR_PATH_PREFIX".into(),
        bin.to_string_lossy().into_owned(),
    ));
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let id = m.spawn(req).unwrap();

    // The prompt mark comes first, then the user's prompt.
    let out = ev.wait_output(&id, "user> ");
    let prompt_mark = format!("{MARK}Prompt\x07");
    assert!(out.contains(&prompt_mark), "{out:?}");
    assert!(out.find(&prompt_mark) < out.find("user> "), "{out:?}");

    m.write(
        &id,
        b"FOO=1 command oc-prefixed; echo \"$OC_ENV:$OC_RC:$HISTFILE:$ZDOTDIR\"\r",
    )
    .unwrap();
    // precmd prints CommandDone after the command, before the next prompt.
    let out = ev.wait_output(&id, &format!("{MARK}CommandDone;"));
    assert!(out.contains("prefixed-tool-ran"), "PATH prefix: {out:?}");

    // ProgramStart;<marker>;<program>;<command>: the program skips the
    // assignment and `command`; the label is the whole line.
    let start = out
        .find(&format!("{MARK}ProgramStart;"))
        .expect("ProgramStart");
    let rest = &out[start + MARK.len() + "ProgramStart;".len()..];
    let body = &rest[..rest.find('\x07').unwrap()];
    let mut parts = body.splitn(3, ';');
    let marker = parts.next().unwrap();
    assert!(!marker.is_empty());
    assert_eq!(parts.next(), Some("oc-prefixed"));
    assert_eq!(
        parts.next(),
        Some("FOO=1 command oc-prefixed; echo \"$OC_ENV:$OC_RC:$HISTFILE:$ZDOTDIR\"")
    );
    assert!(
        out.contains(&format!("{MARK}CommandDone;{marker}\x07")),
        "{out:?}"
    );

    // The user's files ran, history is the user's, ZDOTDIR is ours.
    let dir = data.join("terminal-shell-integration/zsh");
    let expected = format!(
        "env:rc:{}:{}",
        home.join(".zsh_history").display(),
        dir.display()
    );
    assert!(out.contains(&expected), "want {expected:?} in {out:?}");

    m.write(&id, b"exit\r").unwrap();
    ev.wait_exit(&id);
    let _ = std::fs::remove_dir_all(&root);
}
