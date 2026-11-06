#!/usr/bin/env python3
"""Stand-in for `codex app-server --listen stdio://` in the Codex chat e2e.

Plays the turn recorded from Codex 0.166.0 on macOS (evidence/e2e-mac/codex.md):
commentary, a command approval offering ["accept", <execpolicy amendment>,
"cancel"], the command, a second command with output, the final answer. The
first command really writes hello.txt in the thread's cwd. Prompts:

  contains "hello"  the recorded turn above; "cancel" on the approval ends the
                    turn as interrupted, like Codex
  contains "slow"   runs until turn/interrupt
  contains "elicit" an MCP server ("linear") asks for a form with a required
                    "team"; the reply names what came back ("linear got team
                    <team>", or "linear: cancel"/"linear: decline")
  contains "perm"   Codex asks for network access; the reply says whether it
                    was granted ("permissions: network granted" or
                    "permissions: none granted")
  contains "unauth" the turn fails with "unexpected status 401 Unauthorized"
                   (signed out), as Codex 0.166.0 reports it
  anything else     replies "turn <n>: <prompt>", n counting this thread's turns

Every request it receives is appended to $HOME/codex-fake.jsonl, after one
{"launch": {"args", "launcher", "keys", "account"}} line: its arguments (the
`-c` overrides), $OC_FAKE_CODEX, which names the wrapper that started it, a
fingerprint (sha256, 16 hex) of CODEX_API_KEY and OPENAI_API_KEY or null when
unset, and the signed-in account's type (null when signed out). Every line
carries the process's "pid", so a request can be traced to its launch.
account/read answers signed out until account/login/start (ChatGPT) has run:
that sign-in completes by itself after 0.5 s as e2e@example.com and is kept
in codex-fake-account.json beside the log ($OC_FAKE_CODEX_DIR or $HOME).
account/login/start {type: "apiKey"} is answered as Codex does and logged
with the key's fingerprint ("apiKey": "sha256:<16 hex>"), never its value; it
leaves the stored ChatGPT account alone, as Codex does with
cli_auth_credentials_store="ephemeral".
Only "codex app-server" is handled; other subcommands exit 2.
"""
import hashlib
import json
import os
import sys
import threading

if sys.argv[1:2] != ["app-server"]:
    sys.stderr.write(f"fake codex: unsupported {sys.argv[1:]}\n")
    sys.exit(2)

FAKE_DIR = os.environ.get("OC_FAKE_CODEX_DIR") or os.environ.get("HOME", ".")
LOG = os.path.join(FAKE_DIR, "codex-fake.jsonl")
ACCOUNT = os.path.join(FAKE_DIR, "codex-fake-account.json")
out_lock = threading.Lock()


def send(obj):
    with out_lock:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()


def note(obj):
    with open(LOG, "a") as f:
        f.write(json.dumps({**obj, "pid": os.getpid()}) + "\n")


def read_account():
    if not os.path.exists(ACCOUNT):
        return None
    with open(ACCOUNT) as f:
        return json.load(f)


def fingerprint(name):
    value = os.environ.get(name)
    return hashlib.sha256(value.encode()).hexdigest()[:16] if value is not None else None


def notify(method, params):
    send({"method": method, "params": params})


note({"launch": {
    "args": sys.argv[1:],
    "launcher": os.environ.get("OC_FAKE_CODEX", "path"),
    "keys": {k: fingerprint(k) for k in ("CODEX_API_KEY", "OPENAI_API_KEY")},
    "account": (read_account() or {}).get("type"),
}})

state = {"thread": None, "cwd": None, "turns": 0, "turn": None, "pending": {}, "next_req": 0, "consents": {}}


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


def ask_consent(turn, kind):
    """A request held for the user: an MCP elicitation or a permission request."""
    req = f"{kind}-{turn}"
    state["consents"][req] = (turn, kind)
    t = state["thread"]
    if kind == "elicit":
        send({"id": req, "method": "mcpServer/elicitation/request", "params": {
            "threadId": t, "turnId": turn, "serverName": "linear", "mode": "form",
            "message": "Which team should own the issue?",
            "requestedSchema": {"type": "object", "properties": {"team": {"type": "string", "title": "Team"}}, "required": ["team"]},
            "_meta": None,
        }})
    else:
        send({"id": req, "method": "item/permissions/requestApproval", "params": {
            "threadId": t, "turnId": turn, "itemId": f"perm-{turn}", "startedAtMs": 1, "cwd": state["cwd"],
            "reason": "Fetch the issue tracker", "permissions": {"network": {"enabled": True}},
        }})


def consent_answered(req, result):
    turn, kind = state["consents"].pop(req)
    notify("serverRequest/resolved", {"threadId": state["thread"], "requestId": req})
    if kind == "elicit":
        action = result.get("action")
        team = (result.get("content") or {}).get("team")
        text = f"linear got team {team}" if action == "accept" else f"linear: {action}"
    else:
        granted = (result.get("permissions") or {}).get("network", {}).get("enabled")
        text = "permissions: network granted" if granted else "permissions: none granted"
    message(turn, f"msg-{turn}", text, "final_answer")
    complete(turn, "completed")


def handle(msg):
    if "method" not in msg:
        note({"response": msg})
        if isinstance(msg.get("result"), dict) and msg.get("id") in state["pending"]:
            answered(msg["id"], msg["result"].get("decision"))
        elif isinstance(msg.get("result"), dict) and msg.get("id") in state["consents"]:
            consent_answered(msg["id"], msg["result"])
        return
    method, params, mid = msg["method"], msg.get("params") or {}, msg.get("id")
    logged = dict(params)
    if isinstance(logged.get("apiKey"), str):
        logged["apiKey"] = "sha256:" + hashlib.sha256(logged["apiKey"].encode()).hexdigest()[:16]
    note({"method": method, "params": logged})
    if method == "initialize":
        send({"id": mid, "result": {"userAgent": "fake-codex/0.166.0", "platformFamily": "unix"}})
    elif method == "account/read":
        send({"id": mid, "result": {"account": read_account(), "requiresOpenaiAuth": True}})
    elif method == "account/login/start" and params.get("type") == "apiKey":
        send({"id": mid, "result": {"type": "apiKey"}})
    elif method == "account/login/start" and params.get("type") == "chatgpt":
        login = "login-e2e"
        send({"id": mid, "result": {"type": "chatgpt", "loginId": login, "authUrl": "http://127.0.0.1:1455/e2e-auth"}})

        def signed_in():
            with open(ACCOUNT, "w") as f:
                json.dump({"type": "chatgpt", "email": "e2e@example.com", "planType": "pro"}, f)
            notify("account/login/completed", {"loginId": login, "success": True, "error": None})

        threading.Timer(0.5, signed_in).start()
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
        elif "elicit" in text:
            ask_consent(turn, "elicit")
        elif "perm" in text:
            ask_consent(turn, "perm")
        elif "unauth" in text:
            complete(turn, "failed", {"message": "unexpected status 401 Unauthorized", "codexErrorInfo": None})
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
