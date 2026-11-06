#!/usr/bin/env python3
"""Signed-in relaunch check for the Reason chat (the 409 client_session_id_conflict).

Usage: reason_acp_relaunch.py FOLDER OUT_DIR CREATE_WS RELAUNCH_WS [--app-rule] [--model ID]

It runs the real `reason acp` the way OpenConductor does (src-tauri/src/reason_acp):

1. Process 1, `reason --workspace CREATE_WS acp`: `initialize`, `session/new` in
   FOLDER, one prompt. Then it is killed, as quitting the app kills it.
2. The Reason desktop app's selected workspace is now RELAUNCH_WS (the CLI's
   default). Process 2 reattaches the stored Session id and sends a follow-up:
   * without --app-rule, as the provider did before the fix: `reason
     --workspace RELAUNCH_WS acp`, `session/resume`, prompt. Expect the 409.
   * with --app-rule, as the provider does now: `reason --workspace W session
     get ID` over `reason whoami`'s saved workspaces (RELAUNCH_WS first) finds
     W, then `reason --workspace W acp`, `session/resume`, prompt.

It passes when the follow-up completes in the first Session with no 409, and
writes result.json and transcript.jsonl to OUT_DIR.
"""

import json
import os
import queue
import subprocess
import sys
import threading
import time

argv = sys.argv[1:]
MODEL = None
if "--model" in argv:
    i = argv.index("--model")
    MODEL = argv[i + 1]
    del argv[i:i + 2]
APP_RULE = "--app-rule" in argv
pos = [a for a in argv if not a.startswith("--")]
CWD = os.path.realpath(os.path.expanduser(pos[0]))
OUT = os.path.expanduser(pos[1])
CREATE_WS, RELAUNCH_WS = pos[2], pos[3]
# The CLI refuses inherited DYLD_* variables on macOS (see cli.rs).
ENV = {k: v for k, v in os.environ.items() if not k.startswith("DYLD_")}
os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "transcript.jsonl"), "a", buffering=1)


def note(s):
    with open(os.path.join(OUT, "status.txt"), "a") as f:
        f.write(time.strftime("%H:%M:%S ") + s + "\n")


class Agent:
    def __init__(self, n, workspace):
        args = ["reason", "--workspace", workspace, "acp", "-y"]
        if MODEL:
            args += ["--model", MODEL, "--reasoning-effort", "high"]
        self.n = n
        self.proc = subprocess.Popen(args, cwd=CWD, env=ENV, stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE,
                                     stderr=open(os.path.join(OUT, f"stderr{n}.txt"), "a"),
                                     text=True, bufsize=1)
        self.inbox = queue.Queue()
        self.ids = 0
        threading.Thread(target=self.reader, daemon=True).start()

    def reader(self):
        for line in self.proc.stdout:
            line = line.strip()
            if line:
                msg = json.loads(line)
                log.write(json.dumps({"t": time.time(), "p": self.n, "dir": "in", "msg": msg}) + "\n")
                self.inbox.put(msg)
        self.inbox.put(None)

    def send(self, obj):
        log.write(json.dumps({"t": time.time(), "p": self.n, "dir": "out", "msg": obj}) + "\n")
        self.proc.stdin.write(json.dumps(obj) + "\n")
        self.proc.stdin.flush()

    def request(self, method, params, turn=None, timeout=900):
        self.ids += 1
        rid = self.ids
        self.send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                m = self.inbox.get(timeout=5)
            except queue.Empty:
                continue
            if m is None:
                raise RuntimeError("reason acp exited")
            if m.get("id") == rid and "method" not in m:
                if "error" in m:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m["result"]
            method_in = m.get("method")
            if method_in == "session/request_permission":
                opts = m["params"].get("options", [])
                pick = next((o for o in opts if o.get("kind", "").startswith("allow")), opts[0])
                self.send({"jsonrpc": "2.0", "id": m["id"],
                           "result": {"outcome": {"outcome": "selected", "optionId": pick["optionId"]}}})
            elif method_in and "id" in m:
                self.send({"jsonrpc": "2.0", "id": m["id"],
                           "error": {"code": -32601, "message": "not supported"}})
            elif method_in == "session/update" and turn is not None:
                u = m["params"]["update"]
                if u.get("sessionUpdate") == "agent_message_chunk":
                    turn["text"] += (u.get("content") or {}).get("text", "")
                elif u.get("sessionUpdate") == "user_message_chunk":
                    turn["replayed"] += (u.get("content") or {}).get("text", "")
        raise RuntimeError(f"{method}: timed out")

    def init(self):
        return self.request("initialize", {
            "protocolVersion": 1,
            "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False},
                                   "terminal": False},
            "clientInfo": {"name": "openconductor-relaunch-check", "version": "0"}}, timeout=60)

    def prompt(self, sid, text):
        turn = {"text": "", "replayed": ""}
        r = self.request("session/prompt",
                         {"sessionId": sid, "prompt": [{"type": "text", "text": text}]}, turn)
        return {"stopReason": r.get("stopReason"), "text": turn["text"]}

    def kill(self):
        self.proc.kill()
        self.proc.wait()


