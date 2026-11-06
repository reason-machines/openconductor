#!/usr/bin/env python3
"""Drive a signed-in `reason acp` through one chat and record what it sends.

Usage: reason_acp_signed_in.py CHECKOUT OUT_DIR [MODEL] [WORKSPACE_SLUG]

MODEL defaults to subscription GPT-6.1 Sol, WORKSPACE_SLUG to reason-tests.
The exact subscription source is checked before starting ACP. Override its ID
with --model-source-id only when the person has authorized that source.

CHECKOUT is a fresh scratch folder under HOME containing README.md on a Mac
whose `reason` CLI is signed in. Never pass a real workspace. The chat has four
turns in one ACP session:
  1. write acp-check.txt and read README.md here: a local path,
  2. move the Session to Reason cloud,
  3. write the same file in the cloud Session's current working folder,
  4. a follow-up in the same session.
Every JSON-RPC line goes to OUT_DIR/transcript.jsonl and the classified
result to OUT_DIR/summary.json. Paths are classified with the same rule as
src-tauri/src/reason_acp/updates.rs (map_path, plus computer_is_cloud: once
Reason says the Session runs on Reason cloud, paths under the folder are the
cloud checkout's, because `reason acp` reports them under the folder).
"""
import argparse
import json
import os
import queue
import subprocess
import sys
import threading
import time

from reason_acp_smoke_checks import MODEL, SOURCE, WORKSPACE, check_source, computer_kind, verdict

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("checkout")
parser.add_argument("out_dir")
parser.add_argument("model", nargs="?", default=MODEL)
parser.add_argument("workspace", nargs="?", default=WORKSPACE, choices=[WORKSPACE])
parser.add_argument("--model-source-id", default=SOURCE)
options = parser.parse_args()
CWD = os.path.realpath(os.path.expanduser(options.checkout))
OUT = os.path.expanduser(options.out_dir)
MODEL, WORKSPACE = options.model, options.workspace
CLOUD_ROOT = "/home/runner/.reason/workspace/sessions/"
PROMPTS = [
    "Signed-in check for OpenConductor. Use your file write tool to create acp-check.txt in this folder "
    "containing the single line `local`, then use your file read tool to read README.md here and reply with "
    "only its first line. Do nothing else.",
    "Now move THIS Session to Reason cloud using the supported computer/device move operation. "
    "Never create a child Session. In the move note, say the next turn writes acp-check.txt in this "
    "Session's working folder on the cloud computer. Do nothing else, then end the turn.",
    "On the cloud computer, use your file write tool to create acp-check.txt in THIS Session's current "
    "working folder (use the execution context; do not assume a /repo subfolder) containing the single "
    "line `cloud`, then reply with the absolute path you wrote. Do not delegate, clone, attach, commit or push anything.",
    "Follow-up: reply with exactly `follow-up ok` and nothing else.",
]

os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "transcript.jsonl"), "a", buffering=1)


def note(s):
    with open(os.path.join(OUT, "status.txt"), "a") as f:
        f.write(time.strftime("%H:%M:%S ") + s + "\n")


# The CLI refuses inherited DYLD_* variables on macOS (see cli.rs).
env = {k: v for k, v in os.environ.items() if not k.startswith("DYLD_")}
preflight = {"result": "blocked", "workspace": WORKSPACE, "model": MODEL,
             "model_source_id": options.model_source_id, "reasoning_effort": "xhigh",
             "started": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "turns": []}
try:
    models = subprocess.run(["reason", "--workspace", WORKSPACE, "call", "models.list", "--input-file", "-"],
                            input="{}", capture_output=True, text=True, env=env, check=True, timeout=30)
    preflight["source_check"] = check_source(json.loads(models.stdout), MODEL, options.model_source_id)
    if not preflight["source_check"]["allowed"]:
        raise RuntimeError("required subscription source unavailable or ambiguous; no ACP session started")
    if os.path.exists(os.path.join(CWD, "acp-check.txt")) or not os.path.isfile(os.path.join(CWD, "README.md")):
        raise RuntimeError("use a fresh scratch folder with README.md and no acp-check.txt; no ACP session started")
except Exception as error:
    preflight["error"] = str(error)
    with open(os.path.join(OUT, "summary.json"), "w") as f:
        json.dump(preflight, f, indent=2)
    note("blocked before ACP; no model turn started")
    print(preflight["error"], file=sys.stderr)
    sys.exit(2)
args = ["reason", "--workspace", WORKSPACE, "acp", "-y", "--model", MODEL,
        "--reasoning-effort", "xhigh"]
proc = subprocess.Popen(args, cwd=CWD, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                        stderr=open(os.path.join(OUT, "stderr.txt"), "a"), text=True, bufsize=1)
inbox = queue.Queue()


