//! TEMPORARY (issue #177, removed before merge): the test with the old
//! liveness probe, looped on CI next to the fixed one.
use super::*;

#[cfg(unix)]
fn old_alive(pid: i32) -> bool {
    // A zombie still answers kill(0); look at the state too.
    if unsafe { libc::kill(pid, 0) } != 0 {
        return false;
    }
    match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
        Ok(stat) => !stat
            .rsplit(')')
            .next()
            .is_some_and(|rest| rest.trim_start().starts_with('Z')),
        Err(_) => true,
    }
}

#[cfg(unix)]
#[test]
fn old_probe_kill_stops_the_whole_process_group() {
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
    assert!(old_alive(bg));
    let started = Instant::now();
    m.kill(&id).unwrap();
    let (_, signal) = ev.wait_exit(&id);
    assert!(signal.is_some(), "killed by a signal");
    assert!(started.elapsed() < Duration::from_secs(5));
    let deadline = Instant::now() + Duration::from_secs(5);
    while old_alive(bg) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(!old_alive(bg), "background job {bg} survived kill");
    assert!(m.ids().is_empty());
}
