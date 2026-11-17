#!/usr/bin/env python3
"""Static integrity checks only; does not execute a renderer or test fixture."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--parent", type=Path, help="Optional retained complete renderer")
args = parser.parse_args()
evidence = Path(__file__).resolve().parent
root = evidence.parents[2]
manifest = json.loads((evidence / "source-manifest.json").read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


fixture = root / "src/features/chat/copyCodeFeedback.test.ts"
assert digest(fixture.read_bytes()) == manifest["frozen_fixture"]["sha256"]
assert digest((root / "package-lock.json").read_bytes()) == "2203faf80f07760a020cb1c4aa3ef55e2c25db72a887c5c02808b0d2c2621992"
assert digest((root / "src/features/chat/markdown.ts").read_bytes()) == "35c81f7d5094d4b4bf8c5b7dc85db4666ae9aed21a3be177471dfa69309698cb"
for entry in manifest["baseline"]["files"]:
    data = subprocess.check_output(["git", "show", f'{manifest["baseline"]["commit"]}:{entry["path"]}'], cwd=root)
    assert len(data) == entry["bytes"] and digest(data) == entry["sha256"], entry["path"]
    if "file" in entry:
        assert (evidence / entry["file"]).read_bytes() == data

original = (evidence / "baseline/src/features/chat/copyCodeFeedback.test.ts.txt").read_text()
original_cases = re.findall(r'^test\(.*?(?=^test\(|\Z)', original, re.M | re.S)
assert len(original_cases) == 4
current_fixture = fixture.read_text()
for case in original_cases:
    assert case.rstrip() in current_fixture, "Existing control body changed"
assert len(re.findall(r'^test\(', current_fixture, re.M)) == 5

parent = args.parent.read_bytes() if args.parent else None
if parent is not None:
    assert len(parent) == manifest["parent"]["bytes"]
    assert digest(parent) == manifest["parent"]["sha256"]
for span in manifest["spans"]:
    literal = json.loads((evidence / span["file"]).read_text())["raw_utf8"].encode()
    assert len(literal) == span["bytes"] == span["end"] - span["start"]
    assert digest(literal) == span["sha256"], span["symbol"]
    if parent is not None:
        assert literal == parent[span["start"]:span["end"]], span["symbol"]

red = gzip.decompress((evidence / "execution/red.tap.gz").read_bytes()).decode()
green = (evidence / "execution/green.tap").read_text()
assert (evidence / "execution/red-exit.txt").read_text().strip() == "1"
assert (evidence / "execution/green-exit.txt").read_text().strip() == "0"
assert re.findall(r'^not ok \d+ - (.*)$', red, re.M) == ["overlapping fenced-code successes retain every two-second reset at 2000, 3000, and 4500 ms"]
assert "The 1000-ms success must still reset the third success at exactly 3000 ms" in red
assert "# pass 4\n# fail 1\n# cancelled 0\n# skipped 0" in red
assert "# pass 5\n# fail 0\n# cancelled 0\n# skipped 0" in green
for number in range(1, 5):
    assert re.search(rf'^ok {number} - ', red, re.M)
    assert re.search(rf'^ok {number} - ', green, re.M)
assert (evidence / "execution/slot-release.txt").read_text().strip() == "2026-11-17T21:04:10Z"
for line in (evidence / "SHA256SUMS").read_text().splitlines():
    expected, filename = line.split("  ", 1)
    assert digest((evidence / filename).read_bytes()) == expected, filename

print(json.dumps({
    "kind": "static evidence integrity; no behavioral execution",
    "frozen_fixture": "PASS", "existing_controls_unchanged": "4/4 PASS",
    "baseline_git_bindings": "5/5 PASS", "decoded_source_spans": "9/9 PASS",
    "complete_parent_and_ranges": "PASS" if parent is not None else "NOT_RERUN",
    "recorded_red": "4 PASS / 1 expected semantic failure",
    "recorded_green": "5/5 PASS", "evidence_checksums": "PASS",
    "browser_native_packaged_acceptance": "NOT_RUN"
}, indent=2))
