"""Verify frozen executor evidence against a supplied delivery-base commit."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parent
source = root.parent / "source"
base = subprocess.check_output(["git", "rev-parse", sys.argv[1]], text=True).strip()
receipt_bytes = (root / "actual-red-green-color-receipt.json").read_bytes()
receipt_hash = hashlib.sha256(receipt_bytes).hexdigest()
assert receipt_hash == "28285f931e8757e49a5251168251ed22848e59b52d9a5701e81dce798a74cb82"
receipt = json.loads(receipt_bytes)
frozen = receipt["qualification"]["frozen"]


def check(path, expected):
    actual = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    assert actual == expected, (str(path), actual, expected)
    return actual


check("src/features/terminal/resizeState.test.ts", frozen["fixture"]["sha256"])
check("src/features/terminal/session.ts", frozen["candidate_session_sha256"])
check(source / "candidate.patch", frozen["candidate_patch_sha256"])
check(source / "reference.json", frozen["source_reference_sha256"])
check(source / "main/src/features/terminal/session.ts", frozen["baseline_session_sha256"])
reference = json.loads((source / "reference.json").read_text())
for span in reference["spans"]:
    check(source / span["file"], span["sha256"])

pins = receipt["qualification"]["all_actual_git_b6_and_5555_source_identical_pins"]
for pin in pins:
    blob = subprocess.check_output(["git", "show", base + ":" + pin["path"]])
    assert hashlib.sha256(blob).hexdigest() == pin["sha256"], pin["path"]

for phase, expected_exit, passes, failures in [("red", 1, 3, 7), ("green", 0, 10, 0), ("color", 0, None, None)]:
    result = receipt["phases"][phase]
    runner = result["runner"]
    assert runner["process_exit"] == expected_exit
    assert runner["process_terminal"] and runner["limit_reason"] is None
    if passes is not None:
        tap = result["stdout_unmodified"]
        for label, count in [("tests", 10), ("pass", passes), ("fail", failures), ("skipped", 0), ("cancelled", 0)]:
            assert re.search(rf"^# {label} {count}$", tap, re.MULTILINE), (phase, label)
        assert tap.count("code: 'ERR_ASSERTION'") == failures

subprocess.run(["git", "diff", "--check"], check=True)
print(json.dumps({
    "author": "Conductor Rebuild",
    "delivery_base": base,
    "receipt_sha256": receipt_hash,
    "fixture_sha256": frozen["fixture"]["sha256"],
    "candidate_session_sha256": frozen["candidate_session_sha256"],
    "candidate_patch_sha256": frozen["candidate_patch_sha256"],
    "frozen_archive_sha256": receipt["qualification"]["archive_sha256"],
    "retained_span_hashes_verified": len(reference["spans"]),
    "current_main_source_pins_verified": len(pins),
    "red": {"intended_assertion_failures": 7, "passing_controls": 3},
    "green": {"passes": 10, "failures": 0},
    "targeted_color_lint": "passed",
    "local_runtime_repeated": False,
    "native_pty_kernel_history_xterm_visual": "unverified",
}, indent=2))
