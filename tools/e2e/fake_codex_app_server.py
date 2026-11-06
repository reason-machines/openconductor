#!/usr/bin/env python3
"""Stand-in for `codex app-server --listen stdio://` in the Codex chat e2e.

Plays the turn recorded from Codex 0.166.0 on macOS (evidence/e2e-mac/codex.md):
commentary, a command approval offering ["accept", <execpolicy amendment>,
"cancel"], the command, a second command with output, the final answer. The
first command really writes hello.txt in the thread's cwd. Prompts:

  contains "hello"  the recorded turn above; "cancel" on the approval ends the
                    turn as interrupted, like Codex
  contains "slow"   runs until turn/interrupt
  anything else     replies "turn <n>: <prompt>", n counting this thread's turns

Every request it receives is appended to $HOME/codex-fake.jsonl.
Only "codex app-server" is handled; other subcommands exit 2.
"""
import json
import os
import sys
import threading

if sys.argv[1:2] != ["app-server"]:
    sys.stderr.write(f"fake codex: unsupported {sys.argv[1:]}\n")
    sys.exit(2)

LOG = os.path.join(os.environ.get("HOME", "."), "codex-fake.jsonl")
out_lock = threading.Lock()


def send(obj):
    with out_lock:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()


def note(obj):
    with open(LOG, "a") as f:
        f.write(json.dumps(obj) + "\n")


def notify(method, params):
    send({"method": method, "params": params})


state = {"thread": None, "cwd": None, "turns": 0, "turn": None, "pending": {}, "next_req": 0}


def item(kind, iid, **fields):
    return {"type": kind, "id": iid, **fields}


def command_item(iid, shell_cmd, bare, status, output=None, exit_code=None):
    return item(
        "commandExecution", iid,
        command=f"/bin/zsh -lc {shell_cmd}", cwd=state["cwd"], processId=None,
        source="unifiedExecStartup", status=status,
        commandActions=[{"type": "unknown", "command": bare}],
        aggregatedOutput=output, exitCode=exit_code, durationMs=None,
    )


def message(turn, iid, text, phase):
    t = state["thread"]
    notify("item/started", {"item": item("agentMessage", iid, text="", phase=phase), "threadId": t, "turnId": turn})
    half = len(text) // 2
    for chunk in (text[:half], text[half:]):
        notify("item/agentMessage/delta", {"threadId": t, "turnId": turn, "itemId": iid, "delta": chunk})
    notify("item/completed", {"item": item("agentMessage", iid, text=text, phase=phase, memoryCitation=None, delivery=None, questions=None), "threadId": t, "turnId": turn})


def complete(turn, status, error=None):
    state["turn"] = None
    notify("turn/completed", {"threadId": state["thread"], "turn": {"id": turn, "items": [], "status": status, "error": error}})


def hello_turn(turn):
    t = state["thread"]
    message(turn, f"msg-{turn}-a", "I’ll create `hello.txt` in the workspace, then run `cat hello.txt`.", "commentary")
    req = state["next_req"]
    state["next_req"] += 1
    bare = "printf '%s\\n' 'hello from codex' > hello.txt"
    state["pending"][req] = (turn, f"exec-{turn}-1", bare)
    send({
        "id": req, "method": "item/commandExecution/requestApproval",
        "params": {
            "kind": "command", "threadId": t, "turnId": turn, "itemId": f"exec-{turn}-1",
            "startedAtMs": 1, "environmentId": "local",
            "command": f'/bin/zsh -lc "{bare}"', "cwd": state["cwd"],
            "commandActions": [{"type": "unknown", "command": bare}],
            "proposedExecpolicyAmendment": ["/bin/zsh", "-lc", bare],
            "availableDecisions": ["accept", {"acceptWithExecpolicyAmendment": {"execpolicy_amendment": ["/bin/zsh", "-lc", bare]}}, "cancel"],
        },
    })


def answered(req, decision):
    turn, iid, bare = state["pending"].pop(req)
    t = state["thread"]
    notify("serverRequest/resolved", {"threadId": t, "requestId": req})
    if decision != "accept":
        notify("item/completed", {"item": command_item(iid, f'"{bare}"', bare, "declined"), "threadId": t, "turnId": turn})
        complete(turn, "interrupted")
        return
    notify("item/started", {"item": command_item(iid, f'"{bare}"', bare, "inProgress"), "threadId": t, "turnId": turn})
    with open(os.path.join(state["cwd"], "hello.txt"), "w") as f:
        f.write("hello from codex\n")
    notify("item/completed", {"item": command_item(iid, f'"{bare}"', bare, "completed", None, 0), "threadId": t, "turnId": turn})
    cat = f"exec-{turn}-2"
    notify("item/started", {"item": command_item(cat, "'cat hello.txt'", "cat hello.txt", "inProgress"), "threadId": t, "turnId": turn})
    with open(os.path.join(state["cwd"], "hello.txt")) as f:
        output = f.read()
    notify("item/completed", {"item": command_item(cat, "'cat hello.txt'", "cat hello.txt", "completed", output, 0), "threadId": t, "turnId": turn})
    message(turn, f"msg-{turn}-b", "hello from codex", "final_answer")
    complete(turn, "completed")


def handle(msg):
    if "method" not in msg:
        note({"response": msg})
        if isinstance(msg.get("result"), dict) and msg.get("id") in state["pending"]:
            answered(msg["id"], msg["result"].get("decision"))
        return
    method, params, mid = msg["method"], msg.get("params") or {}, msg.get("id")
    note({"method": method, "params": params})
    if method == "initialize":
        send({"id": mid, "result": {"userAgent": "fake-codex/0.166.0", "platformFamily": "unix"}})
    elif method in ("thread/start", "thread/resume"):
        state["thread"] = params.get("threadId") or "th-e2e-1"
        state["cwd"] = params.get("cwd") or os.getcwd()
        send({"id": mid, "result": {"thread": {"id": state["thread"], "preview": "", "ephemeral": False}}})
        notify("thread/started", {"thread": {"id": state["thread"]}})
    elif method == "turn/start":
        state["turns"] += 1
        turn = f"turn-{state['turns']}"
        state["turn"] = turn
        text = "".join(i.get("text", "") for i in params.get("input", []))
        send({"id": mid, "result": {"turn": {"id": turn, "items": [], "status": "inProgress", "error": None}}})
        notify("turn/started", {"threadId": state["thread"], "turn": {"id": turn, "items": [], "status": "inProgress"}})
        notify("item/started", {"item": item("userMessage", f"user-{turn}", content=[{"type": "text", "text": text}]), "threadId": state["thread"], "turnId": turn})
        if "hello" in text:
            hello_turn(turn)
        elif "slow" in text:
            pass
        else:
            message(turn, f"msg-{turn}", f"turn {state['turns']}: {text}", "final_answer")
            complete(turn, "completed")
    elif method == "turn/interrupt":
        if state["turn"] != params.get("turnId"):
            send({"id": mid, "error": {"code": -32600, "message": "no active turn to interrupt"}})
            return
        send({"id": mid, "result": {}})
        complete(params["turnId"], "interrupted")
    elif mid is not None:
        send({"id": mid, "error": {"code": -32601, "message": f"fake codex: {method}"}})


for line in sys.stdin:
    line = line.strip()
    if line:
        handle(json.loads(line))
