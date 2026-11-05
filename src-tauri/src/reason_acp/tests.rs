//! Transport tests over in-memory pipes: a fake agent thread reads our
//! requests from one pipe and writes scripted lines to the other.

use super::rpc::{codes, CallError, Incoming, RpcConnection, RpcError};
use serde_json::{json, Value};
use std::io::{self, BufRead, BufReader, PipeReader, PipeWriter, Write};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

const T: Option<Duration> = Some(Duration::from_secs(5));

/// Our end of the connection plus the fake agent's two pipe ends.
fn connect(log: Arc<Mutex<Vec<Incoming>>>) -> (RpcConnection, BufReader<PipeReader>, PipeWriter) {
    let (agent_stdout_r, agent_stdout_w) = io::pipe().unwrap();
    let (agent_stdin_r, agent_stdin_w) = io::pipe().unwrap();
    let conn = RpcConnection::start(
        agent_stdout_r,
        agent_stdin_w,
        Box::new(move |msg, responder| {
            if let Incoming::Request { id, method, .. } = &msg {
                let _ = responder.respond(
                    id,
                    Err(RpcError {
                        code: codes::METHOD_NOT_FOUND,
                        message: format!("{method} is not supported"),
                    }),
                );
            }
            log.lock().unwrap().push(msg);
        }),
    );
    (conn, BufReader::new(agent_stdin_r), agent_stdout_w)
}

fn read_msg(r: &mut BufReader<PipeReader>) -> Value {
    let mut line = String::new();
    r.read_line(&mut line).unwrap();
    serde_json::from_str(&line).unwrap()
}

fn send(w: &mut PipeWriter, v: Value) {
    writeln!(w, "{v}").unwrap();
}

#[test]
fn notifications_before_a_response_are_handled_before_call_returns() {
    let log = Arc::new(Mutex::new(Vec::new()));
    let (conn, mut from_us, mut to_us) = connect(log.clone());
    let agent = thread::spawn(move || {
        let req = read_msg(&mut from_us);
        assert_eq!(req["method"], "session/prompt");
        for word in ["Hel", "lo"] {
            let update = json!({"sessionUpdate": "agent_message_chunk",
                "content": {"type": "text", "text": word}});
            send(
                &mut to_us,
                json!({"jsonrpc": "2.0", "method": "session/update",
                "params": {"sessionId": "s1", "update": update}}),
            );
        }
        send(
            &mut to_us,
            json!({"jsonrpc": "2.0", "id": req["id"],
            "result": {"stopReason": "end_turn"}}),
        );
        (from_us, to_us)
    });
    let result = conn
        .call("session/prompt", json!({"sessionId": "s1"}), T)
        .unwrap();
    assert_eq!(result, json!({"stopReason": "end_turn"}));
    let seen = log.lock().unwrap().len();
    assert_eq!(seen, 2, "both chunks were handled before the response");
    drop(agent.join().unwrap());
}

#[test]
fn out_of_order_responses_reach_the_right_callers() {
    let (conn, mut from_us, mut to_us) = connect(Arc::default());
    let conn = Arc::new(conn);
    let (tx, rx) = mpsc::channel();
    for method in ["session/new", "session/list"] {
        let (conn, tx) = (conn.clone(), tx.clone());
        thread::spawn(move || tx.send((method, conn.call(method, json!({}), T))).unwrap());
    }
    let a = read_msg(&mut from_us);
    let b = read_msg(&mut from_us);
    // Answer the second request first, and one of them with an error.
    for req in [&b, &a] {
        let reply = if req["method"] == "session/list" {
            json!({"jsonrpc": "2.0", "id": req["id"], "result": {"sessions": []}})
        } else {
            json!({"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32000,
                "message": "Authentication required: Not signed in."}})
        };
        send(&mut to_us, reply);
    }
    let mut results: Vec<_> = (0..2).map(|_| rx.recv().unwrap()).collect();
    results.sort_by_key(|(m, _)| *m);
    assert_eq!(results[0].1, Ok(json!({"sessions": []})));
    match &results[1].1 {
        Err(CallError::Rpc(e)) => {
            assert_eq!(e.code, codes::AUTH_REQUIRED);
            assert!(e.message.starts_with("Authentication required"));
        }
        other => panic!("expected an auth error, got {other:?}"),
    }
}

#[test]
fn agent_requests_are_answered_and_notifications_carry_no_id() {
    let log = Arc::new(Mutex::new(Vec::new()));
    let (conn, mut from_us, mut to_us) = connect(log.clone());
    send(
        &mut to_us,
        json!({"jsonrpc": "2.0", "id": "p1", "method": "fs/read_text_file",
        "params": {"path": "/etc/hosts"}}),
    );
    let reply = read_msg(&mut from_us);
    assert_eq!(reply["id"], "p1");
    assert_eq!(reply["error"]["code"], codes::METHOD_NOT_FOUND);

    conn.notify("session/cancel", json!({"sessionId": "s1"}))
        .unwrap();
    let cancel = read_msg(&mut from_us);
    assert_eq!(cancel["method"], "session/cancel");
    assert!(cancel.get("id").is_none());
}

#[test]
fn stdout_closing_fails_pending_and_later_calls() {
    let log = Arc::new(Mutex::new(Vec::new()));
    let (conn, mut from_us, mut to_us) = connect(log.clone());
    let conn = Arc::new(conn);
    let waiting = {
        let conn = conn.clone();
        thread::spawn(move || conn.call("session/prompt", json!({}), None))
    };
    let _ = read_msg(&mut from_us);
    // Garbage and blank lines are skipped, not fatal.
    writeln!(to_us, "not json\n").unwrap();
    drop(to_us);
    assert!(matches!(waiting.join().unwrap(), Err(CallError::Closed(_))));
    assert!(conn.is_closed());
    assert!(matches!(
        conn.call("x", json!({}), T),
        Err(CallError::Closed(_))
    ));
    let log = log.lock().unwrap();
    assert!(matches!(log.last(), Some(Incoming::Closed { .. })));
    assert_eq!(log.len(), 1, "only the close was reported");
}
