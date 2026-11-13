use super::*;
use super::super::{LaunchEnv, test_exe::write_executable};
use super::super::mcp_status::{McpStatus, StatusResult};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

const WAIT: Duration = Duration::from_secs(10);
const FIXTURE: &str = include_str!("../../../tests/fixtures/codex-mcp-status.py");

type Seen = Arc<Mutex<Vec<Value>>>;

struct Harness {
    worker: Worker,
    seen: Seen,
    path: PathBuf,
}

impl Harness {
    fn new(scenario: &str) -> Self {
        static N: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!("oc-mcp-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("synthetic-codex");
        write_executable(&path, FIXTURE, 0o755);
        let mut env = LaunchEnv::new();
        env.set("OC_MCP_TEST_SCENARIO", scenario);
        env.set("OC_MCP_TEST_DELAY_MS", "250");
        env.set("OC_MCP_TEST_WIRE_LOG", path.with_extension("stdin").to_string_lossy());
        let mut launch = CodexLaunch::new(&dir, env);
        launch.executable = path.clone();
        let config = RunnerConfig {
            launch, thread: ThreadOptions::default(), resume: None,
            client_name: "synthetic-mcp-test".into(), client_version: "0".into(),
            timeouts: Timeouts { initialize: WAIT, thread: WAIT, turn_start: WAIT, interrupt: WAIT },
        };
        let seen: Seen = Arc::default();
        let target = seen.clone();
        let worker = Worker {
            config, sink: Arc::new(move |p| target.lock().unwrap().push(serde_json::to_value(p).unwrap())),
            session: None, thread_id: None, queue: VecDeque::new(), running: None,
            stderr: VecDeque::new(), consents: HashMap::new(), mcp_status: None,
        };
        Self { worker, seen, path }
    }

    fn live(&mut self) { self.worker.ensure_session(&TurnOptions::default()).unwrap(); }

    fn query(&mut self, timeout: Duration) -> StatusReply {
        let (done, result) = mpsc::channel();
        let deadline = Instant::now() + timeout;
        self.worker.handle(Cmd::McpStatus(StatusQuery { deadline, done }));
        StatusReply { deadline, result }
    }

    fn pump(&mut self) {
        let event = self.worker.session.as_mut().unwrap().next_event(WAIT).expect("synthetic event");
        self.worker.on_event(event);
    }

    fn resolve(&mut self) {
        let deadline = Instant::now() + WAIT;
        while self.worker.mcp_status.is_some() {
            assert!(Instant::now() < deadline, "status still pending");
            self.pump();
        }
    }

    fn sent(&self) -> Vec<Value> {
        fs::read_to_string(self.path.with_extension("stdin")).unwrap_or_default().lines().map(|s| serde_json::from_str(s).unwrap()).collect()
    }

    fn begin(&mut self) -> Receiver<TurnEnd> {
        let (done, end) = mpsc::channel();
        self.worker.begin(Prompt { text: "synthetic inert turn".into(), options: TurnOptions::default(), done, on_handoff: None });
        end
    }

    fn reply(&mut self, value: Value) {
        self.worker.on_event(CodexEvent::Message(ServerMessage::parse(&value.to_string()).unwrap()));
    }

    fn id(&self) -> RequestId { self.worker.mcp_status.as_ref().unwrap().request_id.clone() }
}

#[test]
fn mcp_status_no_live_never_launches_or_emits_turns_and_public_drop_is_bounded() {
    let mut h = Harness::new("pages");
    assert!(h.query(WAIT).receive().unwrap_err().contains("not running"));
    assert!(!h.path.with_extension("stdin").exists());
    assert!(h.seen.lock().unwrap().is_empty());
    let runner = CodexRunner::start(h.worker.config.clone(), Arc::new(|_| {}));
    assert!(runner.mcp_status(WAIT).receive().is_err());
    drop(runner);
    assert!(!h.path.with_extension("stdin").exists());
}

#[test]
fn mcp_status_public_worker_times_out_and_drops_a_live_pending_query() {
    let h = Harness::new("timeout");
    let (tx, events) = mpsc::channel();
    let runner = CodexRunner::start(h.worker.config.clone(), Arc::new(move |p| { let _ = tx.send(p); }));
    let _turn = runner.prompt("synthetic inert turn", TurnOptions::default());
    loop {
        if matches!(events.recv_timeout(WAIT).unwrap(), Payload::ThreadStarted { .. }) { break; }
    }
    let expired = runner.mcp_status(Duration::from_millis(100));
    assert!(expired.receive().unwrap_err().contains("timed out"));
    let pending = runner.mcp_status(WAIT);
    drop(runner);
    assert!(pending.receive().is_err());
}

#[test]
fn mcp_status_pages_use_shared_unique_ids_and_preserve_tools_without_events() {
    let mut h = Harness::new("pages");
    h.live();
    let before = h.seen.lock().unwrap().clone();
    let query = h.query(WAIT);
    h.resolve();
    let rows = query.receive().unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].status, McpStatus::NeedsAuth);
    assert_eq!(rows[1].status, McpStatus::Connected);
    assert_eq!(rows[1].tools[0].annotations.as_ref().unwrap().read_only, Some(true));
    let sent = h.sent();
    let ids: Vec<_> = sent.iter().filter_map(|v| v["id"].as_i64()).collect();
    assert_eq!(ids.iter().collect::<HashSet<_>>().len(), ids.len());
    let requests: Vec<_> = sent.iter().filter(|v| v["method"] == "mcpServerStatus/list").collect();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0]["params"], json!({}));
    assert_eq!(requests[1]["params"], json!({"cursor":"synthetic-next"}));
    assert_eq!(*h.seen.lock().unwrap(), before);
}

