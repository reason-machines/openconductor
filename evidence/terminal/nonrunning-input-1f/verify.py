#!/usr/bin/env python3
"""Verify inert retained spans, optional originals, and the regression baseline."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--originals", type=Path)
parser.add_argument("--baseline", help="Git revision whose terminal/session.ts matches the source finding")
args = parser.parse_args()
root = Path(__file__).resolve().parent
manifest = json.loads((root / "reference.json").read_text())
sha256 = lambda data: hashlib.sha256(data).hexdigest()
originals = {}
if args.originals:
    for artifact in manifest["artifacts"]:
        data = (args.originals / artifact["name"]).read_bytes()
        assert len(data) == artifact["bytes"], artifact["name"]
        assert sha256(data) == artifact["sha256"], artifact["name"]
        originals[artifact["artifact"]] = data
for span in manifest["spans"]:
    data = (root / span["file"]).read_bytes()
    start, end = span["utf8_half_open"]
    assert len(data) == end - start == span["bytes"], span["file"]
    assert sha256(data) == span["sha256"], span["file"]
    if originals:
        assert originals[span["artifact"]][start:end] == data, span["file"]
if args.baseline:
    source = next(item for item in manifest["main_sources"] if item["file"] == "src/features/terminal/session.ts")
    baseline = subprocess.check_output(["git", "show", f"{args.baseline}:{source['file']}"])
    assert sha256(baseline) == source["sha256"], "baseline session.ts differs from retained finding"
print(json.dumps({"result": "PASS", "spans": len(manifest["spans"]), "complete_original_assets_rehashed": len(originals), "baseline_session": args.baseline}))
