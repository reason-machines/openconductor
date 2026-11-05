use super::*;

/// Whether `pid` is still running, from one read of `/proc/<pid>/stat`.
///
/// A killed background job is reparented and reaped by init, so it goes
/// zombie (`Z`), then dead (`X`), then has no entry at all; each of those
/// means gone. Asking `kill(pid, 0)` first and reading the state afterwards
/// raced with the reaper: the job could be reaped between the two calls, and
/// the failed read counted as alive (issue #177).
#[cfg(target_os = "linux")]
fn alive(pid: i32) -> bool {
    std::fs::read_to_string(format!("/proc/{pid}/stat")).is_ok_and(|stat| {
        let state = stat
            .rsplit(')')
            .next()
            .and_then(|rest| rest.trim_start().chars().next());
        !matches!(state, Some('Z' | 'X'))
    })
}

/// No `/proc`: `kill(pid, 0)` also answers for a zombie, which only makes the
/// wait for it longer; once the job is reaped it fails for good.
#[cfg(all(unix, not(target_os = "linux")))]
fn alive(pid: i32) -> bool {
    unsafe { libc::kill(pid, 0) == 0 }
}

#[cfg(unix)]
#[test]
fn kill_stops_the_whole_process_group() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let id = m
        .spawn(SpawnRequest::argv(
            std::env::temp_dir(),
            sh("sleep 300 & echo BG:$!; wait"),
        ))
        .unwrap();
    let out = ev.wait_output(&id, "\n");
    let bg: i32 = out
        .trim()
        .strip_prefix("BG:")
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or_else(|| panic!("bad output {out:?}"));
    assert!(alive(bg));
    let started = Instant::now();
    m.kill(&id).unwrap();
    let (_, signal) = ev.wait_exit(&id);
    assert!(signal.is_some(), "killed by a signal");
    assert!(started.elapsed() < Duration::from_secs(5));
    let deadline = Instant::now() + Duration::from_secs(5);
    while alive(bg) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(!alive(bg), "background job {bg} survived kill");
    assert!(m.ids().is_empty());
}

#[cfg(unix)]
#[test]
fn kill_escalates_when_hangup_is_ignored() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let id = m
        .spawn(SpawnRequest::argv(
            std::env::temp_dir(),
            // The background job inherits the ignored SIGHUP, so only a
            // SIGKILL sent to the whole group stops it.
            sh("trap '' HUP; sleep 300 & echo BG:$!; while :; do sleep 1; done"),
        ))
        .unwrap();
    let out = ev.wait_output(&id, "\n");
    let bg: i32 = out
        .trim()
        .strip_prefix("BG:")
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or_else(|| panic!("bad output {out:?}"));
    m.kill(&id).unwrap();
    let (_, signal) = ev.wait_exit(&id);
    assert!(signal.is_some());
    let deadline = Instant::now() + Duration::from_secs(5);
    while alive(bg) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(
        !alive(bg),
        "background job {bg} survived SIGKILL escalation"
    );
}
