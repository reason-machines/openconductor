//! [`ClaudeRunner`] against a stand-in `claude` that speaks stream-json:
//! each user line gets init (once), a text reply echoing it and a result.
//! A message containing `sleep` waits for an interrupt (`ignore`: waits
//! for good); `exit` exits 2 after printing to stderr; `askplan` asks to
//! run ExitPlanMode and replies `allowed` or `denied` to the answer.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::Value;

use super::runner::{ClaudeRunner, Launcher};
use crate::agent::{ClaudeLaunch, LaunchEnv};
use crate::reason_acp::provider::{ProviderEvent, Sink, TurnEnd};
use crate::reason_acp::wire;
use crate::test_exe::write_executable;

const FAKE: &str = r#"#!/bin/sh
printf '%s\n' "$*" >> "$0.args"
sid=fake-1
init=0
while IFS= read -r line; do
  printf '%s\n' "$line" >> "$0.stdin"
  case "$line" in
    *'"interrupt"'*)
      [ "$ignore" = 1 ] && continue
      asked=0
      echo '{"type":"result","subtype":"error_during_execution","is_error":true,"session_id":"'$sid'"}'
      continue;;
    *'"control_response"'*)
      [ "$asked" = 1 ] || continue
      asked=0
      case "$line" in *'"behavior":"allow"'*) b=allowed;; *) b=denied;; esac
      echo '{"type":"assistant","session_id":"'$sid'","message":{"id":"p1","content":[{"type":"text","text":"'$b'"}]}}'
      echo '{"type":"result","subtype":"success","is_error":false,"result":"'$b'","session_id":"'$sid'"}'
      continue;;
  esac
  if [ $init = 0 ]; then
    echo '{"type":"system","subtype":"init","session_id":"'$sid'","permissionMode":"bypassPermissions"}'
    init=1
  fi
  case "$line" in
    *ignore*) ignore=1; continue;;
    *sleep*) continue;;
    *askplan*)
      asked=1
      echo '{"type":"control_request","request_id":"req-1","request":{"subtype":"can_use_tool","tool_name":"ExitPlanMode","input":{"plan":"1. build it"}}}'
      continue;;
    *exit*) echo 'boom: fake claude died' >&2; exit 2;;
  esac
  n=$(wc -l < "$0.stdin" | tr -d ' ')
  echo '{"type":"assistant","session_id":"'$sid'","message":{"id":"m'$n'","content":[{"type":"text","text":"reply '$n'"}]}}'
  echo '{"type":"result","subtype":"success","is_error":false,"result":"reply","session_id":"'$sid'"}'
done
"#;

