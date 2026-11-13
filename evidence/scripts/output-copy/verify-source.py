#!/usr/bin/env python3
"""Verify source identity only. This does not run the copy regression."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-renderer", type=Path)
    args = parser.parse_args()
    record = json.loads((HERE / "source-identity.json").read_text())
    base = record["main_checked"]
    for item in record["main_inputs"]:
        actual = subprocess.check_output(["git", "show", f"{base}:{item['path']}"], cwd=ROOT)
        assert sha(actual) == item["sha256"], item["path"]

    original = (HERE / "frozen-outputCopy.test.ts.txt").read_bytes()
    delivered = (ROOT / "src/scripts/outputCopy.test.ts").read_bytes()
    assert sha(original) == record["frozen_fixture_sha256"], "frozen fixture"
    adapted = original
    for adapter in record["fixture_adapters"]:
        before, after = adapter["before"].encode(), adapter["after"].encode()
        assert adapted.count(before) == 1, adapter["reason"]
        adapted = adapted.replace(before, after)
    assert sha(adapted) == record["delivered_fixture_sha256"], "historical delivered fixture"
    tests = original[original.index(b'test("'):]
    assert tests == delivered[delivered.index(b'test("'):], "frozen test bodies"
    assert tests.count(b'\ntest("') + 1 == 9, "nine cases"

    product = (HERE / "candidate-ScriptOutput.tsx.txt").read_bytes()
    assert sha(product) == record["candidate_sha256"], "historical copy-only product candidate"
    assert sha((HERE / "copy.patch").read_bytes()) == record["patch_sha256"], "retained patch"
    renderer = args.reference_renderer.read_bytes() if args.reference_renderer else None
    if renderer is not None:
        assert sha(renderer) == record["reference_asset"]["sha256"], "reference renderer"
    for item in record["reference_spans"]:
        snippet = (HERE / item["path"]).read_bytes()
        assert len(snippet) == item["bytes"] and sha(snippet) == item["sha256"], item["name"]
        if renderer is not None:
            start, end = item["utf8_half_open"]
            assert renderer[start:end] == snippet, item["name"]

    print(json.dumps({
        "kind": "static-source-verification-only",
        "main_checked": base,
        "main_inputs_verified": len(record["main_inputs"]),
        "reference_spans_verified": len(record["reference_spans"]),
        "reference_renderer_verified": renderer is not None,
        "historical_product_matches_retained_candidate": True,
        "historical_fixture_transport_verified": True,
        "current_component_behavior_verified": False,
        "frozen_test_bodies_identical": 9,
        "behavioral_cases_run": 0,
        "native_clipboard_or_xterm_runtime_verified": False,
    }, indent=2))


if __name__ == "__main__":
    main()
