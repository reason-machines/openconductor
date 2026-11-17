#!/usr/bin/env python3
"""Check frozen source and fixture identity without executing product code."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
source = json.loads((HERE / "source.json").read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


for entry in source["current_files"]:
    data = subprocess.check_output(
        ["git", "show", f"{source['main']}:{entry['path']}"], cwd=ROOT
    )
    assert digest(data) == entry["sha256"], entry["path"]

record = ROOT / source["rea_record"]["path"]
assert digest(record.read_bytes()) == source["rea_record"]["sha256"]
with gzip.open(record, "rt") as stream:
    assert json.load(stream)["evidence_id"] == source["rea_evidence_id"]

for window in source["original_windows"]:
    data = window["utf8"].encode("utf8")
    assert len(data) == window["end"] - window["start"], window["label"]
    assert digest(data) == window["sha256"], window["label"]

retained = 0
for key, asset in source["original_assets"].items():
    path = ROOT / asset["path"]
    if not path.is_file():
        continue
    data = path.read_bytes()
    assert digest(data) == asset["sha256"], asset["path"]
    for window in source["original_windows"]:
        if window["asset"] == key:
            assert data[window["start"]:window["end"]].decode("utf8") == window["utf8"]
    retained += 1

for line in (HERE / "fixture.sha256").read_text().splitlines():
    expected, path = line.split("  ", 1)
    assert digest((ROOT / path).read_bytes()) == expected, path

print(f"PASS static source integrity: {source['main']}, 8 baseline files, 13 windows, REA record, 3 frozen fixture files")
print(f"Retained full assets checked: {retained}/2 (not included in this PR)")
print("Integrity only: no product, mounted DOM, native or provider tests executed.")