fn fake() -> PathBuf {
    static N: AtomicU32 = AtomicU32::new(0);
    let dir = std::env::temp_dir().join(format!(
        "oc-claude-runner-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&dir).unwrap();
    let exe = dir.join("claude");
    write_executable(&exe, FAKE, 0o755);
    exe
}

struct Harness {
    runner: Arc<ClaudeRunner>,
    events: Arc<Mutex<Vec<Value>>>,
    exe: PathBuf,
}

fn harness() -> Harness {
    let exe = fake();
    let events = Arc::new(Mutex::new(Vec::new()));
    let seen = events.clone();
    let sink: Sink = Arc::new(move |chat: &str, ev: ProviderEvent| {
        seen.lock().unwrap().push(wire::event_json(chat, &ev));
    });
    let path = exe.clone();
    let launcher: Launcher = Arc::new(move |cwd: &Path, resume| {
        let mut l = ClaudeLaunch::new(cwd, LaunchEnv::new());
        l.executable = path.clone();
        l.resume = resume;
        Ok(l)
    });
    Harness {
        runner: Arc::new(ClaudeRunner::new(launcher, sink)),
        events,
        exe,
    }
}

impl Harness {
    fn types(&self) -> Vec<String> {
        self.events
            .lock()
            .unwrap()
            .iter()
            .map(|e| e["type"].as_str().unwrap().to_owned())
            .collect()
    }
    fn stdin(&self) -> Vec<Value> {
        fs::read_to_string(self.exe.with_extension("stdin"))
            .unwrap_or_default()
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect()
    }
    fn args(&self) -> Vec<String> {
        fs::read_to_string(self.exe.with_extension("args"))
            .unwrap_or_default()
            .lines()
            .map(str::to_owned)
            .collect()
    }
}

fn cwd() -> PathBuf {
    std::env::temp_dir()
}

#[test]
fn linked_directories_reach_new_processes_without_guessing_live_reconciliation() {
    let h = harness();
    h.runner.open_chat("links", &cwd(), None);
    let directories = vec![PathBuf::from("/extra/one"), PathBuf::from("/extra/two")];
    assert_eq!(h.runner.prompt_with_directories("links", "hello", &directories), TurnEnd::Completed);
    let args = h.args();
    assert!(args[0].contains("--add-dir /extra/one"), "{args:?}");
    assert!(args[0].contains("--add-dir /extra/two"), "{args:?}");
    assert!(matches!(h.runner.prompt_with_directories("links", "changed", &[]), TurnEnd::Failed(message) if message.contains("Start a new Claude Code chat")));
    assert_eq!(h.stdin().len(), 1, "changed directories must not silently send to the old process");
    assert_eq!(h.runner.prompt_with_directories("links", "unchanged", &directories), TurnEnd::Completed);
    assert_eq!(h.args().len(), 1);
}

#[test]
fn turns_and_follow_ups_share_one_process() {
    let h = harness();
    h.runner.open_chat("c1", &cwd(), None);
    assert_eq!(h.runner.prompt("c1", "hello"), TurnEnd::Completed);
    assert_eq!(h.runner.session_id("c1").as_deref(), Some("fake-1"));
    assert_eq!(h.runner.prompt("c1", "again"), TurnEnd::Completed);
    assert_eq!(
        h.types(),
        ["sessionStarted", "text", "turnEnded", "text", "turnEnded"]
    );
    let ev = h.events.lock().unwrap().clone();
    assert_eq!(ev[0]["sessionId"], "fake-1");
    assert_eq!(ev[0]["chatId"], "c1");
    assert_eq!(ev[1]["text"], "reply 1");
    assert_eq!(ev[2]["end"]["outcome"], "completed");
    assert_eq!(h.args().len(), 1, "one process for both turns");
    let sent = h.stdin();
    assert_eq!(sent[1]["message"]["content"][0]["text"], "again");
}

#[test]
fn stop_interrupts_the_turn() {
    let h = harness();
    h.runner.open_chat("c1", &cwd(), None);
    let r = h.runner.clone();
    let turn = thread::spawn(move || r.prompt("c1", "please sleep"));
    thread::sleep(Duration::from_millis(500));
    h.runner.cancel("c1");
    assert_eq!(turn.join().unwrap(), TurnEnd::Cancelled);
    let sent = h.stdin();
    assert_eq!(sent.last().unwrap()["request"]["subtype"], "interrupt");
    // The same process takes the next turn normally.
    assert_eq!(h.runner.prompt("c1", "hello"), TurnEnd::Completed);
    assert_eq!(h.args().len(), 1);
}

#[test]
fn a_second_stop_kills_the_process_and_the_next_turn_resumes() {
    let h = harness();
    h.runner.open_chat("c1", &cwd(), None);
    let r = h.runner.clone();
    let turn = thread::spawn(move || r.prompt("c1", "sleep, and ignore the interrupt"));
    thread::sleep(Duration::from_millis(500));
    h.runner.cancel("c1");
    thread::sleep(Duration::from_millis(300));
    h.runner.cancel("c1");
    let end = turn.join().unwrap();
    assert_eq!(end, TurnEnd::Cancelled);
    assert_eq!(h.runner.prompt("c1", "hello"), TurnEnd::Completed);
    let args = h.args();
    assert_eq!(args.len(), 2, "{args:?}");
    assert!(args[1].contains("--resume fake-1"), "{args:?}");
}

#[test]
fn an_exit_fails_the_turn_with_stderr_and_the_next_prompt_resumes() {
    let h = harness();
    h.runner.open_chat("c1", &cwd(), None);
    assert_eq!(h.runner.prompt("c1", "hello"), TurnEnd::Completed);
    match h.runner.prompt("c1", "exit now") {
        TurnEnd::Failed(m) => assert!(m.contains("boom: fake claude died"), "{m}"),
        other => panic!("{other:?}"),
    }
    assert_eq!(h.runner.prompt("c1", "hello"), TurnEnd::Completed);
    let args = h.args();
    assert_eq!(args.len(), 2, "{args:?}");
    assert!(!args[0].contains("--resume"));
    assert!(args[1].contains("--resume fake-1"), "{args:?}");
}

#[test]
fn a_saved_session_is_resumed_and_a_missing_cli_fails_the_turn() {
    let h = harness();
    h.runner.open_chat("c1", &cwd(), Some("saved-9".into()));
    assert_eq!(h.runner.prompt("c1", "hello"), TurnEnd::Completed);
    assert!(h.args()[0].contains("--resume saved-9"));

    let events = Arc::new(Mutex::new(Vec::new()));
    let seen = events.clone();
    let sink: Sink = Arc::new(move |_: &str, ev: ProviderEvent| seen.lock().unwrap().push(ev));
    let launcher: Launcher = Arc::new(|_, _| Err("Claude Code was not found.".into()));
    let runner = ClaudeRunner::new(launcher, sink);
    runner.open_chat("c2", &cwd(), None);
    let end = runner.prompt("c2", "hi");
    assert_eq!(end, TurnEnd::Failed("Claude Code was not found.".into()));
    assert_eq!(*events.lock().unwrap(), vec![ProviderEvent::TurnEnded(end)]);
    assert!(matches!(runner.prompt("nope", "hi"), TurnEnd::Failed(_)));
}

fn wait_for_type(h: &Harness, ty: &str) {
    for _ in 0..500 {
        if h.types().iter().any(|t| t == ty) {
            return;
        }
        thread::sleep(Duration::from_millis(10));
    }
    panic!("no {ty} event: {:?}", h.types());
}

#[test]
fn a_plan_prompt_waits_for_the_user_and_the_answer_goes_back() {
    use super::interact::Answer;
    let h = harness();
    h.runner.open_chat("c1", &cwd(), None);
    let r = h.runner.clone();
    let turn = thread::spawn(move || r.prompt("c1", "askplan please"));
    wait_for_type(&h, "permissionRequest");
    let asked = h
        .events
        .lock()
        .unwrap()
        .iter()
        .find(|e| e["type"] == "permissionRequest")
        .cloned()
        .unwrap();
    assert_eq!(asked["requestId"], "req-1");
    assert_eq!(asked["kind"], "plan");
    assert_eq!(asked["plan"], "1. build it");
    let wrong = Answer::Option("allow".into());
    assert!(
        h.runner.respond("c1", "req-1", &wrong).is_err(),
        "a plan takes a plan answer"
    );
    assert!(h.runner.respond("c1", "nope", &Answer::Cancel).is_err());
    let approve = Answer::Plan {
        approved: true,
        feedback: None,
    };
    h.runner.respond("c1", "req-1", &approve).unwrap();
    assert_eq!(turn.join().unwrap(), TurnEnd::Completed);
    // The waiter hears of the end just before the event is emitted.
    wait_for_type(&h, "turnEnded");
    assert_eq!(
        h.types(),
        [
            "sessionStarted",
            "permissionRequest",
            "permissionResolved",
            "text",
            "turnEnded"
        ]
    );
    let reply = h.stdin().last().unwrap().clone();
    assert_eq!(reply["response"]["request_id"], "req-1");
    assert_eq!(
        reply["response"]["response"],
        serde_json::json!({ "behavior": "allow", "updatedInput": { "plan": "1. build it" } })
    );
    assert_eq!(h.events.lock().unwrap()[3]["text"], "allowed");
}

#[test]
fn stop_denies_a_waiting_prompt_and_resolves_it() {
    let h = harness();
    h.runner.open_chat("c1", &cwd(), None);
    let r = h.runner.clone();
    let turn = thread::spawn(move || r.prompt("c1", "askplan please"));
    wait_for_type(&h, "permissionRequest");
    h.runner.cancel("c1");
    assert_eq!(turn.join().unwrap(), TurnEnd::Cancelled);
    wait_for_type(&h, "turnEnded");
    let types = h.types();
    let resolved = types
        .iter()
        .position(|t| t == "permissionResolved")
        .unwrap();
    let ended = types.iter().position(|t| t == "turnEnded").unwrap();
    assert!(resolved < ended, "{types:?}");
    // The fake logs a line when it reads it, which can be after the turn ended.
    let mut deny = None;
    for _ in 0..500 {
        deny = h
            .stdin()
            .into_iter()
            .find(|m| m["type"] == "control_response");
        if deny.is_some() {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    let deny = deny.expect("Stop answers the waiting prompt");
    assert_eq!(deny["response"]["response"]["behavior"], "deny");
}

#[test]
fn a_stop_before_the_prompt_is_sent_cancels_it() {
    let h = harness();
    h.runner.open_chat("c1", &cwd(), None);
    // The start checkpoint is being saved: announced, not sent yet.
    h.runner.expect_prompt("c1");
    h.runner.cancel("c1");
    assert_eq!(h.runner.prompt("c1", "hello"), TurnEnd::Cancelled);
    assert_eq!(h.types(), ["turnEnded"]);
    assert!(h.args().is_empty(), "no process was started");
    // The next announced prompt runs normally.
    h.runner.expect_prompt("c1");
    assert_eq!(h.runner.prompt("c1", "hello"), TurnEnd::Completed);
}
