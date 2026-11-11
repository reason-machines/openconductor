#!/usr/bin/env python3
"""Check the frozen attachment fixture and its current-main source binding."""
import hashlib
import json
from pathlib import Path
import subprocess

PACKET = Path(__file__).resolve().parent
ROOT = PACKET.parents[3]
original = json.loads((PACKET / "source.json").read_text())
current = json.loads((PACKET / "requalification.json").read_text())


def digest(body):
    return hashlib.sha256(body).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


fixture = original["fixture"]
assert current["fixture_sha256"] == original["fixture_sha256"]
assert digest((ROOT / fixture).read_bytes()) == original["fixture_sha256"], fixture
assert set(current["production_sha256"]) == set(original["production_sha256"])
for path, expected in current["production_sha256"].items():
    baseline = git("show", f"{current['baseline_main']}:{path}")
    assert digest(baseline) == expected, ("baseline", path)
    assert (ROOT / path).read_bytes() == baseline, ("product changed", path)

allowed = {
    fixture,
    *(str(path.relative_to(ROOT)) for path in PACKET.iterdir() if path.is_file()),
}
changed = set(git("diff", "--name-only", current["baseline_main"]).decode().splitlines())
assert changed <= allowed, ("unexpected diff", sorted(changed - allowed))
assert current["fixture_cases"] == sum(len(group["cases"]) for group in original["groups"]) == 7
print(json.dumps({
    "result": "PASS",
    "baseline_main": current["baseline_main"],
    "fixture_sha256": current["fixture_sha256"],
    "frozen_cases": current["fixture_cases"],
    "production_files": len(current["production_sha256"]),
    "diff_scope": "additive test and proof only",
    "behavior_typecheck_native_provider": "NOT_RUN",
}, indent=2))