def saved_workspaces():
    """`reason whoami`'s saved workspaces, as cli.rs parse_whoami reads them."""
    out = subprocess.run(["reason", "whoami"], capture_output=True, text=True, env=ENV).stdout
    lines = out.splitlines()
    if "Saved workspaces:" not in lines:
        return []
    rest = lines[lines.index("Saved workspaces:") + 1:]
    return [l.split()[0] for l in rest if l.startswith("  ") and l.strip()]


def locate(sid, first):
    """The provider's locate(): the first workspace whose `session get` finds it."""
    tried = []
    for w in [first] + [w for w in saved_workspaces() if w != first]:
        r = subprocess.run(["reason", "--workspace", w, "session", "get", sid, "--json"],
                           capture_output=True, text=True, env=ENV)
        tried.append({"workspace": w, "exit": r.returncode, "stderr": r.stderr.strip()[:120]})
        if r.returncode == 0:
            return w, tried
    return None, tried


result = {"mode": "app-rule" if APP_RULE else "before-fix", "create_ws": CREATE_WS,
          "relaunch_ws": RELAUNCH_WS,
          "cli": subprocess.run(["reason", "--version"], capture_output=True, text=True,
                                env=ENV).stdout.strip()}
try:
    a = Agent(1, CREATE_WS)
    a.init()
    sid = a.request("session/new", {"cwd": CWD, "mcpServers": []}, timeout=60)["sessionId"]
    result["session"] = sid
    note(f"session/new {sid}")
    result["first"] = a.prompt(sid, "Relaunch check. Reply with exactly `first ok` and nothing else.")
    note(f"first turn {result['first']}")
    a.kill()
    note("process 1 killed (app quit)")

    workspace = RELAUNCH_WS
    if APP_RULE:
        workspace, result["located"] = locate(sid, RELAUNCH_WS)
        note(f"located in {workspace}")
        if workspace is None:
            raise RuntimeError("no signed-in workspace has the Session")
    result["resumed_in"] = workspace
    b = Agent(2, workspace)
    b.init()
    b.request("session/resume", {"sessionId": sid, "cwd": CWD, "mcpServers": []}, timeout=120)
    note(f"session/resume in {workspace} ok")
    result["follow_up"] = b.prompt(sid, "Follow-up after relaunch: reply with exactly `follow-up ok`.")
    note(f"follow-up {result['follow_up']}")
    b.kill()
except Exception as e:  # recorded, then judged below
    result["error"] = str(e)
    note(f"error {e}")

text = json.dumps(result)
result["conflict_409"] = "client_session_id_conflict" in text or "(409" in text
fu = result.get("follow_up") or {}
result["pass"] = (not result["conflict_409"] and fu.get("stopReason") == "end_turn"
                  and "follow-up ok" in fu.get("text", ""))
json.dump(result, open(os.path.join(OUT, "result.json"), "w"), indent=2)
note("done pass=%s" % result["pass"])
print(json.dumps(result, indent=2))
sys.exit(0 if result["pass"] else 1)