def reader():
    for line in proc.stdout:
        line = line.strip()
        if line:
            msg = json.loads(line)
            log.write(json.dumps({"t": time.time(), "dir": "in", "msg": msg}) + "\n")
            inbox.put(msg)
    inbox.put(None)


threading.Thread(target=reader, daemon=True).start()
ids = [0]
where = {"cloud": False, "session": None, "computers": []}


def send(obj):
    log.write(json.dumps({"t": time.time(), "dir": "out", "msg": obj}) + "\n")
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()


def classify(raw):
    root = CWD.rstrip("/")
    if raw == root or raw.startswith(root + "/"):
        rel = raw[len(root) + 1:]
        if where["cloud"]:
            return {"raw": raw, "place": "cloud", "sessionId": where["session"], "relative": rel}
        return {"raw": raw, "place": "local", "relative": rel}
    if raw.startswith(CLOUD_ROOT):
        sid, _, tail = raw[len(CLOUD_ROOT):].partition("/")
        if sid and (tail == "repo" or tail.startswith("repo/")):
            return {"raw": raw, "place": "cloud", "sessionId": sid, "relative": tail[5:]}
    return {"raw": raw, "place": "other"}


def request(method, params, turn=None, timeout=1500):
    ids[0] += 1
    rid = ids[0]
    send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            m = inbox.get(timeout=5)
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
            pick = next((o for o in opts if o.get("kind", "").startswith("allow")), opts[0] if opts else None)
            send({"jsonrpc": "2.0", "id": m["id"],
                  "result": {"outcome": {"outcome": "selected", "optionId": pick["optionId"]}}})
        elif method_in and "id" in m:
            send({"jsonrpc": "2.0", "id": m["id"], "error": {"code": -32601, "message": "not supported"}})
        elif method_in == "session/update" and turn is not None:
            u = m["params"]["update"]
            update_sid = m["params"].get("sessionId")
            if update_sid not in turn["sessionIds"]:
                turn["sessionIds"].append(update_sid)
            kind = u.get("sessionUpdate")
            computer = ((u.get("_meta") or {}).get("com.reasonmachines/computer") or {})
            if kind == "session_info_update" and isinstance(computer, dict) and computer.get("kind"):
                where["cloud"] = computer["kind"] == "cloud"
                turn["computers"].append(computer.get("kind"))
            if kind == "agent_message_chunk":
                turn["text"] += (u.get("content") or {}).get("text", "")
            elif kind in ("tool_call", "tool_call_update"):
                for loc in u.get("locations") or []:
                    if loc.get("path"):
                        turn["paths"].append(classify(loc["path"]))
                for c in u.get("content") or []:
                    if c.get("type") == "diff" and c.get("path"):
                        turn["paths"].append(classify(c["path"]))
                tool = {k: u[k] for k in ("toolCallId", "title", "kind", "status", "content") if k in u}
                tool_kind = computer_kind(u, "cloud" if where["cloud"] else "headless")
                tool["place"] = "cloud" if tool_kind == "cloud" else "local"
                turn["tools"].append(tool)
            elif kind == "user_message_chunk":
                turn["reports"].append((u.get("content") or {}).get("text", ""))
    raise RuntimeError(f"{method} timed out")


summary = {**preflight, "cwd": CWD, "turns": []}
try:
    init = request("initialize", {"protocolVersion": 1, "clientCapabilities": {}})
    summary["agentInfo"] = init.get("agentInfo")
    sid = request("session/new", {"cwd": CWD, "mcpServers": []})["sessionId"]
    where["session"] = sid
    summary["sessionId"] = sid
    note(f"session {sid}")
    for n, text in enumerate(PROMPTS, 1):
        turn = {"n": n, "prompt": text, "text": "", "paths": [], "tools": [], "reports": [], "computers": [], "sessionIds": []}
        note(f"turn {n} start")
        turn["stopReason"] = request("session/prompt",
                                     {"sessionId": sid, "prompt": [{"type": "text", "text": text}]},
                                     turn).get("stopReason")
        summary["turns"].append(turn)
        note(f"turn {n} {turn['stopReason']} places={[p['place'] for p in turn['paths']]}")
        json.dump(summary, open(os.path.join(OUT, "summary.json"), "w"), indent=2)
except Exception as e:  # recorded, so a failed run still leaves evidence
    summary["error"] = repr(e)
    note("error " + repr(e))
finally:
    summary["result"] = verdict(summary, CWD)
    json.dump(summary, open(os.path.join(OUT, "summary.json"), "w"), indent=2)
    note("done " + summary["result"])
    try:
        proc.stdin.close()
        proc.wait(timeout=10)
    except Exception:
        proc.kill()
        proc.wait()
    sys.exit(0 if summary["result"] == "pass" else 1)
