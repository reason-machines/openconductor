#!/usr/bin/env python3
"""Replay the frozen native-zoom consumer fixture against baseline and PR source."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TEST = Path("src/settings/nativeZoom.test.ts")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify():
    manifest = json.loads((HERE / "source.json").read_text())
    for path, expected in manifest["files"].items():
        assert digest(HERE / path) == expected, f"Frozen evidence changed: {path}"
    assert digest(ROOT / TEST) == manifest["fixture_sha256"], "Fixture changed"
    assert digest(HERE / "fixture.test.ts.txt") == manifest["fixture_sha256"]
    return manifest


def run(source, output):
    result = subprocess.run(
        ["node", "--test", "--test-reporter=tap", str(TEST)],
        cwd=ROOT, env={**os.environ, "NATIVE_ZOOM_SOURCE_ROOT": str(source)},
        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False,
    )
    output.write_text(result.stdout)
    return {
        "exit_code": result.returncode,
        "failed": re.findall(r"^not ok \d+ (.+)$", result.stdout, re.MULTILINE),
        "passed": re.findall(r"^ok \d+ (.+)$", result.stdout, re.MULTILINE),
        "log": str(output),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path)
    parser.add_argument("--source-only", action="store_true")
    args = parser.parse_args()
    manifest = verify()
    if args.source_only:
        print("PASS frozen baseline, reference and unchanged fixture hashes")
        return
    assert args.out_dir, "--out-dir is required for replay"
    args.out_dir.mkdir(parents=True, exist_ok=True)
    baseline = run(HERE / "baseline", args.out_dir / "baseline.tap")
    fixed = run(ROOT, args.out_dir / "fixed.tap")
    result = {
        "baseline_commit": manifest["baseline_commit"],
        "fixture_sha256": manifest["fixture_sha256"],
        "baseline": baseline, "fixed": fixed,
        "native_acceptance": "NOT_RUN; mocked IPC is not WKWebView or permission acceptance",
        "traffic_light_resize": "UNIMPLEMENTED; native handler semantics unavailable",
    }
    (args.out_dir / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    assert baseline["exit_code"] != 0, "Baseline unexpectedly passed"
    assert sorted(baseline["failed"]) == sorted(manifest["expected_baseline_failures"]), "Unexpected baseline failure set"
    assert len(baseline["passed"]) == 1, "Browser baseline did not pass"
    assert fixed["exit_code"] == 0 and len(fixed["passed"]) == 9, "Fixed consumer failed"


if __name__ == "__main__":
    main()
