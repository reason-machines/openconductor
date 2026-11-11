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
* `status --json`, `login` and `connect`, for Settings › Agents › Reason, in
  `reason` 0.2.692's formats (evidence/reason-acp/account.md). The account
  is signed in unless the file `fake-reason-signed-out` is in the working
  directory; `login` then prints a link and a code and marks the sign-in
  pending, and the next `status` finds it done (the user used the link).
  With `fake-reason-require-approval`, status stays signed out until the
  test removes `fake-reason-signed-out` to simulate explicit approval.
  With REASON_API_KEY set the account is signed in with credential
  `api_key`. `connect` connects this computer (file `fake-reason-connected`).
* `[--workspace SLUG] call OPERATION --input-file -` answers the public API
  operations Routines use (getSelf, listReasons, listMembers and the Loop
  operations) with `reason call`'s envelope; see `call` below.
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
LISBON_PROMPT, the fixture's user message, is an alias),
"tallinn" (Conductor's pending-permission reference, tools/screens/seed-data.js
'needs-permission': text, then a Bash tool_call left pending while it asks
session/request_permission with Yes/No options; replies "permission: OPTION"
once answered; TALLINN_PROMPT, that fixture's user message, is an alias).

session/new reports configOptions `model` and `reasoning_effort` like
Reason does (session/close drops one that never got a prompt, as Reason
keeps none); `session get --json`
reports the model a Session ran on (Claude Opus 5.5 for "default") and its
reasoning effort; session/set_config_option with a value an option does not
offer resets it to "default" without an error, as Reason does.
"""
import json
import os
import sys
import threading
import urllib.parse

# Values, names and descriptions as `reason acp` 0.2.692 reports them (a subset).
MODELS = [
    ("default", "Auto", "Your Workspace's default"),
    ("byok:anthropic:claude-opus-5-5", "Claude Opus 5.5", "Claude · Subscription"),
    ("byok:openai-codex:gpt-5.6-sol", "GPT-5.6-Sol", "ChatGPT · Subscription"),
    ("byok:anthropic:claude-sonnet-5-5", "Claude Sonnet 5.5", "Claude · Subscription"),
    ("byok:anthropic:claude-haiku-5-5", "Claude Haiku 5.5", "Claude · Subscription"),
    ("byok:anthropic:claude-opus-4-8", "Claude Opus 4.8", "Claude · Subscription"),
    ("byok:openai-codex:gpt-6.1-sol", "GPT-6.1-Sol", "ChatGPT · Subscription"),
]
OPTIONS = {
    "model": ("Model", [m[0] for m in MODELS]),
    "reasoning_effort": ("Reasoning", ["default", "low", "medium", "high", "xhigh", "max"]),
}
NAMES = {m[0]: (m[1], m[2]) for m in MODELS}


def option(value):
    name, description = NAMES.get(value, (value, None))
    return {"value": value, "name": name, **({"description": description} if description else {})}


def config_options(config):
    return [{"id": k, "name": name, "type": "select", "currentValue": config.get(k, "default"),
             "options": [option(v) for v in values]}
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
        asks[rid] = entry = (threading.Event(), [])
    # Read before sending: a client that answers at once has the entry popped by then.
    done, box = entry
    send({"id": rid, "method": method, "params": params})
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


TALLINN_PROMPT = "Return X-RateLimit-Limit and X-RateLimit-Remaining headers on every API response."
TALLINN_TEXT = "I'll add both headers in the rate limit middleware, then run its tests."
TALLINN_COMMAND = "pnpm test src/middleware/rate-limit.test.ts"


def tallinn(sid):
    """Conductor's pending-permission reference turn (tools/screens/seed-data.js 'needs-permission')."""
    text(sid, "agent_message_chunk", TALLINN_TEXT)
    tool = {"toolCallId": "tallinn:1", "title": TALLINN_COMMAND, "kind": "execute",
            "rawInput": {"command": TALLINN_COMMAND, "description": "Run the rate limit tests"},
            "_meta": {"claudeCode": {"toolName": "Bash"}}}
    update(sid, sessionUpdate="tool_call", status="pending", **tool)
    options = [{"optionId": "allow", "name": "Yes", "kind": "allow_once"},
               {"optionId": "reject", "name": "No", "kind": "reject_once"}]
    answer = ask(sid, "session/request_permission", {"sessionId": sid, "toolCall": tool, "options": options})
    outcome = ((answer or {}).get("result") or {}).get("outcome") or {}
    chosen = outcome.get("optionId") if outcome.get("outcome") == "selected" else "cancelled"
    update(sid, sessionUpdate="tool_call_update", status="completed" if chosen == "allow" else "failed", **tool)
    text(sid, "agent_message_chunk", f"permission: {chosen}")


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
    elif cmd in ("tallinn", TALLINN_PROMPT):
        tallinn(sid)
        if cancel.is_set():
            stop = "cancelled"
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
        sid = f"sess-{len(state['sessions']) + 1}"
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
        # Reason keeps no Session that never got a prompt.
        state = load()
        if state["sessions"].get(p.get("sessionId"), {}).get("turns") == 0:
            del state["sessions"][p["sessionId"]]
            save(state)
        opened.discard(p.get("sessionId"))
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
    if os.path.exists(os.path.join(HOME, "fake-reason-discovery-offline")):
        sys.exit(1)
    print("e2e@example.com")
    print(f"Organization: Workspace {WORKSPACE}")
    print("Saved workspaces:")
    for slug in [WORKSPACE] + [w for w in SAVED if w != WORKSPACE]:
        print(f"  {slug} (Workspace {slug})" + (" [selected]" if slug == WORKSPACE else ""))


def session_get(sid):
    if os.path.exists(os.path.join(HOME, "fake-reason-discovery-offline")):
        sys.exit(1)
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


def marker(name):
    return os.path.join(HOME, name)


def status():
    key = os.environ.get("REASON_API_KEY")
    if (os.path.exists(marker("fake-reason-login-pending"))
            and not os.path.exists(marker("fake-reason-require-approval"))):
        for m in ("fake-reason-login-pending", "fake-reason-signed-out"):
            os.remove(marker(m)) if os.path.exists(marker(m)) else None
    signed_in = bool(key) or not os.path.exists(marker("fake-reason-signed-out"))
    ids = {w: f"org-{w}" for w in SAVED}
    connected = os.path.exists(marker("fake-reason-connected"))
    print(json.dumps({
        "version": "0.2.692",
        "channel": "production",
        "account": {"id": "u1", "name": "E2E", "email": "e2e@example.com",
                    "credential": "api_key" if key else "login"} if signed_in else None,
        "account_error": None,
        "organization": {"id": ids[WORKSPACE] if WORKSPACE in ids else WORKSPACE,
                         "name": f"Workspace {WORKSPACE}", "slug": WORKSPACE} if signed_in else None,
        "workspaces": [{"id": ids[w], "slug": w, "name": f"Workspace {w}", "selected": w == WORKSPACE}
                       for w in SAVED] if signed_in else [],
        "mcp": [],
        "connection": {"workspaces": [{"organization_id": ids[WORKSPACE], "state": "connected",
                                       "blocked": False}]} if signed_in and connected else None,
    }))


def login():
    if not os.path.exists(marker("fake-reason-signed-out")):
        print("Already signed in as e2e@example.com.")
        return
    open(marker("fake-reason-login-pending"), "w").close()
    print("Open this link to sign in to Reason: https://reasonmachines.com/cli/connect?request=e2e-request")
    print("The page shows the code E2E1-CODE.")
    print("It finishes on its own once you have; run `reason login` again any time to see where it stands.")


# `call OPERATION --input-file -`: the public API operations Routines use, in the
# shapes `reason tools describe` documents (0.2.673). Loops live in
# fake-reason-loops-<workspace>.json in the working directory. The account's
# user is u1; the workspace has a main Reason of its own (mine) and one shared
# with it, whose Loop u2 created. `fake-reason-signed-out` makes every call
# fail with authentication_required, exit 1.
MAIN_REASON = "11111111-1111-4111-8111-111111111111"
SHARED_REASON = "22222222-2222-4222-8222-222222222222"


def envelope(data=None, error=None, code=0):
    out = {"schema_version": 1, "ok": error is None}
    out["error" if error else "data"] = error if error else data
    print(json.dumps(out))
    sys.exit(code)


def loops_path():
    return marker(f"fake-reason-loops-{WORKSPACE}.json")


def load_loops():
    try:
        with open(loops_path()) as f:
            return json.load(f)
    except OSError:
        seeded = [{"id": "33333333-3333-4333-8333-333333333333", "reason_id": SHARED_REASON, "name": "Nightly triage",
                   "prompt": "Triage new issues.", "enabled": True, "status": "active", "paused_reason": None,
                   "wakes_on": [{"kind": "schedule", "description": "0 2 * * *"}],
                   "schedule": {"kind": "cron", "expression": "0 2 * * *", "every_seconds": None,
                                "timezone": "UTC", "next_run_at": "2026-11-07T02:00:00Z"},
                   "event_trigger": None, "slack": None, "execution_mode": "new_session", "session_id": None,
                   "latest_session_id": None, "device_id": None, "repository": None, "model": None,
                   "notification_policy": "important_updates", "until": None, "max_runs": None, "run_count": 0,
                   "last_run": None, "created_by_user_id": "u2",
                   "viewer_access": {"edit": False, "stop": False}}]
        save_loops(seeded)
        return seeded


def save_loops(loops):
    with open(loops_path(), "w") as f:
        json.dump(loops, f)


def wake_fields(wake_on, timezone, loop):
    loop["wakes_on"], loop["schedule"], loop["event_trigger"], loop["repository"] = [], None, None, None
    key = None
    for w in wake_on:
        if "schedule" in w:
            loop["wakes_on"].append({"kind": "schedule", "description": w["schedule"]})
            loop["schedule"] = {"kind": "cron", "expression": w["schedule"], "every_seconds": None,
                                "timezone": timezone or "UTC", "next_run_at": "2026-11-07T09:00:00Z"}
        elif "webhook" in w:
            loop["wakes_on"].append({"kind": "webhook", "description": "webhook"})
            loop["event_trigger"] = {"kind": "webhook", "url": f"https://api.example.test/hooks/{loop['id']}"}
            key = "rlk_fake_key"
        elif "github" in w:
            g = w["github"]
            # Reads give a GitHub wake's words only, not its fields.
            loop["wakes_on"].append({"kind": "github", "description": f"{g['event']} on {g['repo']}"})
            loop["event_trigger"] = loop["event_trigger"] or {"kind": "github", "url": None}
            loop["repository"] = g["repo"]
        else:
            envelope(error={"code": "invalid_input", "message": "unknown wake"}, code=1)
    return key


def call(op):
    if os.path.exists(marker("fake-reason-signed-out")) and not os.environ.get("REASON_API_KEY"):
        envelope(error={"code": "authentication_required",
                        "message": "Sign in with reason login or supply REASON_API_KEY for the selected API origin."},
                 code=1)
    raw = sys.stdin.read()
    inp = json.loads(raw) if raw.strip() else {}
    path, body = inp.get("path", {}), inp.get("body", {})
    with open(marker("fake-reason-calls.log"), "a") as f:
        f.write(json.dumps({"workspace": WORKSPACE, "op": op, "input": inp}) + "\n")
    loops = load_loops()
    found = next((l for l in loops if l["id"] == path.get("loopId") and l["reason_id"] == path.get("reasonId")), None)
    if op == "getSelf":
        envelope({"principal_type": "user", "user_id": "u1", "user_name": "E2E", "email": "e2e@example.com",
                  "org_id": f"org-{WORKSPACE}", "organization_name": f"Workspace {WORKSPACE}"})
    if op == "listReasons":
        envelope({"items": [{"id": MAIN_REASON, "name": "E2E", "main": True, "mine": True, "audience": "personal"},
                            {"id": SHARED_REASON, "name": "Team triage", "main": False, "mine": False,
                             "audience": "workspace"}]})
    if op == "listMembers":
        envelope({"items": [{"user_id": "u1", "email": "e2e@example.com", "role": "admin", "avatar_url": None},
                            {"user_id": "u2", "email": "grace@example.com", "role": "member", "avatar_url": None}],
                  "invites": [], "total": 2, "has_next_page": False, "end_cursor": None})
    if op == "listReasonLoops":
        envelope({"items": [l for l in loops if l["reason_id"] == path.get("reasonId")]})
    if op == "createReasonLoop":
        loop = {"id": f"44444444-4444-4444-8444-{len(loops):012d}", "reason_id": path["reasonId"],
                "name": body.get("name") or body["prompt"][:40], "prompt": body["prompt"],
                "enabled": body.get("enabled", True), "paused_reason": None, "slack": None,
                "execution_mode": "new_session", "session_id": None, "latest_session_id": None, "device_id": None,
                "model": body.get("model"), "notification_policy": "important_updates", "until": None,
                "max_runs": None, "run_count": 0, "last_run": None, "created_by_user_id": "u1",
                "viewer_access": {"edit": True, "stop": True}}
        loop["status"] = "active" if loop["enabled"] else "paused"
        key = wake_fields(body["wake_on"], body.get("timezone"), loop)
        loops.append(loop)
        save_loops(loops)
        out = {"loop": loop}
        if key:
            out.update(url=loop["event_trigger"]["url"], key=key)
        envelope(out)
    if op in ("getReasonLoop", "updateReasonLoop", "deleteReasonLoop", "runReasonLoop") and not found:
        envelope(error={"code": "loop_not_found", "message": "No such Loop"}, code=1)
    if op == "getReasonLoop":
        envelope(found)
    if op == "updateReasonLoop":
        key = None
        for k in ("name", "prompt", "model"):
            if k in body:
                found[k] = body[k]
        if "enabled" in body:
            found["enabled"] = body["enabled"]
            found["status"] = "active" if body["enabled"] else "paused"
        if "wake_on" in body:
            key = wake_fields(body["wake_on"], body.get("timezone"), found)
        save_loops(loops)
        out = {"loop": found}
        if key:
            out.update(url=found["event_trigger"]["url"], key=key)
        envelope(out)
    if op == "deleteReasonLoop":
        save_loops([l for l in loops if l is not found])
        envelope({"ok": True})
    if op == "runReasonLoop":
        if not found["schedule"]:
            envelope(error={"code": "routine_not_scheduled", "message": "Only events wake this Loop"}, code=1)
        if not found["enabled"]:
            envelope(error={"code": "routine_not_active", "message": "The Loop is paused"}, code=1)
        found["run_count"] += 1
        found["latest_session_id"] = "55555555-5555-4555-8555-555555555555"
        found["last_run"] = {"status": "running", "at": "2026-11-06T12:30:00Z",
                             "session_id": found["latest_session_id"]}
        save_loops(loops)
        envelope({"loop": found})
    envelope(error={"code": "invalid_input",
                    "message": "Invalid command or input. Run reason tools --help and reason tools describe OPERATION."},
             code=2)


if ARGS[:1] == ["call"]:
    call(ARGS[1])
elif ARGS[:1] == ["whoami"]:
    whoami()
elif ARGS[:2] == ["status", "--json"]:
    status()
elif ARGS[:1] == ["login"]:
    login()
elif ARGS[:1] == ["logout"]:
    open(marker("fake-reason-signed-out"), "w").close()
    print("Signed out of Reason.")
elif ARGS[:1] == ["connect"]:
    open(marker("fake-reason-connected"), "w").close()
    print("Connected this computer to Reason.")
elif ARGS[:2] == ["session", "get"]:
    session_get(ARGS[2])
else:
    for line in sys.stdin:
        if line.strip():
            handle(json.loads(line))
