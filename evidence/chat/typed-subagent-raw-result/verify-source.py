#!/usr/bin/env python3
"""Check inert retained bytes and frozen tests; never execute vendor code."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--renderer", required=True, type=Path)
parser.add_argument("--root", required=True, type=Path)
args = parser.parse_args()
here = Path(__file__).resolve().parent
source = json.loads((here / "source.json").read_text())
freeze = json.loads((here / "freeze.json").read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
raw = args.renderer.read_bytes()
assert len(raw) == source["parent"]["bytes"]
assert sha(raw) == source["parent"]["sha256"]
assert sha((here / "source.json").read_bytes()) == freeze["source_manifest_sha256"]
for span in source["spans"]:
    value = raw[span["start"]:span["end"]]
    assert sha(value) == span["sha256"], span["name"]
    assert value.decode() == span["text"], span["name"]
assert sha((args.root / freeze["fixture"]).read_bytes()) == freeze["fixture_sha256"]
for name, digest in freeze["baseline_files"].items():
    assert sha((args.root / name).read_bytes()) == digest, name
print(f"PASS: full retained parent, {len(source['spans'])} exact declarations, frozen42 and seven unchanged controls")
