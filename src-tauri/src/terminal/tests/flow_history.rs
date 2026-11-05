use super::*;
use crate::manager::READ_CHUNK;

#[test]
fn flow_control_pauses_until_acked() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let total = 2_000_000usize;
    let mut req = SpawnRequest::argv(
        std::env::temp_dir(),
        sh(&format!("head -c {total} /dev/zero | tr '\\0' x")),
    );
    req.flow = FlowLimits::new(64 * 1024, 16 * 1024);
    req.scrollback_limit = 0;
    let id = m.spawn(req).unwrap();

    // Without acks the reader stops at the high watermark (plus at most
    // one read chunk that was already in flight).
    ev.wait_for("first data", |e| !output_of(e, Some(&id)).is_empty());
    std::thread::sleep(Duration::from_millis(500));
    let stalled = output_of(&ev.snapshot(), Some(&id)).len();
    assert!(stalled >= 16 * 1024, "too little before pausing: {stalled}");
    assert!(
        stalled < 64 * 1024 + READ_CHUNK,
        "flow control did not pause: {stalled}"
    );
    std::thread::sleep(Duration::from_millis(300));
    assert_eq!(output_of(&ev.snapshot(), Some(&id)).len(), stalled);

    // Ack what arrives until everything is through.
    let mut acked = 0;
    let deadline = Instant::now() + WAIT;
    loop {
        let got = output_of(&ev.snapshot(), Some(&id)).len();
        if got > acked {
            m.ack_bytes(&id, got - acked).unwrap();
            acked = got;
        }
        if got == total {
            break;
        }
        assert!(Instant::now() < deadline, "stuck at {got}/{total}");
        std::thread::sleep(Duration::from_millis(5));
    }
    assert_eq!(ev.wait_exit(&id).0, 0);
    assert!(ev.output(&id).bytes().all(|b| b == b'x'));
}

#[test]
fn kill_releases_a_paused_reader() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let mut req = SpawnRequest::argv(std::env::temp_dir(), sh("yes"));
    req.flow = FlowLimits::new(8 * 1024, 1024);
    let id = m.spawn(req).unwrap();
    ev.wait_for("data", |e| !output_of(e, Some(&id)).is_empty());
    std::thread::sleep(Duration::from_millis(200));
    m.kill(&id).unwrap();
    ev.wait_exit(&id);
}

#[test]
fn initial_command_runs_in_the_new_terminal() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let mut req = SpawnRequest::argv(std::env::temp_dir(), vec!["/bin/sh"]);
    req.initial_command = Some("echo AUTO_$((40+2)); exit 7".into());
    let id = m.spawn(req).unwrap();
    assert_eq!(ev.wait_exit(&id).0, 7);
    // The echoed input shows the expression, the output its value.
    assert!(ev.output(&id).contains("AUTO_42"), "{:?}", ev.output(&id));
}

#[test]
fn history_is_bounded_and_clearable() {
    let ev = Events::default();
    let m = PtyManager::new(ev.sink());
    let mut req = SpawnRequest::argv(
        std::env::temp_dir(),
        sh("i=0; while [ $i -lt 200 ]; do echo line-$i; i=$((i+1)); done"),
    );
    req.scrollback_limit = 256;
    let id = m.spawn(req).unwrap();
    ev.wait_exit(&id);
    let hist = String::from_utf8(m.history(&id).unwrap()).unwrap();
    assert!(hist.len() <= 256, "{}", hist.len());
    assert!(
        hist.starts_with("line-"),
        "trimmed at a line start: {hist:?}"
    );
    assert!(hist.trim_end().ends_with("line-199"));
    m.clear_history(&id).unwrap();
    assert!(m.history(&id).unwrap().is_empty());
}
