#!/usr/bin/env python3
"""Check source-only preparation rejects invalid inputs before writing."""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--archive", type=Path, required=True)
parser.add_argument("--prefix-archive", type=Path, required=True)
args = parser.parse_args()
script = Path(__file__).resolve().with_name("prepare-selftest.py")
header, prefix = args.archive.resolve(), args.prefix_archive.resolve()
checks = []
with tempfile.TemporaryDirectory(prefix="header-selftest-inputs-", dir=".ara-state") as directory:
    scratch = Path(directory).resolve()
    bad = scratch / "bad.tar"
    bad.write_bytes(b"not a packet")
    cases = [
        ("missing-prefix", header, scratch / "absent.tar", "Prefix9 archive is missing"),
        ("tampered-prefix", header, bad, "Prefix9 archive hash mismatch"),
        ("tampered-header", bad, prefix, "header8 archive hash mismatch"),
    ]
    for name, header_input, prefix_input, error in cases:
        out = scratch / name
        result = subprocess.run([
            sys.executable, str(script), "--archive", str(header_input),
            "--prefix-archive", str(prefix_input), "--repo", ".", "--out", str(out),
        ], capture_output=True, text=True)
        assert result.returncode != 0 and error in result.stderr and not out.exists(), (name, result.stderr)
        checks.append({"id": name, "status": "passed", "writes": "none"})
    out = scratch / "existing"
    out.mkdir()
    (out / "sentinel").write_text("retain")
    result = subprocess.run([
        sys.executable, str(script), "--archive", str(header),
        "--prefix-archive", str(prefix), "--repo", ".", "--out", str(out),
    ], capture_output=True, text=True)
    assert result.returncode != 0 and "output exists" in result.stderr
    assert list(out.iterdir()) == [out / "sentinel"] and (out / "sentinel").read_text() == "retain"
    checks.append({"id": "existing-output-preserved", "status": "passed"})
print(json.dumps({"producer": "Conductor Rebuild", "scope": "source-only setup; no Node/app", "checks": checks}, indent=2))
