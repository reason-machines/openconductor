//! Stopping a terminal: hang up its process group, then force it.
//!
//! portable-pty starts the child with `setsid()`, so its pid is also its
//! process group id. SIGHUP goes to that group and to the PTY's foreground
//! group (a job-control shell runs jobs in their own groups); if the main
//! process is still alive after [`KILL_GRACE`], both groups get SIGKILL.
//! Background jobs that ignore SIGHUP therefore die with the terminal.

use std::sync::Arc;
use std::thread;
use std::time::Duration;

use super::manager::Session;
use super::spawn::Result;

/// Time between SIGHUP and SIGKILL.
const KILL_GRACE: Duration = Duration::from_millis(2000);

pub(crate) fn stop(s: Arc<Session>) -> Result<()> {
    hang_up(&s);
    thread::Builder::new()
        .name("pty-kill".into())
        .spawn(move || {
            if s.wait_exit(KILL_GRACE).is_none() {
                force_kill(&s);
            }
        })?;
    Ok(())
}

#[cfg(unix)]
fn signal_groups(s: &Session, sig: libc::c_int) {
    if let Some(pid) = s.pid {
        let r = unsafe { libc::killpg(pid as libc::pid_t, sig) };
        eprintln!("DIAG killpg({pid}, {sig}) = {r} {}", std::io::Error::last_os_error());
    }
    let fg = s.master.lock().unwrap().process_group_leader();
    if let Some(pgrp) = fg {
        let r = unsafe { libc::killpg(pgrp, sig) };
        eprintln!("DIAG killpg(fg {pgrp}, {sig}) = {r} {}", std::io::Error::last_os_error());
    } else {
        eprintln!("DIAG no foreground group");
    }
}

#[cfg(unix)]
fn hang_up(s: &Session) {
    signal_groups(s, libc::SIGHUP);
}

#[cfg(unix)]
fn force_kill(s: &Session) {
    signal_groups(s, libc::SIGKILL);
    let _ = s.killer.lock().unwrap().kill();
}

#[cfg(not(unix))]
fn hang_up(s: &Session) {
    let _ = s.killer.lock().unwrap().kill();
}

#[cfg(not(unix))]
fn force_kill(s: &Session) {
    let _ = s.killer.lock().unwrap().kill();
}
