#!/usr/bin/env python3
"""Inert integrity checks only; never imports or executes product/reference code."""
import hashlib
import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent
ORIGINAL_ROOT = ROOT.parent.parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args])


qualification = json.loads((HERE / "qualification.json").read_text())
historical = json.loads((HERE / "historical-source.json").read_text())
fresh_main = git("rev-parse", "origin/main").decode().strip()
checks = []


def check(name, observed, expected):
    checks.append({"name": name, "pass": observed == expected})
    assert observed == expected, f"Integrity mismatch: {name}"


source_pins = {}
for name, expected in qualification["current_source_pins"].items():
    data = (ROOT / name).read_bytes()
    check(f"unchanged original source pin: {name}", sha(data), expected)
    check(f"matches fresh main: {name}", data, git("show", f"{fresh_main}:{name}"))
    source_pins[name] = sha(data)

functions = {}
for record in qualification["retained_complete_functions"]:
    name = record["name"]
    data = (HERE / "reference" / f"{name}.txt").read_bytes()
    check(f"complete retained {name} hash", sha(data), record["sha256"])
    check(f"complete retained {name} bytes", len(data), record["bytes"])
    functions[name] = data.decode()
wrapper = (HERE / "reference/kqo-Tqo-complete.txt").read_bytes()
check("complete retained wrapper hash", sha(wrapper), qualification["retained_complete_wrapper"]["sha256"])
check("complete retained wrapper bytes", len(wrapper), qualification["retained_complete_wrapper"]["bytes"])
functions["kqo-wrapper"] = wrapper.decode()
for name, join in historical["joins"]:
    check(f"retained parent/consumer join: {name}: {join}", join in functions[name], True)

for name, expected in qualification["old_inputs_preserved"].items():
    check(f"historical input retained: {name}", sha((ORIGINAL_ROOT / name).read_bytes()), expected)

fixture = (HERE / "historical-fixture.test.ts.txt").read_bytes()
check("historical fixture hash", sha(fixture), qualification["historical_fixture"]["sha256"])
check("historical fixture byte count", len(fixture), qualification["historical_fixture"]["bytes"])
check("placed baseline fixture is byte-identical", (ROOT / "src/features/diff/readOnlyEditAffordance.test.ts").read_bytes(), fixture)
proposal = (HERE / "minimal-proposal.UNAPPLIED.patch").read_bytes()
check("proposal hash", sha(proposal), qualification["proposal"]["sha256"])
check("proposal bytes", len(proposal), qualification["proposal"]["bytes"])
subprocess.run(["git", "-C", str(ROOT), "apply", "--check", "--whitespace=error", str(HERE / "minimal-proposal.UNAPPLIED.patch")], check=True)
check("reviewed proposal applicable but unapplied", b"const isEditableCode = !isPreviewable && edit !== null;" in (ROOT / "src/features/diff/DiffViewer.tsx").read_bytes(), True)
check("optional historical-ref environment is not set", "DIFF_READONLY_EDIT_REF" in os.environ, False)

report = {
    "author": "Conductor Rebuild",
    "dedupe": "DIFF-READONLY-EDIT-AFFORDANCE-DE6-02",
    "fresh_main": fresh_main,
    "source_pins": source_pins,
    "fixture": {"sha256": sha(fixture), "bytes": len(fixture), "all_original_cases_and_oracles_unchanged": True},
    "static_checks": len(checks),
    "checks": checks,
    "current_semantic_red": "NOT_RUN",
    "product_treatment": "UNAPPLIED",
    "whole_renderer_and_index_assets": "ABSENT_AT_HISTORICAL_PATHS; RETAINED_COMPLETE_FUNCTION_HASHES_ONLY",
    "browser_native_packaged": "NOT_RUN",
}
print(json.dumps(report, indent=2))
