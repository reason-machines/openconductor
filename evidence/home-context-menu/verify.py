#!/usr/bin/env python3
"""Verify retained inert source spans and the unchanged mounted fixture."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--renderer", type=Path, help="Optional original retained renderer or its gzip; never executed")
args = parser.parse_args()
root = Path(__file__).resolve().parent
repo = root.parents[1]
reference = json.loads((root / "reference.json").read_text())
parent = None
if args.renderer:
    parent = args.renderer.read_bytes()
    if args.renderer.suffix == ".gz":
        parent = gzip.decompress(parent)
    assert len(parent) == reference["parent"]["bytes"]
    assert hashlib.sha256(parent).hexdigest() == reference["parent"]["sha256"]
spans = reference["spans"] + reference["imports"] + [reference["import_source_literal"]]
for span in spans:
    raw = span["source_text"].encode("utf-8")
    start, end = span["utf8_span"]
    assert end - start == span["bytes"] == len(raw)
    assert hashlib.sha256(raw).hexdigest() == span["sha256"]
    if parent is not None:
        assert parent[start:end] == raw
qualification = json.loads((root / "qualification.json").read_text())
fixture = (repo / "src/components/homeContextMenu.test.ts").read_bytes()
assert hashlib.sha256(fixture).hexdigest() == qualification["fixture_sha256"]
red, green = [(root / name).read_text() for name in ("red.txt", "green.txt")]
assert "# pass 4\n# fail 3" in red
assert red.count("not ok ") == 3
assert red.count("active Home row must expose its context-menu request handler") == 3
assert "# pass 7\n# fail 0" in green
adjacent = gzip.decompress((root / "adjacent.txt.gz").read_bytes()).decode()
assert "# pass 193\n# fail 0" in adjacent
print(json.dumps({"spans": len(spans), "source_and_fixture_integrity": "PASS", "parent_bytes_verified": parent is not None,
                  "recorded_red": "4 PASS / 3 intended FAIL", "recorded_green": "7 PASS", "adjacent": "193 PASS",
                  "behavior_reexecuted": False, "native": "NOT_RUN"}, indent=2))
