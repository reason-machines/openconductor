#!/usr/bin/env python3
"""Run one admitted bounded check and retain exact inputs and output."""
import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
import time
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
parser = argparse.ArgumentParser()
parser.add_argument("phase", choices=["red", "green", "related"])
args = parser.parse_args()
preparation = json.loads((OUT / "runtime-preparation.json").read_text())
prepared = json.loads((OUT / "prepared-receipt.json").read_text())
runtime = ROOT / preparation["runtime_root"]
fixture_path = runtime / "src/components/homeEmptyAction.test.ts"


def digest(data):
    return hashlib.sha256(data).hexdigest()


assert digest(fixture_path.read_bytes()) == preparation["fixture"]["sha256"]
inputs = {}
for path, baseline in preparation["source_files"].items():
    expected = baseline if args.phase == "red" else prepared["unapplied_patch"]["candidate_files"].get(path, baseline)
    data = (runtime / path).read_bytes()
    assert digest(data) == expected["sha256"], f"Unexpected {args.phase} input: {path}"
    inputs[path] = {"sha256": digest(data), "bytes": len(data)}
path = "src/home/allWorkspaces.test.ts" if args.phase == "related" else "src/components/homeEmptyAction.test.ts"
command = ["nice", "-n", "19", "timeout", "--kill-after=5s", "90s", "node", "--test", "--test-concurrency=1", path]
environment = dict(os.environ, NODE_OPTIONS="--max-old-space-size=384")
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
began = time.monotonic()
result = subprocess.run(command, cwd=runtime, env=environment, stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT, timeout=100)
elapsed = time.monotonic() - began
raw = result.stdout
log = raw.decode("utf8", errors="replace")
counts = {name: int(value) for name, value in re.findall(r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$", log, re.M)}
fixture_after = digest(fixture_path.read_bytes())
assert fixture_after == preparation["fixture"]["sha256"]
expected = result.returncode == (1 if args.phase == "red" else 0)
if args.phase == "red":
    expected = expected and counts.get("tests") == 9 and counts.get("pass") == 8 and counts.get("fail") == 1
    expected = expected and "Create a workspace" in log and "Clear filters" in log
elif args.phase == "green":
    expected = expected and counts.get("tests") == 9 and counts.get("pass") == 9 and counts.get("fail") == 0
else:
    expected = expected and counts.get("tests", 0) > 0 and counts.get("fail") == 0
for name in ["cancelled", "skipped", "todo"]:
    expected = expected and counts.get(name, 0) == 0
(OUT / f"{args.phase}.log").write_bytes(raw)
receipt = {
    "phase": args.phase, "main_sha": preparation["main_sha"],
    "actual_computer": "2f55d343-d8e8-5df2-a012-bba9ca8cf476",
    "cwd": preparation["runtime_root"], "command": command,
    "environment": {"NODE_OPTIONS": environment["NODE_OPTIONS"]},
    "started_at": started, "elapsed_seconds": round(elapsed, 3),
    "exit_code": result.returncode, "counts": counts,
    "expected_result_observed": expected,
    "fixture_sha256_before": preparation["fixture"]["sha256"],
    "fixture_sha256_after": fixture_after,
    "source_inputs": inputs, "output_sha256": digest(raw),
    "foreground_command_terminated": True,
    "limits": ["Synthetic production-component inputs, not either native app",
               "No mounted reference or visual acceptance; archive records explicitly supplied in props"],
}
(OUT / f"{args.phase}.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(log, end="")
print(json.dumps({key: receipt[key] for key in ["phase", "exit_code", "counts", "elapsed_seconds", "expected_result_observed"]}))
raise SystemExit(0 if expected else 1)
