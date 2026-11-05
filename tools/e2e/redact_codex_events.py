#!/usr/bin/env python3
"""Redact a live Codex chat event log before it is committed as evidence.

Command output that comes from outside the test workspace (for example a
personal skill file the user's own Codex instructions make it read) is
replaced, along with its live output chunks. Everything else is kept.

Usage: redact_codex_events.py <in.json> <out.json> <workspace path prefix>
"""
import json
import sys

src, dst, workspace = sys.argv[1:4]
events = json.load(open(src))
outside = set()
for e in events:
    if e.get("type") == "tool" and e.get("kind") == "commandExecution":
        cmd = (e.get("input") or {}).get("command") or ""
        if "/Users/" in cmd and workspace not in cmd:
            outside.add(e["id"])
out = []
for e in events:
    if e.get("type") == "tool" and e["id"] in outside and e.get("output"):
        e = {**e, "output": "[redacted: output of a file outside the workspace]"}
    if e.get("type") == "toolOutput" and e["id"] in outside:
        e = {**e, "delta": "[redacted]"}
    out.append(e)
json.dump(out, open(dst, "w"), indent=2, ensure_ascii=False)
print(f"{len(out)} events, {len(outside)} command(s) redacted: {sorted(outside)}")
