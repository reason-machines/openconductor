//! The provider against `tools/reason-acp/fake_reason_acp.py`, a stand-in
//! for `reason acp` that reproduces the behaviours listed in its docstring.

use super::cli::LaunchConfig;
use super::interaction::{Answer, Request};
use super::provider::{ProviderEvent, ReasonProvider, TurnEnd};
use super::updates::{AgentEvent, Place};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// The fake agent script. The harness crate sets `REASON_ACP_REPO_ROOT`;
/// in the app crate the repository is the manifest's parent.
fn fake_agent() -> PathBuf {
    let root = std::env::var("REASON_ACP_REPO_ROOT")
        .unwrap_or_else(|_| concat!(env!("CARGO_MANIFEST_DIR"), "/..").into());
    PathBuf::from(root).join("tools/reason-acp/fake_reason_acp.py")
}

type Log = Arc<Mutex<Vec<(String, ProviderEvent)>>>;

fn provider(name: &str) -> (Arc<ReasonProvider>, Log, PathBuf) {
    let fake = fake_agent();
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
        ProviderEvent::Agent(AgentEvent::Tool(r)) => Some((**r).clone()),
        _ => None,
    });
    let diff = &row.unwrap().diffs[0];
    assert_eq!(diff.path.relative.as_deref(), Some("a.txt"));
    assert!(matches!(diff.path.place, Place::Cloud { .. }));
}

fn provider_in(home: PathBuf) -> (Arc<ReasonProvider>, Log, PathBuf) {
    let fake = fake_agent();
    let log: Log = Arc::default();
    let sink = log.clone();
    let p = ReasonProvider::new(
        LaunchConfig::new(fake).unwrap(),
        home.clone(),
        Arc::new(move |chat, ev| sink.lock().unwrap().push((chat.to_string(), ev))),
    );
    (Arc::new(p), log, home)
}

