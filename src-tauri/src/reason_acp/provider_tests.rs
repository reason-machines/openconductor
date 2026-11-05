//! The provider against `tools/reason-acp/fake_reason_acp.py`, a stand-in
//! for `reason acp` that reproduces the behaviours listed in its docstring.

use super::cli::LaunchConfig;
use super::provider::{ProviderEvent, ReasonProvider, TurnEnd};
use super::updates::{AgentEvent, Place};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

type Log = Arc<Mutex<Vec<(String, ProviderEvent)>>>;

fn provider(name: &str) -> (Arc<ReasonProvider>, Log, PathBuf) {
    let root = std::env::var("REASON_ACP_REPO_ROOT").expect("run via run-rust-tests.sh");
    let fake = PathBuf::from(root).join("tools/reason-acp/fake_reason_acp.py");
    let home = std::env::temp_dir().join(format!("reason-acp-prov-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&home);
    std::fs::create_dir_all(home.join("project")).unwrap();
    let log: Log = Arc::default();
    let sink = log.clone();
    let p = ReasonProvider::new(
        LaunchConfig::new(fake).unwrap(),
        home.clone(),
        Arc::new(move |chat, ev| sink.lock().unwrap().push((chat.to_string(), ev))),
    );
    (Arc::new(p), log, home)
}

fn reply(log: &Log) -> String {
    let log = log.lock().unwrap();
    let texts = log.iter().filter_map(|(_, ev)| match ev {
        ProviderEvent::Agent(AgentEvent::Text(t)) => Some(t.as_str()),
        _ => None,
    });
    texts.collect()
}

fn wait_for(log: &Log, pred: impl Fn(&ProviderEvent) -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !log.lock().unwrap().iter().any(|(_, e)| pred(e)) {
        assert!(Instant::now() < deadline, "timed out");
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn started(log: &Log) -> Vec<String> {
    let log = log.lock().unwrap();
    let ids = log.iter().filter_map(|(_, ev)| match ev {
        ProviderEvent::SessionStarted { session_id } => Some(session_id.clone()),
        _ => None,
    });
    ids.collect()
}

#[test]
fn one_session_per_chat_and_a_follow_up_continues_it() {
    let (p, log, home) = provider("follow");
    p.open_chat("chat-a", &home.join("project"), None);
    assert_eq!(p.prompt("chat-a", "echo: hello"), TurnEnd::Completed);
    assert_eq!(reply(&log), "turn 1: hello");
    assert_eq!(p.prompt("chat-a", "echo: again"), TurnEnd::Completed);
    assert_eq!(reply(&log), "turn 1: helloturn 2: again");
    assert_eq!(started(&log), ["sess-1"]);
    p.open_chat("chat-b", &home, None);
    assert_eq!(p.prompt("chat-b", "echo: b"), TurnEnd::Completed);
    assert_eq!(started(&log), ["sess-1", "sess-2"]);
}

#[test]
fn device_not_found_ends_the_turn_as_an_error() {
    let (p, log, _home) = provider("device");
    p.open_chat("chat", &std::env::temp_dir(), None);
    let end = p.prompt("chat", "echo: pwd");
    let TurnEnd::Failed(message) = &end else {
        panic!("expected a failure, got {end:?}");
    };
    assert!(message.contains("device_not_found"), "{message}");
    if std::env::var_os("HOME").is_some_and(|h| !std::env::temp_dir().starts_with(h)) {
        assert!(message.contains("inside your home folder"), "{message}");
    }
    assert_eq!(reply(&log), "", "the notice is not shown as a reply");
}

#[test]
fn stop_cancels_and_a_follow_up_supersedes_a_running_turn() {
    let (p, log, home) = provider("stop");
    p.open_chat("chat", &home, None);
    let running = |p: &Arc<ReasonProvider>| {
        let p = p.clone();
        std::thread::spawn(move || p.prompt("chat", "slow"))
    };
    let is_tool = |e: &ProviderEvent| matches!(e, ProviderEvent::Agent(AgentEvent::Tool(_)));
    let first = running(&p);
    wait_for(&log, is_tool);
    p.cancel("chat");
    assert_eq!(first.join().unwrap(), TurnEnd::Cancelled);

    log.lock().unwrap().clear();
    let second = running(&p);
    wait_for(&log, is_tool);
    assert_eq!(p.prompt("chat", "echo: next"), TurnEnd::Completed);
    assert_eq!(second.join().unwrap(), TurnEnd::Superseded);
}

#[test]
fn a_stored_session_resumes_after_restart_and_after_a_crash() {
    let (p, log, home) = provider("resume");
    p.open_chat("chat", &home, None);
    assert_eq!(p.prompt("chat", "echo: one"), TurnEnd::Completed);
    let id = started(&log).pop().unwrap();
    p.shutdown();
    drop(p);

    // A new app run: same folder, the stored id, a new agent process.
    let (p, log, _) = provider_in(home.clone());
    p.open_chat("chat", &home, Some(id.clone()));
    assert_eq!(p.prompt("chat", "echo: two"), TurnEnd::Completed);
    assert_eq!(reply(&log), "turn 2: two");
    assert!(started(&log).is_empty(), "no new Session");
    let listed = p.list_sessions().unwrap();
    assert!(listed.iter().any(|s| s.session_id == id));

    assert!(matches!(p.prompt("chat", "crash"), TurnEnd::Failed(_)));
    assert_eq!(p.prompt("chat", "echo: three"), TurnEnd::Completed);
    assert!(reply(&log).ends_with("turn 4: three"));
}

#[test]
fn reports_and_cloud_paths_are_told_apart() {
    let (p, log, home) = provider("report");
    p.open_chat("chat", &home, None);
    assert_eq!(p.prompt("chat", "report"), TurnEnd::Completed);
    assert_eq!(reply(&log), "ok");
    let log2 = log.lock().unwrap();
    assert!(log2
        .iter()
        .any(|(_, e)| matches!(e, ProviderEvent::Agent(AgentEvent::Report(_)))));
    drop(log2);
    assert_eq!(p.prompt("chat", "cloud"), TurnEnd::Completed);
    let log = log.lock().unwrap();
    let row = log.iter().find_map(|(_, e)| match e {
        ProviderEvent::Agent(AgentEvent::Tool(r)) => Some(r.clone()),
        _ => None,
    });
    let diff = &row.unwrap().diffs[0];
    assert_eq!(diff.path.relative.as_deref(), Some("a.txt"));
    assert!(matches!(diff.path.place, Place::Cloud { .. }));
}

fn provider_in(home: PathBuf) -> (Arc<ReasonProvider>, Log, PathBuf) {
    let root = std::env::var("REASON_ACP_REPO_ROOT").unwrap();
    let fake = PathBuf::from(root).join("tools/reason-acp/fake_reason_acp.py");
    let log: Log = Arc::default();
    let sink = log.clone();
    let p = ReasonProvider::new(
        LaunchConfig::new(fake).unwrap(),
        home.clone(),
        Arc::new(move |chat, ev| sink.lock().unwrap().push((chat.to_string(), ev))),
    );
    (Arc::new(p), log, home)
}
