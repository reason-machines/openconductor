#!/usr/bin/env python3
"""A scriptable stand-in for `reason acp`, for the provider tests.

It speaks the subset of ACP the provider uses and reproduces the Reason
behaviours the provider has to handle (see src-tauri/src/reason_acp/):

* session/new with a cwd outside the home folder succeeds; the first prompt then
  answers with the notice "Reason request failed (404 device_not_found)" as
  an agent_message_chunk and stopReason end_turn, like reason acp does.
* A prompt for a session this process has not opened fails with -32002,
  so a restarted provider must session/resume first.
* A prompt sent while another runs ends the earlier one with "cancelled".
* Sessions persist in state.json in the working directory across
  processes; the working directory also stands in for the home folder.

Prompts are commands: "echo: TEXT" (reply split mid-word, prefixed with the
turn number), "slow" (a running tool until session/cancel), "report" (a
mid-turn user_message_chunk), "local" (a diff in the session's working folder),
"cloud" (a diff under a cloud checkout), "write: a.txt=one;b.txt=two" (write
files in the session's folder), "crash" (exit without answering),
"config" (replies "model=M effort=E"), "attachments" (replies with each
embedded resource as "NAME: TEXT", NAME the last part of its uri).

session/new reports configOptions `model` and `reasoning_effort` like
Reason does; session/set_config_option with a value an option does not
offer resets it to "default" without an error, as Reason does.
"""
import json
import os
import sys
import threading
import urllib.parse

OPTIONS = {
    "model": ("Model", ["default", "byok:anthropic:claude-opus-5-5", "byok:openai-codex:gpt-5.6-sol"]),
    "reasoning_effort": ("Reasoning", ["default", "low", "medium", "high", "xhigh", "max"]),
}


def config_options(config):
    return [{"id": k, "name": name, "type": "select", "currentValue": config.get(k, "default"),
             "options": [{"value": v, "name": v} for v in values]}
            for k, (name, values) in OPTIONS.items()]

HOME = os.path.realpath(os.getcwd())
STATE = os.path.join(HOME, "state.json")
CLOUD = "/home/runner/.reason/workspace/sessions/child-1/repo"
lock = threading.Lock()
opened = set()
running = {}  # session id -> (request id, threading.Event)


def send(msg):
    with lock:
        sys.stdout.write(json.dumps(dict(jsonrpc="2.0", **msg)) + "\n")
        sys.stdout.flush()


def update(sid, **u):
    send({"method": "session/update", "params": {"sessionId": sid, "update": u}})


def text(sid, kind, t):
    update(sid, sessionUpdate=kind, content={"type": "text", "text": t})


def load():
    try:
        with open(STATE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"sessions": {}}


def save(state):
    with open(STATE, "w") as f:
        json.dump(state, f)


