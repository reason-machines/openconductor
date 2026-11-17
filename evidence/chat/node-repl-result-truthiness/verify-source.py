#!/usr/bin/env python3
"""Verify inert reference bytes, frozen cases and the exact Node-only hunk."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--renderer", required=True, type=Path)
parser.add_argument("--root", required=True, type=Path)
parser.add_argument("--baseline", required=True)
args = parser.parse_args()
here = Path(__file__).resolve().parent
source = json.loads((here / "source.json").read_text())
freeze = json.loads((here / "freeze.json").read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
raw = args.renderer.read_bytes()
assert len(raw) == source["parent"]["bytes"]
assert sha(raw) == source["parent"]["sha256"]
assert sha((here / "source.json").read_bytes()) == freeze["source_manifest_sha256"]
for span in [*source["spans"], json.loads((here / "source-constant.json").read_text())]:
    value = raw[span["start"]:span["end"]]
    assert value.decode() == span["text"], span["name"]
    assert sha(value) == span["sha256"], span["name"]
assert sha((args.root / freeze["fixture"]).read_bytes()) == freeze["fixture_sha256"]
before = '      const nodeOutput = rawResult !== undefined ? (typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult, null, 2)) : result;'
after = '      const content = rawResult === undefined ? result : rawResult;\n      const nodeOutput = typeof content === "string" ? content : content ? JSON.stringify(content, null, 2) : undefined;'
gate_before = '          content={Object.keys(input).length > 0 || nodeOutput !== undefined ? <InputOutput input={input} result={nodeOutput} isError={isError} /> : undefined}'
gate_after = '          content={Object.keys(input).length > 0 || content ? <InputOutput input={input} result={nodeOutput} isError={isError} /> : undefined}'
for name in freeze["baseline_files"]:
    baseline = subprocess.check_output(["git", "show", f"{args.baseline}:{name}"])
    if name == "src/features/chat/ToolRows.tsx":
        expected = baseline.decode()
        assert expected.count(before) == 1 and expected.count(gate_before) == 1
        expected = expected.replace(before, after, 1).replace(gate_before, gate_after, 1).encode()
    else:
        expected = baseline
    assert (args.root / name).read_bytes() == expected, name
print("PASS: full retained parent, seven complete declarations and limit binding; frozen24; exact Node-only hunk; seven unchanged controls")