#[test]
fn mcp_status_empty_terminal_cursors_rpc_and_schema_failures_are_query_results() {
    for scenario in ["empty", "empty-cursor", "rpc-error", "repeat", "null-tool", "null-description", "null-annotations", "invalid-annotation", "invalid-server-info", "unknown-auth", "missing-server-info", "missing-next-cursor"] {
        let mut h = Harness::new(scenario);
        h.live();
        let query = h.query(WAIT);
        h.resolve();
        let result = query.receive();
        match scenario {
            "empty" => assert!(result.unwrap().is_empty()),
            "empty-cursor" => assert_eq!(result.unwrap().len(), 1),
            _ => assert!(result.is_err(), "{scenario}"),
        }
        assert!(!h.seen.lock().unwrap().iter().any(|v| v["type"] == "turnEnded"));
    }
}

#[test]
fn mcp_status_exact_typed_ids_overlap_malformed_and_retry() {
    let mut h = Harness::new("timeout");
    h.live();
    let query = h.query(WAIT);
    let id = h.id();
    assert!(h.query(WAIT).receive().unwrap_err().contains("already pending"));
    h.reply(json!({"id":"3","result":{"data":[],"nextCursor":null}}));
    h.reply(json!({"id":9999,"error":{"code":-1,"message":"foreign"}}));
    assert!(h.worker.mcp_status.is_some());
    h.reply(json!({"id":id,"result":{"data":[],"nextCursor":null}}));
    assert!(query.receive().unwrap().is_empty());
    let next = h.query(WAIT);
    assert_ne!(h.id(), id);
    h.reply(json!({"id":id,"result":{"data":[],"nextCursor":null}}));
    assert!(h.worker.mcp_status.is_some());
    let current = h.id();
    h.worker.on_event(CodexEvent::BadLine { line: json!({"id":current,"result":null,"error":"invalid"}).to_string(), error: "synthetic".into() });
    assert!(next.receive().is_err());
    let retry = h.query(WAIT);
    let id = h.id();
    h.reply(json!({"id":id,"error":{"code":-32601,"message":"unsupported"}}));
    assert!(retry.receive().unwrap_err().contains("unsupported"));
}

#[test]
fn mcp_status_buffered_during_start_turn_and_interrupt_preserves_turns() {
    let mut h = Harness::new("hold-until-turn");
    h.live();
    let first = h.begin();
    while h.worker.running.is_some() { h.pump(); }
    assert_eq!(first.recv_timeout(WAIT).unwrap().outcome, super::super::codex_wire::Outcome::Completed);
    let status = h.query(WAIT);
    let second = h.begin();
    h.resolve();
    assert!(status.receive().unwrap().is_empty());
    assert!(h.worker.running.is_some());
    h.worker.handle(Cmd::Cancel);
    while h.worker.running.is_some() { h.pump(); }
    assert_eq!(second.recv_timeout(WAIT).unwrap().outcome, super::super::codex_wire::Outcome::Cancelled);

    for scenario in ["hold-until-interrupt", "pre-start"] {
        let mut h = Harness::new(scenario);
        h.live();
        let turn = h.begin();
        let status = h.query(WAIT);
        h.worker.handle(Cmd::Cancel);
        h.resolve();
        assert!(status.receive().is_ok());
        while h.worker.running.is_some() { h.pump(); }
        assert_eq!(turn.recv_timeout(WAIT).unwrap().outcome, super::super::codex_wire::Outcome::Cancelled);
        assert_eq!(h.seen.lock().unwrap().iter().filter(|v| v["type"] == "turnEnded").count(), 1);
    }
}