def prompt(rid, p):
    sid = p["sessionId"]
    if sid not in opened:
        return send({"id": rid, "error": {"code": -32002, "message": f"Resource not found: {sid}"}})
    prev = running.pop(sid, None)
    if prev:
        send({"id": prev[0], "result": {"stopReason": "cancelled"}})
        prev[1].set()
    cancel = threading.Event()
    running[sid] = (rid, cancel)
    state = load()
    session = state["sessions"][sid]
    session["turns"] += 1
    save(state)
    cmd = "".join(b.get("text", "") for b in p["prompt"])
    stop = "end_turn"
    # Real paths: on macOS the temp folder /var/... is a symlink to /private/var/...
    cwd = os.path.realpath(session["cwd"])
    inside_home = cwd == HOME or cwd.startswith(HOME.rstrip("/") + "/")
    if not inside_home:
        text(sid, "agent_message_chunk", "Reason request failed (404 device_not_found)")
    elif cmd.startswith("echo: "):
        reply = f"turn {session['turns']}: {cmd[6:]}"
        half = len(reply) // 2
        text(sid, "agent_thought_chunk", "thinking")
        text(sid, "agent_message_chunk", reply[:half])
        text(sid, "agent_message_chunk", reply[half:])
    elif cmd == "slow":
        tool = {"toolCallId": "tool:1", "title": "bash: sleep", "kind": "execute"}
        update(sid, sessionUpdate="tool_call", status="in_progress", **tool)
        if cancel.wait(10):
            update(sid, sessionUpdate="tool_call_update", status="failed", **tool)
            stop = "cancelled"
    elif cmd == "report":
        text(sid, "user_message_chunk", "Child report: done")
        text(sid, "agent_message_chunk", "ok")
    elif cmd == "local":
        diff = {"type": "diff", "path": session["cwd"].rstrip("/") + "/a.txt", "oldText": None, "newText": "hi"}
        update(sid, sessionUpdate="tool_call", toolCallId="tool:3", title="write: a.txt",
               kind="edit", status="completed", content=[diff])
    elif cmd == "cloud":
        diff = {"type": "diff", "path": CLOUD + "/a.txt", "oldText": None, "newText": "hi"}
        update(sid, sessionUpdate="tool_call", toolCallId="tool:2", title="write: a.txt",
               kind="edit", status="completed", content=[diff])
    elif cmd == "config":
        c = session.get("config", {})
        text(sid, "agent_message_chunk", f"model={c.get('model', 'default')} effort={c.get('reasoning_effort', 'default')}")
    elif cmd == "attachments":
        parts = [f"{urllib.parse.unquote(b['resource']['uri'].rsplit('/', 1)[-1])}: {b['resource']['text']}"
                 for b in p["prompt"] if b.get("type") == "resource"]
        text(sid, "agent_message_chunk", " | ".join(parts))
    elif cmd.startswith("write: "):
        # "write: a.txt=one;b.txt=two" writes files in the chat's folder, like
        # an agent editing the workspace (the checkpoint e2e resets them).
        names = []
        for spec in cmd[7:].split(";"):
            name, _, content = spec.partition("=")
            with open(os.path.join(cwd, name), "w") as f:
                f.write(content + "\n")
            names.append(name)
        text(sid, "agent_message_chunk", f"turn {session['turns']} wrote {' '.join(names)}")
    elif cmd == "crash":
        os._exit(3)
    if running.get(sid, (None,))[0] == rid:
        running.pop(sid)
        send({"id": rid, "result": {"stopReason": stop}})


def handle(msg):
    rid, method, p = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if method == "initialize":
        caps = {"loadSession": True, "sessionCapabilities": {"list": {}, "resume": {}, "close": {}}}
        send({"id": rid, "result": {"protocolVersion": 1, "agentCapabilities": caps,
                                    "agentInfo": {"name": "reason"}}})
    elif method == "session/new":
        state = load()
        sid = f"sess-{len(state['sessions']) + 1}"
        state["sessions"][sid] = {"cwd": p["cwd"], "turns": 0, "title": None}
        save(state)
        opened.add(sid)
        send({"id": rid, "result": {"sessionId": sid, "configOptions": config_options({})}})
    elif method == "session/set_config_option":
        state = load()
        session = state["sessions"].get(p["sessionId"])
        if session is None or p["sessionId"] not in opened:
            return send({"id": rid, "error": {"code": -32002, "message": "Resource not found"}})
        values = OPTIONS.get(p["configId"], (None, []))[1]
        config = session.setdefault("config", {})
        config[p["configId"]] = p["value"] if p["value"] in values else "default"
        save(state)
        send({"id": rid, "result": {"configOptions": config_options(config)}})
    elif method == "session/resume":
        if p["sessionId"] in load()["sessions"]:
            opened.add(p["sessionId"])
            send({"id": rid, "result": {}})
        else:
            send({"id": rid, "error": {"code": -32002, "message": "Resource not found"}})
    elif method == "session/list":
        items = [{"sessionId": k, "cwd": v["cwd"], "title": f"{v['turns']} turns"}
                 for k, v in load()["sessions"].items()]
        send({"id": rid, "result": {"sessions": items}})
    elif method == "session/prompt":
        threading.Thread(target=prompt, args=(rid, p), daemon=True).start()
    elif method == "session/cancel":
        entry = running.get(p.get("sessionId"))
        if entry:
            entry[1].set()
    elif rid is not None:
        send({"id": rid, "error": {"code": -32601, "message": f"Method not found: {method}"}})


for line in sys.stdin:
    if line.strip():
        handle(json.loads(line))