#[test]
fn config_is_set_on_a_new_session_and_unoffered_values_become_notices() {
    use super::provider::ConfigChoice;
    let (p, log, home) = provider("config");
    p.open_chat("review", &home, None);
    let choice = |id: &str, value: &str| ConfigChoice {
        id: id.into(),
        value: value.into(),
    };
    p.set_config(
        "review",
        vec![
            choice("model", "byok:anthropic:claude-opus-5-5"),
            choice("reasoning_effort", "high"),
        ],
    );
    assert_eq!(p.prompt("review", "config"), TurnEnd::Completed);
    assert_eq!(
        reply(&log),
        "model=byok:anthropic:claude-opus-5-5 effort=high"
    );

    // Reason would reset an unoffered model to its default: not sent, told instead.
    let (p, log, home) = provider("config-unoffered");
    p.open_chat("review", &home, None);
    p.set_config(
        "review",
        vec![choice("model", "opus-5-1m"), choice("speed", "fast")],
    );
    assert_eq!(p.prompt("review", "config"), TurnEnd::Completed);
    assert_eq!(reply(&log), "model=default effort=default");
    let notices: Vec<String> = log
        .lock()
        .unwrap()
        .iter()
        .filter_map(|(_, e)| match e {
            ProviderEvent::Notice(n) => Some(n.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(notices.len(), 2, "{notices:?}");
    assert!(notices[0].contains("opus-5-1m"));
    assert!(notices[1].contains("speed"));
}

#[test]
fn attachments_go_to_reason_as_embedded_files() {
    use super::provider::Attachment;
    let (p, log, home) = provider("attach");
    p.open_chat("review", &home, None);
    let a = Attachment {
        name: "Review request.md".into(),
        text: "the prompt".into(),
    };
    assert_eq!(
        p.prompt_with("review", "attachments", &[a]),
        TurnEnd::Completed
    );
    assert_eq!(reply(&log), "Review request.md: the prompt");
}

#[test]
fn a_stop_before_an_announced_prompt_is_sent_cancels_it_unsent() {
    let (p, log, home) = provider("stop-unsent");
    p.open_chat("chat", &home.join("project"), None);
    // The app announces the prompt, then saves the start checkpoint; Stop lands in between.
    let ticket = p.expect_prompt("chat");
    assert!(ticket.is_some());
    p.cancel("chat");
    let started = Instant::now();
    assert_eq!(
        p.prompt_expected("chat", "slow", &[], ticket),
        TurnEnd::Cancelled
    );
    assert!(
        started.elapsed() < Duration::from_secs(5),
        "the stopped prompt was sent and ran"
    );
    assert!(log
        .lock()
        .unwrap()
        .iter()
        .any(|(_, e)| *e == ProviderEvent::TurnEnded(TurnEnd::Cancelled)));
    // Reason never saw it, and a Stop with nothing pending does not carry over.
    p.cancel("chat");
    let next = p.expect_prompt("chat");
    assert_eq!(
        p.prompt_expected("chat", "echo: next", &[], next),
        TurnEnd::Completed
    );
    assert_eq!(reply(&log), "turn 1: next");
}

/// The permission request the chat is waiting on: its id and option ids.
fn asked(log: &Log) -> (String, Vec<String>) {
    wait_for(log, |e| matches!(e, ProviderEvent::Interaction(_)));
    let log = log.lock().unwrap();
    log.iter()
        .find_map(|(_, e)| match e {
            ProviderEvent::Interaction(i) => match &i.request {
                Request::Permission(p) => {
                    assert_eq!(p.title, "bash: rm -rf build");
                    assert_eq!(p.tool, "execute");
                    Some((
                        i.id.clone(),
                        p.options.iter().map(|o| o.id.clone()).collect(),
                    ))
                }
                other => panic!("expected a permission, got {other:?}"),
            },
            _ => None,
        })
        .unwrap()
}

fn resolved(log: &Log) -> Vec<String> {
    let log = log.lock().unwrap();
    let ids = log.iter().filter_map(|(_, e)| match e {
        ProviderEvent::InteractionResolved { id } => Some(id.clone()),
        _ => None,
    });
    ids.collect()
}

#[test]
fn a_permission_request_waits_for_the_users_option() {
    let (p, log, home) = provider("permission");
    p.open_chat("chat", &home, None);
    let turn = {
        let p = p.clone();
        std::thread::spawn(move || p.prompt("chat", "permission"))
    };
    let (id, options) = asked(&log);
    assert_eq!(options, ["allow-once", "allow-always", "reject-once"]);
    assert!(resolved(&log).is_empty(), "nothing answered yet");
    assert!(p
        .respond("other", &id, &Answer::Option("allow-once".into()))
        .is_err());
    assert!(p
        .respond("chat", &id, &Answer::Option("nope".into()))
        .is_err());
    p.respond("chat", &id, &Answer::Option("allow-always".into()))
        .unwrap();
    assert_eq!(turn.join().unwrap(), TurnEnd::Completed);
    assert_eq!(reply(&log), "permission: selected allow-always");
    assert_eq!(resolved(&log), std::slice::from_ref(&id));
    assert!(
        p.respond("chat", &id, &Answer::Cancel).is_err(),
        "an answered request is gone"
    );
}

#[test]
fn stop_answers_a_waiting_permission_cancelled() {
    let (p, log, home) = provider("permission-stop");
    p.open_chat("chat", &home, None);
    let turn = {
        let p = p.clone();
        std::thread::spawn(move || p.prompt("chat", "permission"))
    };
    let (id, _) = asked(&log);
    p.cancel("chat");
    assert_eq!(turn.join().unwrap(), TurnEnd::Cancelled);
    assert_eq!(reply(&log), "permission: cancelled");
    assert_eq!(resolved(&log), [id]);
    // The resolution comes before the turn's end, so the UI never shows a stale card.
    let log = log.lock().unwrap();
    let pos =
        |pred: &dyn Fn(&ProviderEvent) -> bool| log.iter().position(|(_, e)| pred(e)).unwrap();
    assert!(
        pos(&|e| matches!(e, ProviderEvent::InteractionResolved { .. }))
            < pos(&|e| matches!(e, ProviderEvent::TurnEnded(_)))
    );
}
