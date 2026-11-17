#!/usr/bin/env python3
"""Check retained REA bytes, frozen fixture, and the one-helper change boundary."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--renderer", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
packet = json.loads(Path(__file__).with_name("reference.json").read_text())
checks = 0


def check(condition, label):
    global checks
    if not condition:
        raise AssertionError(label)
    checks += 1


def digest(data):
    return hashlib.sha256(data).hexdigest()


original = args.renderer.read_bytes()
check(len(original) == packet["reference"]["asset_bytes"], "Original renderer size")
check(digest(original) == packet["reference"]["asset_sha256"], "Original renderer hash")
for span in packet["spans"]:
    start, end = span["utf8_half_open"]
    chunk = original[start:end]
    check(digest(chunk) == span["sha256"], span["name"] + " original-byte hash")
    check(chunk.decode() == span["source"], span["name"] + " source readback")
for path, expected in packet["baseline_source_sha256"].items():
    baseline = subprocess.check_output(["git", "show", packet["baseline_main"] + ":" + path], cwd=root)
    check(digest(baseline) == expected, path + " baseline hash")
    current = (root / path).read_bytes()
    if path == "src/components/AllWorkspaces.tsx":
        before = baseline.decode()
        after = current.decode()
        begin = before.index("function Highlight(")
        end = before.index("\nfunction Menu(", begin)
        after_begin = after.index("function Highlight(")
        after_end = after.index("\nfunction Menu(", after_begin)
        check(before[:begin] == after[:after_begin], "Before Highlight unchanged")
        check(before[end:] == after[after_end:], "After Highlight unchanged")
    else:
        check(digest(current) == expected, path + " unchanged")
check(digest((root / "src/components/homeSearchUnicode.test.ts").read_bytes()) == packet["frozen_fixture_sha256"], "Frozen rendered fixture")
print(f"PASS {checks} original-byte, frozen-fixture and one-helper-boundary checks")
