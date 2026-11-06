#!/usr/bin/env python3
"""Summarise one tools/claude-code/run-e2e-mac.sh run as evidence JSON.

Reads OUT/claude-turn.json (the in-app driver's report), OUT/claude-chat-events.jsonl
(every event the app emitted to the window), OUT/cli.json and OUT/worktrees.txt.
Prints the summary; the DOM snapshot stays in claude-turn.json.
"""
import json
import os
import platform
import subprocess
import sys
from collections import Counter


def run(*args):
    try:
        return subprocess.run(args, capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return None


def turns_from_transcript(rows):
    """Groups transcript rows into turns: user, assistant parts, turn end."""
    turns, cur = [], None
    for r in rows:
        if "user" in r:
            cur = {"reply": "", "tools": [], "end": None}
            turns.append(cur)
        elif cur is None:
            continue
        elif "tools" in r:
            cur["reply"] += "".join(r.get("text") or [])
            cur["tools"] += r["tools"]
        elif "status" in r:
            cur["end"] = r
    return turns


def main(out):
    report = json.load(open(os.path.join(out, "claude-turn.json")))
    events = []
    path = os.path.join(out, "claude-chat-events.jsonl")
    if os.path.exists(path):
        events = [json.loads(l) for l in open(path) if l.strip()]
    cli = json.load(open(os.path.join(out, "cli.json")))
    worktrees = [l for l in open(os.path.join(out, "worktrees.txt")).read().split("\n") if l]

    shown = turns_from_transcript(report.get("transcript") or [])
    turns = []
    for t in report.get("turns", []):
        ui = shown[t["n"] - 1] if t["n"] - 1 < len(shown) else {}
        turns.append({
            **{k: t[k] for k in ("n", "prompt", "sentAt", "endedAt", "status", "error") if k in t},
            **({"stop": t["stop"]} if t.get("stop") else {}),
            "reply": ui.get("reply"),
            "toolRows": ui.get("tools"),
            # The files the turn's start and end checkpoints differ in (chips under the turn).
            "turnChanges": (ui.get("end") or {}).get("changes"),
            "interruptedBadge": (ui.get("end") or {}).get("interrupted"),
        })

    check = None
    for w in worktrees[1:]:
        f = os.path.join(w, "claude-check.txt")
        if os.path.exists(f):
            check = {"worktree": w, "file": "claude-check.txt", "content": open(f).read()}

    sessions = [e["sessionId"] for e in events if e.get("type") == "sessionStarted"]
    errors = [{k: e.get(k) for k in ("code", "status", "message")} for e in events if e.get("type") == "error"]
    summary = {
        "item": "claude.signed-in",
        "result": report.get("result"),
        "ranOn": {"host": run("scutil", "--get", "ComputerName") or platform.node(),
                  "macos": run("sw_vers", "-productVersion"), "arch": platform.machine()},
        "app": {"path": os.path.abspath("src-tauri/target/debug/bundle/macos/OpenConductor.app"),
                "commit": run("git", "rev-parse", "--short", "HEAD")},
        "driver": "tools/claude-code/run-e2e-mac.sh (in-app driver tools/claude-code/e2e-driver.js through the debug-only seam src-tauri/src/e2e.rs)",
        "claudeCli": cli,
        "started": report.get("started"),
        "ended": report.get("ended"),
        "workspace": report.get("workspace"),
        "agentPicker": {"label": report.get("agentLabel"), "emptyState": report.get("emptyState")},
        "claudeSessionIds": sessions,
        "savedSessions": report.get("savedSessions"),
        "turns": turns,
        "apiErrors": errors,
        "worktreeFile": check,
        "eventCounts": dict(Counter(e.get("type") for e in events)),
        "driverError": report.get("error"),
        "steps": report.get("steps"),
    }
    json.dump(summary, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main(sys.argv[1])
