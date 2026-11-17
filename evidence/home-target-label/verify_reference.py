#!/usr/bin/env python3
"""Check retained REA data and the exact frozen regression; never execute app JS."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--renderer", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
packet = json.loads((Path(__file__).with_name("reference.json")).read_text())
checks = 0


def check(value, label):
    global checks
    assert value, label
    checks += 1


def digest(data):
    return hashlib.sha256(data).hexdigest()


for span in packet["spans"]:
    data = span["source"].encode()
    start, end = span["utf8_half_open"]
    check(len(data) == span["bytes"] == end - start, span["name"] + " width")
    check(digest(data) == span["sha256"], span["name"] + " digest")
if args.renderer:
    renderer = args.renderer.read_bytes()
    check(digest(renderer) == packet["reference"]["asset_sha256"], "whole retained renderer")
    for span in packet["spans"]:
        if span["asset"] == "renderApp-D_fmY7hW.js":
            start, end = span["utf8_half_open"]
            check(renderer[start:end] == span["source"].encode(), span["name"] + " original bytes")
spans = {span["name"]: span["source"] for span in packet["spans"]}
check('branch:mo,branchPrefix:ce,targetBranch:hi.intendedTargetBranch,host:hi.host' in spans["Home-UJo"], "Home supplies workspace target")
check('hi.state==="archived"?hi.branch:void 0' in spans["Home-UJo"], "archived branch is authoritative")
check('if(r&&r!==a)return pGe' in spans["display-name-$V"], "shared display-name target comparison")
check('intendedTargetBranch:e.intended_target_branch??"main"' in spans["local-workspace-decoder-w_"], "native decoder main fallback")
for path, expected in packet["baseline_source_sha256"].items():
    baseline = subprocess.check_output(["git", "show", f'{packet["baseline_main"]}:{path}'], cwd=root)
    check(digest(baseline) == expected, "baseline " + path)
    if path != "src/home/allWorkspaces.ts":
        check((root / path).read_bytes() == baseline, "untouched " + path)
check(digest((root / "src/components/homeTargetLabel.test.ts").read_bytes()) == packet["frozen_fixture_sha256"], "frozen regression")
print(f"PASS: {checks} retained-source, baseline, unchanged-neighbor and frozen-fixture checks")
print("Complete native index is not freshly rehashed; its decoder span remains earlier REA custody.")
