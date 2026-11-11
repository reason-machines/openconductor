#!/usr/bin/env python3
"""Verify retained REA spans and regression inputs without running JavaScript."""

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original-dir", type=Path)
    args = parser.parse_args()
    source = json.loads((HERE / "source-receipt.json").read_text())
    contract = json.loads((HERE / "contract.json").read_text())
    originals = {}
    if args.original_dir:
        for asset in source["artifacts"]:
            data = (args.original_dir / asset["name"]).read_bytes()
            assert sha(data) == asset["sha256"] and len(data) == asset["bytes"], asset["name"]
            originals["index" if asset["name"].startswith("index-") else "renderer"] = data
    for item in source["spans"]:
        data = (HERE / "reference" / (item["name"] + ".txt")).read_bytes()
        assert sha(data) == item["sha256"] and len(data) == item["bytes"], item["name"]
        if originals:
            start, end = item["utf8_half_open"]
            assert originals[item["name"].split("-")[0]][start:end] == data, item["name"]
    assert sha((HERE / "unicode.patch").read_bytes()) == contract["patch_sha256"]
    assert sha((HERE / "candidate-ScriptOutput.tsx.txt").read_bytes()) == contract["candidate_product_sha256"]
    assert sha((HERE / "outputUnicode.test.ts.txt").read_bytes()) == contract["fixture_sha256"]
    historical = (HERE / "outputUnicode.test.ts.txt").read_bytes()
    current = (ROOT / "src/scripts/outputUnicode.test.ts").read_bytes()
    assert historical[historical.index(b'test("'):] == current[current.index(b'test("'):], "nine test bodies changed"
    print(json.dumps({
        "kind": "source-only-verification", "main_checked": source["main_checked"],
        "original_assets_verified": len(originals), "retained_spans_verified": len(source["spans"]),
        "historical_pair_hashes_verified": True, "current_test_bodies_identical": 9,
        "behavioral_cases_run": 0, "native_or_visual_behavior_verified": False,
    }, indent=2))


if __name__ == "__main__":
    main()
