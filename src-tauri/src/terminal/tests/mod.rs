use super::*;
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

const WAIT: Duration = Duration::from_secs(10);

#[derive(Clone, Default)]
struct Events(Arc<(Mutex<Vec<PtyEvent>>, Condvar)>);

impl Events {
    fn sink(&self) -> impl EventSink {
        let inner = self.0.clone();
        move |e: PtyEvent| {
            let (lock, cv) = &*inner;
            lock.lock().unwrap().push(e);
            cv.notify_all();
        }
    }

    fn snapshot(&self) -> Vec<PtyEvent> {
        self.0 .0.lock().unwrap().clone()
    }

    /// Wait until `pred` holds for the events so far.
    fn wait_for(&self, what: &str, pred: impl Fn(&[PtyEvent]) -> bool) -> Vec<PtyEvent> {
        let (lock, cv) = &*self.0;
        let guard = lock.lock().unwrap();
        let (guard, res) = cv.wait_timeout_while(guard, WAIT, |ev| !pred(ev)).unwrap();
        assert!(
            !res.timed_out(),
            "timed out waiting for {what}; output so far: {:?}",
            String::from_utf8_lossy(&output_of(&guard, None))
        );
        guard.clone()
    }

    fn output(&self, id: &str) -> String {
        String::from_utf8_lossy(&output_of(&self.snapshot(), Some(id))).into_owned()
    }

    fn wait_output(&self, id: &str, needle: &str) -> String {
        let evs = self.wait_for(needle, |ev| {
            String::from_utf8_lossy(&output_of(ev, Some(id))).contains(needle)
        });
        String::from_utf8_lossy(&output_of(&evs, Some(id))).into_owned()
    }

    fn wait_exit(&self, id: &str) -> (u32, Option<String>) {
        let evs = self.wait_for("exit", |ev| ev.iter().any(|e| is_exit(e, id)));
        evs.into_iter()
            .find_map(|e| match e {
                PtyEvent::Exit {
                    id: eid,
                    exit_code,
                    signal,
                } if eid == id => Some((exit_code, signal)),
                _ => None,
            })
            .unwrap()
    }
}

fn is_exit(e: &PtyEvent, id: &str) -> bool {
    matches!(e, PtyEvent::Exit { id: eid, .. } if eid == id)
}

fn output_of(ev: &[PtyEvent], id: Option<&str>) -> Vec<u8> {
    let mut out = Vec::new();
    for e in ev {
        if let PtyEvent::Data { id: eid, data } = e {
            if id.is_none_or(|id| id == eid) {
                out.extend_from_slice(data);
            }
        }
    }
    out
}

fn tempdir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "oc-term-{tag}-{}-{}",
        std::process::id(),
        Instant::now().elapsed().as_nanos()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn sh(script: &str) -> Vec<String> {
    vec!["/bin/sh".into(), "-c".into(), script.into()]
}

#[test]
fn ready_data_exit_in_order_with_exit_code() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let id = m
        .spawn(SpawnRequest::argv(
            std::env::temp_dir(),
            sh("printf hello; exit 3"),
        ))
        .unwrap();
    assert_eq!(ev.wait_exit(&id), (3, None));
    let evs = ev.snapshot();
    assert!(matches!(&evs[0], PtyEvent::Ready { id: r, pid: Some(_) } if *r == id));
    assert!(
        is_exit(evs.last().unwrap(), &id),
        "exit must be last: {evs:?}"
    );
    assert_eq!(ev.output(&id), "hello");
    // Exited terminals stay inspectable until killed, but refuse input.
    assert_eq!(
        m.exit_info(&id).unwrap(),
        Some(ExitInfo {
            exit_code: 3,
            signal: None
        })
    );
    assert!(matches!(
        m.write(&id, b"x"),
        Err(TerminalError::NotRunning(_))
    ));
    assert_eq!(m.history(&id).unwrap(), b"hello");
    m.kill(&id).unwrap();
    assert!(matches!(m.history(&id), Err(TerminalError::NotFound(_))));
}

#[test]
fn input_reaches_the_program() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let id = m
        .spawn(SpawnRequest::argv(
            std::env::temp_dir(),
            sh("read line; echo \"got:$line\""),
        ))
        .unwrap();
    m.write(&id, b"ping\r").unwrap();
    ev.wait_output(&id, "got:ping");
    assert_eq!(ev.wait_exit(&id).0, 0);
}

#[test]
fn resize_is_seen_by_the_program() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let mut req = SpawnRequest::argv(std::env::temp_dir(), sh("stty size; read x; stty size"));
    req.cols = 80;
    req.rows = 24;
    let id = m.spawn(req).unwrap();
    ev.wait_output(&id, "24 80");
    m.resize(&id, 132, 40).unwrap();
    m.write(&id, b"\r").unwrap();
    ev.wait_output(&id, "40 132");
    assert!(matches!(
        m.resize(&id, 0, 10),
        Err(TerminalError::InvalidSize { .. })
    ));
}

#[test]
fn cwd_and_environment() {
    let dir = tempdir("cwd");
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let mut req = SpawnRequest::argv(
        &dir,
        sh("printf '%s|%s|%s|%s' \"$(pwd -P)\" \"$TERM\" \"$COLORTERM\" \"$OC_TEST\""),
    );
    req.env.push(("OC_TEST".into(), "yes".into()));
    let id = m.spawn(req).unwrap();
    ev.wait_exit(&id);
    let want = format!(
        "{}|xterm-256color|truecolor|yes",
        dir.canonicalize().unwrap().display()
    );
    assert_eq!(ev.output(&id), want);
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn ids_are_unique_and_caller_ids_are_kept() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let mut req = SpawnRequest::argv(std::env::temp_dir(), sh("sleep 30"));
    req.id = Some("tab-1".into());
    assert_eq!(m.spawn(req.clone()).unwrap(), "tab-1");
    assert!(matches!(
        m.spawn(req),
        Err(TerminalError::DuplicateId(id)) if id == "tab-1"
    ));
    let a = m
        .spawn(SpawnRequest::argv(std::env::temp_dir(), sh("sleep 30")))
        .unwrap();
    let b = m
        .spawn(SpawnRequest::argv(std::env::temp_dir(), sh("sleep 30")))
        .unwrap();
    assert_ne!(a, b);
    assert_eq!(m.ids().len(), 3);
    for op in [
        m.write("nope", b"x").err(),
        m.resize("nope", 10, 10).err(),
        m.ack_bytes("nope", 1).err(),
        m.kill("nope").err(),
    ] {
        assert!(matches!(op, Some(TerminalError::NotFound(_))));
    }
    m.kill_all();
    assert!(m.ids().is_empty());
}

#[test]
fn login_shell_runs_commands() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let id = m.spawn(SpawnRequest::shell(std::env::temp_dir())).unwrap();
    m.write(&id, b"echo RESULT_$((6*7)); exit\r").unwrap();
    ev.wait_output(&id, "RESULT_42");
    ev.wait_exit(&id);
}

#[test]
fn dropping_the_manager_kills_terminals() {
    let ev = Events::default();
    let id;
    {
        let m = PtyManager::new(ev.sink());
        id = m
            .spawn(SpawnRequest::argv(std::env::temp_dir(), sh("sleep 300")))
            .unwrap();
    }
    ev.wait_exit(&id);
}

mod flow_history;
mod kill_group;
mod screen;
mod shell_exec;
