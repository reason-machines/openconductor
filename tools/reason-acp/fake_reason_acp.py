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
* Workspaces, as `reason` 0.2.690 has them: the saved workspaces are ws-a and
  ws-b; the selected one (the Reason desktop app's selection) is ws-a unless
  the file `fake-reason-selected` in the working directory names another.
  `[--workspace SLUG] acp` serves that workspace (else the selected one), and
  a Session belongs to the workspace it was created in. `session/resume` of a
  Session in another workspace succeeds without a word, and its next prompt
  answers "Reason request failed (409 client_session_id_conflict)" with
  end_turn, as reason acp does: its resume hides the 404 and its prompt then
  creates a Session under the taken id.
* `[--workspace SLUG] whoami` prints the account, the organization and the
  saved workspaces with "[selected]" on the one in use, like `reason whoami`.
* `[--workspace SLUG] session get ID --json` prints the Session and exits 0
  when it is in that workspace, else prints "Reason: Reason request failed
  (404 session_not_found)" to stderr and exits 1.

Prompts are commands: "echo: TEXT" (reply split mid-word, prefixed with the
turn number), "slow" (a running tool until session/cancel), "report" (a
mid-turn user_message_chunk), "local" (a diff in the session's working folder),
"cloud" (a diff under a cloud checkout), "write: a.txt=one;b.txt=two" (write
files in the session's folder), "crash" (exit without answering),
"config" (replies "model=M effort=E"), "attachments" (replies with each
embedded resource as "NAME: TEXT", NAME the last part of its uri),
"permission" (asks session/request_permission for a tool call, then replies
"permission: OPTION" with the chosen optionId or "cancelled"),
"lisbon" (replays Conductor's reference transcript turn, tools/screens/seed-data.js
'lisbon': text, Grep, Read, text, Edit, Bash, text; each tool is a tool_call then a
tool_call_update to completed, with ACP kind, rawInput and _meta.claudeCode.toolName;
LISBON_PROMPT, the fixture's user message, is an alias).

session/new reports configOptions `model` and `reasoning_effort` like
Reason does (session/close forgets an unprompted one); `session get --json`
reports the model a Session ran on (Claude Opus 5.5 for "default") and its
reasoning effort; session/set_config_option with a value an option does not
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
SAVED = ["ws-a", "ws-b"]


def selected_workspace():
    try:
        with open(os.path.join(HOME, "fake-reason-selected")) as f:
            return f.read().strip() or "ws-a"
    except OSError:
        return "ws-a"


ARGS = sys.argv[1:]
WORKSPACE = selected_workspace()
if ARGS[:1] == ["--workspace"]:
    WORKSPACE, ARGS = ARGS[1], ARGS[2:]
CLOUD = "/home/runner/.reason/workspace/sessions/child-1/repo"
lock = threading.Lock()
opened = set()
foreign = set()  # resumed Sessions of another workspace: their prompts get the 409
running = {}  # session id -> (request id, threading.Event)
asks = {}  # our request id -> (threading.Event, [response])
next_ask = [0]


def send(msg):
    with lock:
        sys.stdout.write(json.dumps(dict(jsonrpc="2.0", **msg)) + "\n")
        sys.stdout.flush()


def update(sid, **u):
    send({"method": "session/update", "params": {"sessionId": sid, "update": u}})


def text(sid, kind, t):
    update(sid, sessionUpdate=kind, content={"type": "text", "text": t})


def ask(sid, method, params):
    """Sends a request to the client and waits for its answer."""
    with lock:
        next_ask[0] += 1
        rid = f"ask-{next_ask[0]}"
        asks[rid] = (threading.Event(), [])
    send({"id": rid, "method": method, "params": params})
    done, box = asks[rid]
    done.wait(60)
    return box[0] if box else None


LISBON_PROMPT = ("After signing in, users with an expired session get bounced between "
                 "/login and /dashboard forever. Can you find out why and fix it?")
OLD_LINE = '  if (session) return "/dashboard";'
NEW_LINE = '  if (session && session.expiresAt > Date.now()) return "/dashboard";'


def lisbon(sid, cwd):
    """Conductor's reference turn (tools/chat/transcript-fixture.tsx)."""
    auth = cwd.rstrip("/") + "/src/lib/auth.ts"

    def tool(n, name, kind, title, raw_input, result=None, diff=None, locations=None):
        row = {"toolCallId": f"lisbon:{n}", "title": title, "kind": kind, "rawInput": raw_input,
               "_meta": {"claudeCode": {"toolName": name}}}
        if locations:
            row["locations"] = locations
        update(sid, sessionUpdate="tool_call", status="pending", **row)
        content = [{"type": "content", "content": {"type": "text", "text": result}}] if result else []
        if diff:
            content.append(diff)
        update(sid, sessionUpdate="tool_call_update", status="completed", content=content, **row)

    text(sid, "agent_message_chunk", "I'll look at how the login route decides where to send a signed-in user.")
    tool(1, "Grep", "search", "Grep: redirectTo", {"pattern": "redirectTo", "path": "src"},
         'src/routes/login.tsx:18:  const redirectTo = search.next ?? "/dashboard";\n'
         "src/lib/auth.ts:42:export function redirectTo(session) {")
    tool(2, "Read", "read", "Read src/lib/auth.ts", {"file_path": auth},
         'export function redirectTo(session) {\n  if (session) return "/dashboard";\n  return "/login";\n}',
         locations=[{"path": auth}])
    text(sid, "agent_message_chunk",
         "Found it. `redirectTo` treats any session object as signed in, including an expired one, "
         "while the dashboard loader rejects expired sessions and sends the user back to `/login`. "
         "I'll check `expiresAt` before redirecting.")
    tool(3, "Edit", "edit", "Edit src/lib/auth.ts",
         {"file_path": auth, "old_string": OLD_LINE, "new_string": NEW_LINE},
         diff={"type": "diff", "path": auth, "oldText": OLD_LINE, "newText": NEW_LINE},
         locations=[{"path": auth}])
    tool(4, "Bash", "execute", "pnpm test src/lib/auth.test.ts",
         {"command": "pnpm test src/lib/auth.test.ts", "description": "Run the auth tests"}, "4 passed")
    text(sid, "agent_message_chunk",
         "Fixed. Expired sessions now go straight to `/login` instead of looping.\n\n"
         "- `src/lib/auth.ts`: only redirect to the dashboard when the session has not expired.\n"
         "- Tests: `pnpm test src/lib/auth.test.ts` passes (4 tests).")


def load():
    try:
        with open(STATE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"sessions": {}}


def save(state):
    with open(STATE, "w") as f:
        json.dump(state, f)


def begin(rid, p):
    """Registers the prompt before its thread starts, so a session/cancel
    read right after it always finds it (the thread may run later)."""
    sid = p["sessionId"]
    if sid not in opened:
        send({"id": rid, "error": {"code": -32002, "message": f"Resource not found: {sid}"}})
        return None
    prev = running.pop(sid, None)
    if prev:
        send({"id": prev[0], "result": {"stopReason": "cancelled"}})
        prev[1].set()
    cancel = threading.Event()
    running[sid] = (rid, cancel)
    return cancel


def prompt(rid, p, cancel):
    sid = p["sessionId"]
    state = load()
    session = state["sessions"][sid]
    session["turns"] += 1
    save(state)
    cmd = "".join(b.get("text", "") for b in p["prompt"])
    stop = "end_turn"
    # Real paths: on macOS the temp folder /var/... is a symlink to /private/var/...
    cwd = os.path.realpath(session["cwd"])
    inside_home = cwd == HOME or cwd.startswith(HOME.rstrip("/") + "/")
    if sid in foreign:
        text(sid, "agent_message_chunk", "Reason request failed (409 client_session_id_conflict)")
    elif not inside_home:
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
    elif cmd == "permission":
        tool = {"toolCallId": "tool:p", "title": "bash: rm -rf build", "kind": "execute"}
        update(sid, sessionUpdate="tool_call", status="pending", **tool)
        options = [{"optionId": "allow", "name": "Allow", "kind": "allow_once"},
                   {"optionId": "reject", "name": "Reject", "kind": "reject_once"}]
        answer = ask(sid, "session/request_permission", {"sessionId": sid, "toolCall": tool, "options": options})
        outcome = ((answer or {}).get("result") or {}).get("outcome") or {}
        chosen = outcome.get("optionId") if outcome.get("outcome") == "selected" else "cancelled"
        update(sid, sessionUpdate="tool_call_update", status="completed" if chosen == "allow" else "failed", **tool)
        text(sid, "agent_message_chunk", f"permission: {chosen}")
        if cancel.is_set():
            stop = "cancelled"
    elif cmd in ("lisbon", LISBON_PROMPT):
        lisbon(sid, session["cwd"])
    elif cmd == "crash":
        os._exit(3)
    if running.get(sid, (None,))[0] == rid:
        running.pop(sid)
        send({"id": rid, "result": {"stopReason": stop}})


def handle(msg):
    rid, method, p = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if method is None and rid in asks:
        done, box = asks.pop(rid)
        box.append(msg)
        done.set()
        return
    if method == "initialize":
        caps = {"loadSession": True, "sessionCapabilities": {"list": {}, "resume": {}, "close": {}}}
        send({"id": rid, "result": {"protocolVersion": 1, "agentCapabilities": caps,
                                    "agentInfo": {"name": "reason"}}})
    elif method == "session/new":
        state = load()
        taken = [int(k[5:]) for k in state["sessions"] if k.startswith("sess-") and k[5:].isdigit()]
        sid = f"sess-{max(taken, default=0) + 1}"
        state["sessions"][sid] = {"cwd": p["cwd"], "turns": 0, "title": None, "workspace": WORKSPACE}
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
    elif method == "session/close":
        sid = p.get("sessionId")
        opened.discard(sid)
        state = load()
        session = state["sessions"].get(sid)
        if session is not None and session["turns"] == 0:
            # Reason keeps no Session that never got a prompt.
            del state["sessions"][sid]
            save(state)
        send({"id": rid, "result": {}})
    elif method == "session/resume":
        session = load()["sessions"].get(p["sessionId"])
        if session is not None:
            opened.add(p["sessionId"])
            if session.get("workspace", "ws-a") != WORKSPACE:
                foreign.add(p["sessionId"])
            send({"id": rid, "result": {}})
        else:
            send({"id": rid, "error": {"code": -32002, "message": "Resource not found"}})
    elif method == "session/list":
        items = [{"sessionId": k, "cwd": v["cwd"], "title": f"{v['turns']} turns"}
                 for k, v in load()["sessions"].items() if v.get("workspace", "ws-a") == WORKSPACE]
        send({"id": rid, "result": {"sessions": items}})
    elif method == "session/prompt":
        cancel = begin(rid, p)
        if cancel is not None:
            threading.Thread(target=prompt, args=(rid, p, cancel), daemon=True).start()
    elif method == "session/cancel":
        entry = running.get(p.get("sessionId"))
        if entry:
            entry[1].set()
    elif rid is not None:
        send({"id": rid, "error": {"code": -32601, "message": f"Method not found: {method}"}})


def whoami():
    print("e2e@example.com")
    print(f"Organization: Workspace {WORKSPACE}")
    print("Saved workspaces:")
    for slug in [WORKSPACE] + [w for w in SAVED if w != WORKSPACE]:
        print(f"  {slug} (Workspace {slug})" + (" [selected]" if slug == WORKSPACE else ""))


def session_get(sid):
    session = load()["sessions"].get(sid)
    if session is None or session.get("workspace", "ws-a") != WORKSPACE:
        sys.stderr.write("Reason: Reason request failed (404 session_not_found)\n")
        sys.exit(1)
    # Auto ("default") runs Reason's pick; the fake picks Claude Opus 5.5.
    config = session.get("config", {})
    model = config.get("model", "default")
    effort = config.get("reasoning_effort", "default")
    print(json.dumps({"session_id": sid, "status": "exit", "title": session.get("title"),
                      "model": None if session["turns"] == 0 else
                      ("byok:anthropic:claude-opus-5-5" if model == "default" else model),
                      "reasoning_effort": "high" if effort == "default" else effort}))


if ARGS[:1] == ["whoami"]:
    whoami()
elif ARGS[:2] == ["session", "get"]:
    session_get(ARGS[2])
else:
    for line in sys.stdin:
        if line.strip():
            handle(json.loads(line))