#[test]
fn mcp_status_deadlines_cover_enqueue_pagination_and_buffered_interrupt() {
    let mut h = Harness::new("timeout");
    h.live();
    let (done, result) = mpsc::channel();
    let deadline = Instant::now() - Duration::from_millis(1);
    h.worker.handle(Cmd::McpStatus(StatusQuery { deadline, done }));
    assert!(result.recv_timeout(WAIT).unwrap().unwrap_err().contains("timed out"));
    assert!(!h.sent().iter().any(|v| v["method"] == "mcpServerStatus/list"));
    let status = h.query(WAIT);
    let id = h.id();
    h.reply(json!({"id":id,"result":{"data":[],"nextCursor":"next"}}));
    h.worker.mcp_status.as_mut().unwrap().query.deadline = Instant::now() - Duration::from_millis(1);
    let id = h.id();
    h.reply(json!({"id":id,"result":{"data":[],"nextCursor":null}}));
    assert!(status.receive().unwrap_err().contains("timed out"));

    let mut h = Harness::new("buffered-expired");
    h.live();
    let _turn = h.begin();
    let status = h.query(WAIT);
    h.worker.mcp_status.as_mut().unwrap().query.deadline = Instant::now() + Duration::from_millis(80);
    h.worker.handle(Cmd::Cancel);
    h.pump();
    assert!(status.receive().unwrap_err().contains("timed out"));
}

#[test]
fn mcp_status_close_shutdown_drop_and_fatal_start_clear_pending() {
    let mut h = Harness::new("close");
    h.live();
    let status = h.query(WAIT);
    h.resolve();
    assert!(status.receive().unwrap_err().contains("closed"));
    assert!(h.worker.session.is_none());
    h.live();
    assert!(h.worker.mcp_status.is_none());

    for shutdown in [true, false] {
        let mut h = Harness::new("timeout");
        h.live();
        let status = h.query(WAIT);
        if shutdown { h.worker.shut_down(); } else { drop(h); }
        assert!(status.receive().is_err());
    }
    let mut h = Harness::new("timeout");
    h.live();
    let status = h.query(WAIT);
    h.worker.session.as_mut().unwrap().kill().unwrap();
    let _turn = h.begin();
    assert!(status.receive().is_err());
    assert!(h.worker.session.is_none());

    let mut h = Harness::new("timeout");
    h.live();
    let status = h.query(WAIT);
    h.worker.session = None;
    h.worker.config.launch.executable = h.path.with_file_name("missing-synthetic-executable");
    let _turn = h.begin();
    assert!(status.receive().unwrap_err().contains("replaced"));

    let mut h = Harness::new("interrupt-close");
    h.live();
    let _turn = h.begin();
    let status = h.query(WAIT);
    h.worker.handle(Cmd::Cancel);
    assert!(status.receive().is_err());
    assert!(h.worker.mcp_status.is_none());
}

#[test]
fn mcp_status_approval_and_consent_retain_existing_owners() {
    for scenario in ["approval", "consent"] {
        let mut h = Harness::new(scenario);
        h.live();
        let _turn = h.begin();
        let status = h.query(WAIT);
        while !h.seen.lock().unwrap().iter().any(|v| v["type"] == if scenario == "approval" { "approval" } else { "consent" }) { h.pump(); }
        if scenario == "approval" {
            h.worker.handle(Cmd::Answer(RequestId::Int(9002), ApprovalDecision::Accept));
        } else {
            let kind = *h.worker.consents.get(&RequestId::Int(9001)).unwrap();
            h.worker.handle(Cmd::Respond(RequestId::Int(9001), codex_consent::stopped(kind)));
        }
        h.resolve();
        assert!(status.receive().unwrap().is_empty());
        let sent = h.sent();
        assert!(sent.iter().any(|v| v["id"] == if scenario == "approval" { 9002 } else { 9001 } && v.get("result").is_some()));
    }
}

#[test]
fn mcp_status_all_existing_write_failure_paths_clear_only_query_state() {
    for path in ["approval", "consent", "default-answer", "default-reject", "page"] {
        let mut h = Harness::new("broken-stdin");
        h.live();
        let status = h.query(WAIT);
        h.pump();
        match path {
            "approval" => h.worker.handle(Cmd::Answer(RequestId::Int(90), ApprovalDecision::Accept)),
            "consent" => h.worker.send_consent(RequestId::Int(90), json!({"action":"cancel","content":null})),
            "default-answer" | "default-reject" => h.reply(json!({"id":90,"method":if path == "default-answer" {"item/tool/requestUserInput"} else {"synthetic/unsupported"},"params":{}})),
            "page" => { let id = h.id(); h.reply(json!({"id":id,"result":{"data":[],"nextCursor":"next"}})); }
            _ => unreachable!(),
        }
        let result: StatusResult = status.receive();
        assert!(result.is_err(), "{path}");
        assert!(h.worker.mcp_status.is_none());
        assert!(h.worker.session.is_some());
        assert!(h.query(WAIT).receive().is_err(), "new status write also fails");
        assert!(h.worker.mcp_status.is_none());
        assert!(!h.seen.lock().unwrap().iter().any(|v| v["type"] == "turnEnded"));
    }
}
