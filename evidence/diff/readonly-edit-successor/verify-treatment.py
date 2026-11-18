#!/usr/bin/env python3
"""Inert checks for the one leased candidate; never executes product/reference code.
The original baseline verifier, qualification, oracle and RED evidence stay immutable.
"""
import gzip
import hashlib
import json
import os
import pathlib
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent
ORIGINAL_ROOT = ROOT.parent.parent
CANDIDATE = "src/features/diff/DiffViewer.tsx"
CANDIDATE_COMMIT = "df331f2a27b5a3eef8bc3bcc0027da9a704886b0"
BASELINE_COMMIT = "e97b9a3e563ab26dc9699be7d99ee403449313f0"
BEFORE = b"const isEditableCode = !isPreviewable && edit !== null;"
AFTER = b"const isEditableCode = !isPreviewable && edit !== undefined;"
CANDIDATE_SHA = "e3f0a4fe181a652650bbdab1e481bb359ae5b7b99588b64a1a14390b8c82e820"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args])


checks = []


def check(name, observed, expected):
    checks.append({"name": name, "pass": observed == expected})
    assert observed == expected, f"Integrity mismatch: {name}"


qualification = json.loads((HERE / "qualification.json").read_text())
historical = json.loads((HERE / "historical-source.json").read_text())
fresh_main = git("rev-parse", "origin/main").decode().strip()
check("original baseline verifier unchanged", sha((HERE / "verify-source-plan.py").read_bytes()), "1fc19533e67e295801d0cda690347cb0db461f942184d42e2567f8d421ee9d93")
check("original RED supervisor unchanged", sha((HERE / "red21-supervisor.py").read_bytes()), "309a7930685fefd54fed27cd8bce8eee1d76146c821fe4993143016e0e1c91e2")
check("only leased product file in candidate commit", git("diff", "--name-only", BASELINE_COMMIT, CANDIDATE_COMMIT).decode().splitlines(), [CANDIDATE])
candidate = (ROOT / CANDIDATE).read_bytes()
check("candidate exact hash", sha(candidate), CANDIDATE_SHA)
check("one corrected predicate", candidate.count(AFTER), 1)
check("old predicate absent", candidate.count(BEFORE), 0)
check("candidate matches committed bytes", candidate, git("show", f"{CANDIDATE_COMMIT}:{CANDIDATE}"))
baseline = candidate.replace(AFTER, BEFORE)
check("one-site inverse equals qualified RED source", baseline, git("show", f"{BASELINE_COMMIT}:{CANDIDATE}"))
source_pins = {}
for name, expected in qualification["current_source_pins"].items():
    actual = (ROOT / name).read_bytes()
    original = baseline if name == CANDIDATE else actual
    check(f"original source pin after single inverse: {name}", sha(original), expected)
    check(f"original bytes match fresh main: {name}", original, git("show", f"{fresh_main}:{name}"))
    source_pins[name] = sha(actual)
hook = (ROOT / "src/features/diff/EditInViewer.ts").read_text()
check("hook declares absent capability as undefined", "): FileEdit | undefined {" in hook, True)
check("hook returns undefined for null text", "onDisk === null ? undefined : { current, generation, dirty, onChange, onSave, error }" in hook, True)
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
    data = (ORIGINAL_ROOT / name).read_bytes()
    check(f"historical input retained: {name}", sha(data), expected)
    # Include all seven historical originals in the supervisor's pre/post snapshot.
    source_pins[os.path.relpath(ORIGINAL_ROOT / name, ROOT)] = sha(data)
fixture = (HERE / "historical-fixture.test.ts.txt").read_bytes()
check("historical fixture hash", sha(fixture), qualification["historical_fixture"]["sha256"])
check("historical fixture byte count", len(fixture), qualification["historical_fixture"]["bytes"])
check("all original case/assertion/helper bytes unchanged", (ROOT / "src/features/diff/readOnlyEditAffordance.test.ts").read_bytes(), fixture)
proposal = (HERE / "minimal-proposal.UNAPPLIED.patch").read_bytes()
check("original proposal hash", sha(proposal), qualification["proposal"]["sha256"])
check("original proposal bytes", len(proposal), qualification["proposal"]["bytes"])
subprocess.run(["git", "-C", str(ROOT), "apply", "--reverse", "--check", "--whitespace=error", str(HERE / "minimal-proposal.UNAPPLIED.patch")], check=True)
check("reviewed one-site patch inverse applies", True, True)
check("optional historical-ref environment is not set", "DIFF_READONLY_EDIT_REF" in os.environ, False)
red_receipt_sha = "e2e81f819bc6bf6b91c498900c75c8968baaca4e370d0d304223fba2e45fdb69"
red_log_sha = "1f451638f440cf68433ff4664080dfefca34b62bf97d4fd4ebf98a25c4b2c0ab"
for directory in (HERE / "runtime", ROOT / ".oc-tmp/readonly-edit-red21-runtime"):
    check(f"RED receipt retained: {directory}", sha((directory / "red21-receipt.json").read_bytes()), red_receipt_sha)
    log_path = directory / ("red21.log.gz" if directory == HERE / "runtime" else "red21.log")
    stored_log = log_path.read_bytes()
    raw_log = gzip.decompress(stored_log) if log_path.suffix == ".gz" else stored_log
    check(f"RED raw TAP retained losslessly: {directory}", sha(raw_log), red_log_sha)
    for path in (directory / "red21-receipt.json", log_path):
        source_pins[os.path.relpath(path, ROOT)] = sha(path.read_bytes())
red = json.loads((HERE / "runtime/red21-receipt.json").read_text())
check("qualified RED exited 1", red["child_exit"], 1)
check("qualified RED source preflight count", red["source_preflight"]["static_checks"], 65)
check("qualified RED had no drift", red["post_input_drift"], [])
check("qualified RED released its group", red["released"] and red["group_survivors"] == [], True)
check("original RED input census", len(red["pre_input_hashes"]), 81)
for name, record in red["pre_input_hashes"].items():
    path = pathlib.Path(name)
    data = baseline if path == ROOT / CANDIDATE else path.read_bytes()
    check(f"RED input retained after only candidate inverse: {name}", sha(data), record["sha256"])
    check(f"RED input byte count after only candidate inverse: {name}", len(data), record["bytes"])
report = {
    "author": "Conductor Rebuild",
    "dedupe": "DIFF-READONLY-EDIT-AFFORDANCE-DE6-02",
    "fresh_main": fresh_main,
    "source_pins": source_pins,
    "candidate": {"path": CANDIDATE, "commit": CANDIDATE_COMMIT, "sha256": CANDIDATE_SHA, "baseline_sha256": sha(baseline), "only_single_inverse_allowed": True},
    "fixture": {"sha256": sha(fixture), "bytes": len(fixture), "all_original_cases_and_oracles_unchanged": True},
    "static_checks": len(checks),
    "checks": checks,
    "baseline": {"cases": 21, "target_assertion_failures": 17, "controls_passed": 4, "harness_failures": 0, "actual_release_utc": red["actual_release_utc"]},
    "current_green": "NOT_RUN",
    "product_treatment": "APPLIED_EXACT_ONE_SITE",
    "whole_renderer_and_index_assets": "ABSENT_AT_HISTORICAL_PATHS; RETAINED_COMPLETE_FUNCTION_HASHES_ONLY",
    "browser_native_packaged": "NOT_RUN",
}
print(json.dumps(report, indent=2))
