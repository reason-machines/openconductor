//! Screens kept for running terminals, and mirrors.

use super::*;

/// Poll until the terminal's screen text contains `needle`.
fn wait_screen(m: &PtyManager, id: &str, needle: &str) -> String {
    let deadline = Instant::now() + WAIT;
    loop {
        let text = m.screen_text(id, usize::MAX).unwrap();
        if text.contains(needle) {
            return text;
        }
        assert!(
            Instant::now() < deadline,
            "screen never showed {needle:?}: {text:?}"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn a_terminal_screen_follows_its_output() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    // Overwrite with \r and erase a line, so the screen differs from the raw
    // byte stream: only a parsed screen shows "done" without "working".
    let id = m
        .spawn(SpawnRequest::argv(
            std::env::temp_dir(),
            sh("printf 'one\\r\\ntwo\\r\\nworking\\r\\033[2Kdone\\r\\n'; read x"),
        ))
        .unwrap();
    let text = wait_screen(&m, &id, "done");
    assert_eq!(text, "one\ntwo\ndone");
    assert_eq!(m.screen_text(&id, 2).unwrap(), "two\ndone");

    let snap = m.screen_snapshot(&id).unwrap();
    assert_eq!((snap.cols, snap.rows), (80, 24));
    assert!(!snap.modes.alternate_screen);
    let mut restored = ScreenState::new(snap.cols, snap.rows, 100);
    restored.write(snap.rehydrate_sequences.as_bytes());
    restored.write(snap.snapshot_ansi.as_bytes());
    assert_eq!(restored.text(usize::MAX), text);

    m.kill(&id).unwrap();
    assert!(matches!(
        m.screen_text(&id, 1),
        Err(TerminalError::NotFound(_))
    ));
}

#[test]
fn a_terminal_screen_tracks_modes_cwd_and_resize() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let id = m
        .spawn(SpawnRequest::argv(
            std::env::temp_dir(),
            sh("printf '\\033]7;file://host/tmp/a%%20b\\007\\033[?2004h\\033[?1049hALT'; read x"),
        ))
        .unwrap();
    wait_screen(&m, &id, "ALT");
    let snap = m.screen_snapshot(&id).unwrap();
    assert_eq!(snap.cwd.as_deref(), Some("/tmp/a b"));
    assert!(snap.modes.alternate_screen && snap.modes.bracketed_paste);

    m.resize(&id, 40, 10).unwrap();
    let snap = m.screen_snapshot(&id).unwrap();
    assert_eq!((snap.cols, snap.rows), (40, 10));
}

#[test]
fn an_exited_terminal_keeps_its_screen_until_killed() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let id = m
        .spawn(SpawnRequest::argv(
            std::env::temp_dir(),
            sh("echo last words"),
        ))
        .unwrap();
    ev.wait_exit(&id);
    assert_eq!(m.screen_text(&id, usize::MAX).unwrap(), "last words");
}

#[test]
fn write_mirror_on_a_terminal_feeds_its_screen_not_the_program() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    // The program echoes the first line it reads, then waits.
    let id = m
        .spawn(SpawnRequest::argv(
            std::env::temp_dir(),
            sh("stty -echo; read l; echo \"got:$l\"; read x"),
        ))
        .unwrap();
    m.write_mirror(&id, b"restored\r\n").unwrap();
    assert_eq!(m.screen_text(&id, usize::MAX).unwrap(), "restored");
    m.write(&id, b"typed\r").unwrap();
    let text = wait_screen(&m, &id, "got:");
    assert!(text.contains("got:typed"), "{text:?}");
    assert!(!ev.output(&id).contains("restored"));
}

#[test]
fn mirrors_are_screens_without_a_program() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let id = "remote-terminal-mirror:s1";
    m.create_mirror(id, 20, 5, None).unwrap();
    assert_eq!(m.mirror_ids(), vec![id.to_owned()]);
    assert!(m.ids().is_empty(), "a mirror is not a terminal");

    // A UTF-8 sequence split across writes still lands as one character.
    let bytes = "héllo\r\nwide 世界\r\n".as_bytes();
    let split = bytes.iter().position(|&b| b == 0xC3).unwrap() + 1;
    m.write_mirror(id, &bytes[..split]).unwrap();
    m.write_mirror(id, &bytes[split..]).unwrap();
    assert_eq!(m.screen_text(id, usize::MAX).unwrap(), "héllo\nwide 世界");

    let snap = m.screen_snapshot(id).unwrap();
    assert_eq!((snap.cols, snap.rows), (20, 5));
    m.resize_mirror(id, 10, 3).unwrap();
    let snap = m.screen_snapshot(id).unwrap();
    assert_eq!((snap.cols, snap.rows), (10, 3));

    // Creating it again starts it over.
    m.create_mirror(id, 20, 5, Some(4096)).unwrap();
    assert_eq!(m.screen_text(id, usize::MAX).unwrap(), "");

    m.delete_mirror(id).unwrap();
    assert!(m.mirror_ids().is_empty());
    for e in [
        m.write_mirror(id, b"x").err(),
        m.resize_mirror(id, 10, 10).err(),
        m.delete_mirror(id).err(),
    ] {
        let e = e.expect("mirror is gone");
        assert!(matches!(e, TerminalError::MirrorNotFound(_)));
        assert_eq!(e.to_string(), format!("PTY mirror not found: {id}"));
    }
    assert!(matches!(
        m.screen_text(id, 1),
        Err(TerminalError::NotFound(_))
    ));
}

#[test]
fn mirror_sizes_are_checked_and_ids_do_not_shadow_terminals() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    assert!(matches!(
        m.create_mirror("m", 0, 5, None),
        Err(TerminalError::InvalidSize { .. })
    ));
    m.create_mirror("m", 10, 5, None).unwrap();
    assert!(matches!(
        m.resize_mirror("m", 10, 0),
        Err(TerminalError::InvalidSize { .. })
    ));

    let mut req = SpawnRequest::argv(std::env::temp_dir(), sh("read x"));
    req.id = Some("tab-1".into());
    m.spawn(req).unwrap();
    assert!(matches!(
        m.create_mirror("tab-1", 10, 5, None),
        Err(TerminalError::DuplicateId(_))
    ));
}

#[test]
fn mirror_scrollback_follows_max_buffered_bytes() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    // 10 columns and 200 bytes: 20 rows of scrollback above the 5-row
    // screen. The cursor sits on the last, blank row, so 24 lines remain.
    m.create_mirror("m", 10, 5, Some(200)).unwrap();
    let lines: String = (0..100).map(|i| format!("{i}\r\n")).collect();
    m.write_mirror("m", lines.as_bytes()).unwrap();
    let text = m.screen_text("m", usize::MAX).unwrap();
    let kept: Vec<_> = text.lines().collect();
    assert_eq!(kept.len(), 24, "{text:?}");
    assert_eq!(kept.first(), Some(&"76"));
    assert_eq!(kept.last(), Some(&"99"));
}
