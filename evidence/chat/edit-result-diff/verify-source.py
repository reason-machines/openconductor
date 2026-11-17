"""Verify retained REA bytes and the pre-fix main, without executing reference code."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("--handoff", type=Path, required=True)
args = parser.parse_args()
packet = json.loads((args.handoff / "reference-packet.json").read_text())
receipt = json.loads((args.handoff / "source-requalification-receipt.json").read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
checks = []


def check(name, condition):
    assert condition, name
    checks.append(name)


assets = {}
for item in packet["originals"]:
    data = (args.handoff / "originals" / item["name"]).read_bytes()
    check(item["name"], len(data) == item["bytes"] and sha(data) == item["sha256"])
    assets[item["name"]] = data
for span in packet["reference_spans"]:
    first, after = span["utf8_half_open"]
    data = assets[span["artifact"]][first:after]
    check(span["name"], data == span["literal"].encode() and sha(data) == span["sha256"])

baseline = "c3b79b39bfafbdde2e7b2c4546b14385bf379b5f"
for item in receipt["main_sources"]:
    data = subprocess.check_output(["git", "show", f'{baseline}:{item["path"]}'], cwd=ROOT)
    check("baseline " + item["path"], sha(data) == item["sha256"])
check("sealed fixture unchanged", sha((HERE / "fixtures.json").read_bytes()) == receipt["next_candidate"]["fixture_sha256"])
for name in ["editFileHover.test.ts", "multiEditHover.test.ts", "writeHover.test.ts"]:
    item = next(item for item in receipt["main_sources"] if item["path"].endswith("/" + name))
    check("unchanged adjacent " + name, sha((ROOT / item["path"]).read_bytes()) == item["sha256"])
reference_names = {"Edit-F0o-complete", "result-object-selection-sUt-M0o-complete", "result-diff-j0o-complete", "input-marker-normalization-oV-complete"}
output = {
    "candidate": "EDIT-RESULT-DIFF-BE7-07", "baseline": baseline,
    "reference_version": "Conductor 0.87.6", "rea_receipt": packet["rea_receipt"],
    "originals": packet["originals"],
    "reference_spans": [span for span in packet["reference_spans"] if span["name"] in reference_names],
    "fixture_sha256": sha((HERE / "fixtures.json").read_bytes()),
    "checks": checks,
    "limits": "Retained shipped bytes, not a fresh installed-app acquisition. Renderer semantic analysis exhausted heap. No reference JavaScript, provider or native execution. Accepted synthetic producer events do not prove a live CLI emitted an object result.",
}
(HERE / "source.json").write_text(json.dumps(output, indent=2) + "\n")
print(json.dumps({"source_checks_passed": len(checks), "baseline": baseline, "behavior": "separate RED/GREEN TAP"}))
