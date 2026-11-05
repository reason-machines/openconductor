use super::*;

#[cfg(unix)]
fn alive(pid: i32) -> bool {
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

// DIAG (temporary, not for merge): describe a process and its pty.
#[cfg(unix)]
fn diag_proc(pid: i32) -> String {
    let status = std::fs::read_to_string(format!("/proc/{pid}/status"))
        .map(|s| {
            s.lines()
                .filter(|l| {
                    ["Name", "State", "PPid", "NSpgid", "NSsid", "SigBlk", "SigIgn", "SigCgt", "SigPnd", "ShdPnd"]
                        .iter()
                        .any(|k| l.starts_with(&format!("{k}:")))
                })
                .collect::<Vec<_>>()
                .join(" | ")
        })
        .unwrap_or_else(|e| format!("<{e}>"));
    let fds = std::fs::read_dir(format!("/proc/{pid}/fd"))
        .map(|d| {
            d.flatten()
                .map(|e| {
                    format!(
                        "{}->{}",
                        e.file_name().to_string_lossy(),
                        std::fs::read_link(e.path()).map(|p| p.display().to_string()).unwrap_or_default()
                    )
                })
                .collect::<Vec<_>>()
                .join(",")
        })
        .unwrap_or_default();
    let cmd = std::fs::read(format!("/proc/{pid}/cmdline"))
        .map(|b| String::from_utf8_lossy(&b).replace('\0', " "))
        .unwrap_or_default();
    format!("pid {pid}: {status} | fds {fds} | cmd {cmd}")
}

#[cfg(unix)]
fn diag_holders(tty: &str) -> String {
    let mut out = Vec::new();
    for e in std::fs::read_dir("/proc").into_iter().flatten().flatten() {
        let Ok(pid) = e.file_name().to_string_lossy().parse::<i32>() else { continue };
        let holds = std::fs::read_dir(format!("/proc/{pid}/fd"))
            .map(|d| d.flatten().any(|f| std::fs::read_link(f.path()).is_ok_and(|p| p.to_string_lossy() == tty)))
            .unwrap_or(false);
        if holds {
            out.push(diag_proc(pid));
        }
    }
    out.join("\n    ")
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
    let shpid = m.pid(&id).unwrap().unwrap() as i32;
    let tty = std::fs::read_link(format!("/proc/{shpid}/fd/0"))
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    let before = format!("sh {}\n  bg {}", diag_proc(shpid), diag_proc(bg));
    let started = Instant::now();
    m.kill(&id).unwrap();
    let (code, signal) = ev.wait_exit(&id);
    assert!(signal.is_some(), "killed by a signal");
    assert!(started.elapsed() < Duration::from_secs(5));
    let deadline = Instant::now() + Duration::from_secs(5);
    while alive(bg) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
    if alive(bg) {
        eprintln!(
            "DIAG survivor: tty {tty} exit ({code},{signal:?}) after {:?}\n before kill:\n  {before}\n now:\n  bg {}\n  tty holders:\n    {}",
            started.elapsed(),
            diag_proc(bg),
            diag_holders(&tty)
        );
        let ps = std::process::Command::new("ps")
            .args(["-eo", "pid,ppid,pgid,sid,tty,stat,etimes,args"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default();
        eprintln!("DIAG ps:\n{ps}");
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
