#!/usr/bin/env python3
"""Verify retained source identities without executing extracted JavaScript."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
PACKET = Path(__file__).resolve().parent
sha = lambda body: hashlib.sha256(body).hexdigest()

parser = argparse.ArgumentParser()
parser.add_argument("--phase", choices=("baseline", "candidate"), default="baseline")
args = parser.parse_args()
manifest = json.loads((PACKET / "manifest.json").read_text())
previous = ROOT / "evidence/open-in/icon-menu-numbering-caller"
reference = json.loads((previous / "manifest.json").read_text())
asset = (ROOT / reference["reference_asset"]["path"]).read_bytes()
assert sha(asset) == reference["reference_asset"]["sha256"]
spans = {}
for span in reference["reference_spans"]:
    body = (previous / "source" / (span["symbol"] + ".txt")).read_bytes()
    assert sha(body) == span["sha256"], span["symbol"]
    assert body == asset[span["utf8_byte_start"]:span["utf8_byte_end"]], span["symbol"]
    spans[span["symbol"]] = body.decode()

assert 'type:"workspaces-dir",size:"icon"' in spans["original-workspaces-path-caller"]
assert 'type:"repo-root-dir",size:"icon"' in spans["original-root-path-caller"]
assert 'shortcutCommandId:O,type:o,onOpenApp:on' in spans["P9"]
assert '{showOpenInAppShortcut:d}=g4i(c)' in spans["cFn"]
assert 'w.id===r&&d&&p.jsx(Ss,{commandId:a})' in spans["cFn"]
assert 'c=t==="file-primary"&&r==="file"||t==="workspace"&&n&&r!=="file"||t==="repo-root-dir"&&a;' in spans["g4i"]
assert 'return t.location.pathname.startsWith("/settings/repos/")' in spans["pvs"]

baseline_ref = manifest["baseline_main"]
for path, digest in manifest["baseline_files"].items():
    baseline = subprocess.check_output(["git", "show", f"{baseline_ref}:{path}"], cwd=ROOT)
    assert sha(baseline) == digest, path
    candidate = baseline.decode()
    if args.phase == "candidate":
        for old, new in manifest["replacements"].get(path, []):
            assert candidate.count(old) == 1, (path, old)
            candidate = candidate.replace(old, new)
    assert (ROOT / path).read_text() == candidate, (args.phase, path)

assert sha((ROOT / reference["regression_file"]).read_bytes()) == reference["regression_sha256"]
assert sha((ROOT / manifest["regression_file"]).read_bytes()) == manifest["regression_sha256"]
print(json.dumps({"phase": args.phase, "baseline_main": manifest["baseline_main"], "retained_spans": len(spans), "product_files_verified": len(manifest["baseline_files"]), "frozen_numbering_cases": 11, "new_frozen_cases": 9, "original_js_executed": False, "native_gui": "NOT_RUN"}, indent=2))
