#!/usr/bin/env python3
"""Run the frozen frontend fixture against baseline and candidate product modules."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
FIXTURE = "src/features/diff/hiddenWhitespaceEditing.test.ts"
FIXTURE_SHA = "6e0b9c57c9d1f2ab99f517104e6b262ea643b517d9d3aeef81be6f4fa4c52ca1"
TAIL_MARKER = b'for (const layout of ["unified", "split", "file"] as const) {'
TAIL_SHA = "edf7785d1e3d47380bac762a3df64beb0e5cad5fa36c388581654ac772a26a97"
PRODUCT = (
    "src/features/diff/useWorkspaceDiff.ts",
    "src/features/diff/DiffViewer.tsx",
    "src/features/diff/editable.ts",
    "src/features/diff/FileDiffView.tsx",
    "src/features/diff/pierre.ts",
)
LAYOUT_CASES = {
    f"{layout} hidden-whitespace loader/editor/Cmd+S preserves complete text with {ending} final newline"
    for layout in ("unified", "split", "file") for ending in ("a", "no")
}
OTHER_FAILURES = {
    "a same-file refresh revokes editing until fresh unfiltered contents arrive",
    "a rejected save preserves disk and the complete draft",
    "commit history remains read-only while Entire-file text uses the unfiltered full source",
    "a genuinely emptied file still has complete editable contents",
}
CONTROLS = {
    "a failed full-text load remains read-only",
    *(f"a real {kind} change does not gain an editor from hidden-whitespace loading"
      for kind in ("binary", "deleted", "whitespace-only")),
    "a content change becoming mode-only before its full response must not open an empty editor",
}
CASE_NAMES = LAYOUT_CASES | OTHER_FAILURES | CONTROLS


def sha(data):
    return hashlib.sha256(data).hexdigest()


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def source_inputs():
    manifest = json.loads((HERE / "execution-source-manifest.json").read_text())
    fixture = (ROOT / FIXTURE).read_bytes()
    check(sha(fixture) == FIXTURE_SHA, "Frozen corrected fixture changed")
    check(sha(fixture.split(TAIL_MARKER, 1)[1]) == TAIL_SHA, "Frozen assertion tail changed")
    baseline = manifest["baseline_main"]
    identities = {}
    for name, expected in manifest["files"].items():
        if not name.startswith("baseline/"):
            continue
        path = name.removeprefix("baseline/")
        if path == FIXTURE or path.startswith(".rea-work/"):
            continue
        original = subprocess.check_output(["git", "show", f"{baseline}:{path}"], cwd=ROOT)
        check(sha(original) == expected, f"Sealed baseline changed: {path}")
        current = (ROOT / path).read_bytes()
        candidate = manifest["files"].get(f"candidate/{path}", expected)
        check(sha(current) == candidate, f"Sealed candidate/dependency changed: {path}")
        identities[path] = {"baseline": expected, "candidate": sha(current)}
    check(set(PRODUCT) <= identities.keys(), "Missing sealed product identities")
    return baseline, {"fixture_sha256": sha(fixture), "assertion_tail_sha256": TAIL_SHA,
                      "inputs": identities}


def validate_tap(tap, returncode, baseline):
    results = list(re.finditer(r"^(ok|not ok) \d+ - (.+)$", tap, re.MULTILINE))
    names = [match[2] for match in results]
    check(len(names) == len(CASE_NAMES) and set(names) == CASE_NAMES,
          "Incomplete, duplicated, renamed, skipped or setup-only TAP cases")
    check(not re.search(r"^Bail out!|^# (?:cancelled|skipped|todo) [1-9]", tap, re.MULTILINE),
          "Cancelled, skipped, todo or bailed-out fixture")
    passed, failed = [], []
    for index, match in enumerate(results):
        name = match[2]
        block = tap[match.end():results[index + 1].start() if index + 1 < len(results) else len(tap)]
        expected_failure = baseline and name not in CONTROLS
        check((match[1] == "not ok") == expected_failure, f"Unexpected outcome for {name}")
        if expected_failure:
            check(re.search(r"code: ['\"]?ERR_ASSERTION(?:['\"]|\s|$)", block) is not None,
                  f"Not a behavioral assertion failure: {name}")
            if name in LAYOUT_CASES:
                expected = ("Missing production request for example.txt" if name.startswith("file ")
                            else "whole-text request must not inherit the presentation filter")
                check(expected in block, f"Wrong loader regression assertion: {name}")
            failed.append(name)
        else:
            passed.append(name)
    check(returncode == (1 if baseline else 0), "Unexpected Node terminal status")
    return {"passed": passed, "failed": failed}


def test_verifier():
    def sample(baseline):
        lines = ["TAP version 13"]
        for index, name in enumerate(sorted(CASE_NAMES), 1):
            failing = baseline and name not in CONTROLS
            lines.append(f"{'not ok' if failing else 'ok'} {index} - {name}")
            if failing:
                message = ("Missing production request for example.txt" if name.startswith("file ")
                           else "whole-text request must not inherit the presentation filter")
                lines.extend(["  ---", f"  error: '{message}'", "  code: 'ERR_ASSERTION'", "  ..."])
        lines.extend([f"1..{len(CASE_NAMES)}", "# cancelled 0", "# skipped 0", "# todo 0"])
        return "\n".join(lines) + "\n"

    red, green = sample(True), sample(False)
    check(set(validate_tap(red, 1, True)["failed"]) == LAYOUT_CASES | OTHER_FAILURES,
          "Verifier did not recognize declared baseline failures")
    check(set(validate_tap(green, 0, False)["passed"]) == CASE_NAMES,
          "Verifier did not recognize complete candidate success")
    control = next(line for line in red.splitlines() if line.startswith("ok "))
    invalid = [
        ("not ok 1 - hiddenWhitespaceEditing.test.ts\ncode: ERR_MODULE_NOT_FOUND\n", 1, True),
        (red.replace("ERR_ASSERTION", "ERR_MODULE_NOT_FOUND", 1), 1, True),
        (red.replace("Missing production request for example.txt", "unrelated assertion"), 1, True),
        (red.replace(control, "not " + control, 1), 1, True),
        (green.replace("# skipped 0", "# skipped 1"), 0, False),
        (green.replace("ok 1 - ", "# omitted 1 - ", 1), 0, False),
        (green.replace("ok 1 - ", "not ok 1 - ", 1), 1, False),
        (green, 1, False), (red, 0, True),
    ]
    for index, (tap, status, baseline) in enumerate(invalid):
        try:
            validate_tap(tap, status, baseline)
        except RuntimeError:
            continue
        raise RuntimeError(f"Verifier accepted invalid evidence case {index}")
    print("PASS: two valid TAP shapes and nine invalid evidence controls; no product execution")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        test_verifier()
        return
    if args.out is None:
        parser.error("--out is required unless --self-test is used")
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    baseline, identities = source_inputs()
    receipt = {"scope": "DIFF-EDIT-HIDDEN-WHITESPACE", "baseline": baseline,
               "candidate": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
               **identities, "phases": {}, "result": "INCOMPLETE",
               "limitations": ["Tauri IPC and rendered CodeView/editor handle are substituted",
                               "No Rust IPC, DOM/native, visual or consuming-package acceptance"]}
    receipt_path = out / "receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    command = ["node", "--experimental-strip-types", "--test", "--test-concurrency=1",
               "--test-reporter=tap", FIXTURE]
    errors = []
    for phase in ("baseline", "candidate"):
        env = dict(os.environ)
        env.pop("DIFF_WHITESPACE_REGRESSION_REF", None)
        if phase == "baseline":
            env["DIFF_WHITESPACE_REGRESSION_REF"] = baseline
        started = time.monotonic()
        try:
            result = subprocess.run(command, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True, timeout=180)
            status, tap = result.returncode, result.stdout
        except subprocess.TimeoutExpired as error:
            partial = error.stdout or b""
            tap = partial.decode(errors="replace") if isinstance(partial, bytes) else partial
            status = None
        (out / f"{phase}.tap").write_text(tap)
        record = {"command": command, "baseline_selector": env.get("DIFF_WHITESPACE_REGRESSION_REF"),
                  "returncode": status, "seconds": time.monotonic() - started,
                  "tap_sha256": sha(tap.encode()), "result": "FAIL"}
        try:
            record.update(validate_tap(tap, status, phase == "baseline"))
            check(sha((ROOT / FIXTURE).read_bytes()) == FIXTURE_SHA, "Fixture mutated during execution")
            record["result"] = "PASS"
        except RuntimeError as error:
            record["error"] = str(error)
            errors.append(f"{phase}: {error}")
        receipt["phases"][phase] = record
        receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
        print(f"{phase}: {record['result']} (exit {status}); full TAP: {out / (phase + '.tap')}")
    receipt["result"] = "FAIL" if errors else "PASS"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    check(not errors, "; ".join(errors))
    print("PASS: frozen baseline behavioral RED and candidate GREEN; frontend fixture contract only")


if __name__ == "__main__":
    main()
