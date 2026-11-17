"""Verify retained static source and fixture bytes without running either app."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--assets", required=True, type=Path)
args = parser.parse_args()
OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
record = json.loads((OUT / "source.json").read_text())


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


assets = {}
for kind, filename in [
    ("index", "index-BGEQ8YjU.js"),
    ("renderer", "renderApp-D_fmY7hW.js"),
]:
    raw = (args.assets / filename).read_bytes()
    assert sha(raw) == record["asset_sha256"][kind], kind
    assets[kind] = raw

for name, span in record["source_spans"].items():
    start, end = span["utf8_half_open"]
    raw = assets[span["asset"]][start:end]
    assert sha(raw) == span["sha256"], name
    assert raw == (OUT / "reference" / f"{name}.txt").read_bytes(), name

for path, expected in record["main_file_sha256"].items():
    raw = subprocess.check_output([
        "git", "-c", "gc.auto=0", "show", f"{record['main_sha']}:{path}"
    ], cwd=ROOT)
    assert sha(raw) == expected, path

for line in (OUT / "fixture.sha256").read_text().splitlines():
    expected, path = line.split("  ", 1)
    assert sha((ROOT / path).read_bytes()) == expected, path

print(json.dumps({
    "result": "SOURCE_AND_FIXTURE_INTEGRITY_PASS",
    "main": record["main_sha"],
    "assets": len(assets),
    "source_spans": len(record["source_spans"]),
    "baseline_files": len(record["main_file_sha256"]),
    "behavior": "NOT_RUN",
}))
