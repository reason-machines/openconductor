#!/usr/bin/env python3
"""Inert retained-byte qualification; never executes the vendor renderer."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--renderer", type=Path, required=True)
parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
args = parser.parse_args()
source = json.loads(Path(__file__).with_name("source.json").read_text())
freeze = json.loads(Path(__file__).with_name("freeze.json").read_text())
raw = args.renderer.read_bytes()
sha = lambda value: hashlib.sha256(value).hexdigest()
assert len(raw) == source["parent"]["bytes"]
assert sha(raw) == source["parent"]["sha256"]
for span in source["spans"]:
    value = raw[span["start"]:span["end"]]
    assert sha(value) == span["sha256"], span["name"]
    assert value.decode() == span["text"], span["name"]
fixture = args.root / "src/features/chat/subagentFallbackStructuredResult.test.ts"
assert sha(fixture.read_bytes()) == freeze["fixture_sha256"], "frozen 30-case fixture"
for name in ["src/features/chat/genericStructuredResult.test.ts", "src/features/chat/genericStructuredResult.inputs.json", "src/features/chat/typedSubagentErrorResult.test.ts"]:
    assert sha((args.root / name).read_bytes()) == freeze["baseline_files"][name], name
print(f"PASS: full parent, {len(source['spans'])} exact source records, unchanged frozen30/generic16/typed16 fixtures")
