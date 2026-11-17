"""Verify retained source/component evidence without executing JavaScript.

Optional --renderer/--index bind the retained spans to their complete parent assets.
"""
from pathlib import Path
import argparse
import gzip
import hashlib
import json

here = Path(__file__).resolve().parent
root = here.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("--renderer", type=Path)
parser.add_argument("--index", type=Path)
args = parser.parse_args()
pins = json.loads((here / "source-pins.json").read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
checks = 0


def check(ok, label):
    global checks
    assert ok, label
    checks += 1


for line in (here / "SHA256SUMS").read_text().splitlines():
    expected, path = line.split("  ", 1)
    check(sha((here / path).read_bytes()) == expected, "evidence changed: " + path)
check(sha((root / pins["fixture"]["path"]).read_bytes()) == pins["fixture"]["sha256"], "live fixture differs from frozen RED/GREEN")
check(sha((here / "baseline/composerQueueEditEmptySave.test.ts.txt").read_bytes()) == pins["fixture"]["sha256"], "baseline fixture differs")
check(sha((root / "src/features/chat/Composer.tsx").read_bytes()) == pins["treatment_sha256"], "treatment identity")
raw_red = gzip.decompress((here / "execution/red.tap.gz").read_bytes())
check(len(raw_red) == pins["raw_red_bytes"] and sha(raw_red) == pins["raw_red_sha256"], "lossless original RED identity")
red = json.loads((here / "execution/red-semantic-summary.json").read_text())
check((red["tests"], red["passed"], red["failed"]) == (51, 21, 30), "qualified semantic RED totals")
check(red["all_failures_are_assertions"], "RED is semantic, not setup failure")
green = (here / "execution/green.tap").read_text()
check(all(line in green.splitlines() for line in ["# tests 51", "# pass 51", "# fail 0", "# cancelled 0", "# skipped 0", "# todo 0"]), "identical-fixture GREEN totals")
for label in ["red", "green"]:
    result = json.loads((here / "execution" / (label + "-result.json")).read_text())
    check(result["fixture_unchanged"] and result["fixture_sha256"] == pins["fixture"]["sha256"], label + " fixture immutable")
    check(not result["leftover_pids_at_cleanup"], label + " process-group cleanup")
for entry in json.loads((here / "reference/spans.json").read_text()) + json.loads((here / "reference/field-spans.json").read_text()):
    data = (here / "reference" / (entry["name"] + ".txt")).read_bytes()
    check(len(data) == entry["bytes"] and sha(data) == entry["sha256"], "declaration identity: " + entry["name"])
    parent = args.index if entry.get("asset") == "index" else args.renderer
    if parent is not None:
        start, end = entry["utf8_half_open"]
        check(parent.read_bytes()[start:end] == data, "parent binding: " + entry["name"])
for name, path in [("renderer", args.renderer), ("index", args.index)]:
    if path is not None:
        identity = pins["reference_assets"][name]
        data = path.read_bytes()
        check(len(data) == identity["bytes"] and sha(data) == identity["sha256"], "whole parent identity: " + name)
if args.renderer is not None:
    binding = json.loads((here / "reference/corrected-binding.json").read_text())["corrected_slice"]
    start, end = binding["utf8_half_open"]
    data = args.renderer.read_bytes()[start:end]
    check(len(data) == binding["bytes"] and sha(data) == binding["sha256"], "corrected slice binding")
print(json.dumps({"status": "STATIC_EVIDENCE_PASS", "checks_passed": checks, "parent_assets_rebound": bool(args.renderer and args.index), "behavior": "retained execution only; this command does not rerun tests"}))
