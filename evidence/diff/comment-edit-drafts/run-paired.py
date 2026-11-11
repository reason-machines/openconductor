#!/usr/bin/env python3
"""Verify one sealed comment-editor fixture against baseline and candidate code."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
FIXTURE = "src/features/diff/commentEditDrafts.test.ts"
PRODUCT = "src/features/diff/ReviewComments.tsx"
FAILURES = {
    "comment edit survives annotation unmount with nonempty draft": "Retained edit must reopen after annotation unmount",
    "comment edit survives annotation unmount with empty draft": "Retained edit must reopen after annotation unmount",
    "comment edit survives full review remount and stays isolated by comment and workspace": "Retained edit must reopen after review remount",
    "failed save retains unpersisted draft across review remount": "Failed-save draft must reopen after review remount",
}
CONTROLS = {
    "successful save persists body and clears only the edited draft",
    "cancel keeps dirty draft until explicit discard and never writes stored body",
}
NAMES = set(FAILURES) | CONTROLS


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def validate(tap, status, baseline):
    cases = list(re.finditer(r"^(ok|not ok) \d+ - (.+)$", tap, re.MULTILINE))
    check(len(cases) == len(NAMES) and {c[2] for c in cases} == NAMES, "Incomplete, duplicate or renamed TAP cases")
    check(re.search(r"^1\.\.6$", tap, re.MULTILINE), "Missing complete TAP plan")
    for field, expected in {
        "tests": 6, "pass": 2 if baseline else 6, "fail": 4 if baseline else 0,
        "cancelled": 0, "skipped": 0, "todo": 0,
    }.items():
        check(re.search(rf"^# {field} {expected}$", tap, re.MULTILINE), f"Wrong TAP {field} summary")
    check("Bail out!" not in tap and not re.search(r"^(?:ok|not ok) \d+ - .*#\s*(?:SKIP|TODO)\b", tap, re.IGNORECASE | re.MULTILINE), "Skipped, unfinished or bailed-out TAP")
    for index, case in enumerate(cases):
        red = baseline and case[2] in FAILURES
        check((case[1] == "not ok") == red, f"Wrong result for {case[2]}")
        if red:
            block = tap[case.end():cases[index + 1].start() if index + 1 < len(cases) else len(tap)]
            check(FAILURES[case[2]] in block, f"Wrong behavioral assertion for {case[2]}")
            check(re.search(r"code: ['\"]?ERR_ASSERTION(?:['\"]|\s|$)", block), "Setup failure is not RED proof")
    check(status == (1 if baseline else 0), "Unexpected terminal exit code")
    return {"passed": 2 if baseline else 6, "failed": 4 if baseline else 0}


def synthetic(baseline):
    lines = ["TAP version 13"]
    for index, name in enumerate(sorted(NAMES), 1):
        red = baseline and name in FAILURES
        lines.append(f"{'not ok' if red else 'ok'} {index} - {name}")
        if red:
            lines += ["  ---", f"  error: '{FAILURES[name]}'", "  code: 'ERR_ASSERTION'", "  ..."]
    lines += ["1..6", "# tests 6", f"# pass {2 if baseline else 6}", f"# fail {4 if baseline else 0}",
              "# cancelled 0", "# skipped 0", "# todo 0"]
    return "\n".join(lines) + "\n"


def self_test():
    red, green = synthetic(True), synthetic(False)
    validate(red, 1, True)
    validate(green, 0, False)
    bad = [
        (red.replace("ERR_ASSERTION", "ERR_MODULE_NOT_FOUND", 1), 1, True),
        (red.replace("Retained edit must reopen", "Unrelated error", 1), 1, True),
        (green.replace("# skipped 0", "# skipped 1"), 0, False),
        (green.replace("1..6", "1..5"), 0, False),
        (green.replace("ok 1 - ", "ok 1 - missing "), 0, False),
        (red.replace("# pass 2", "# pass 3"), 1, True),
        (red.replace("# fail 4", "# fail 3"), 1, True),
        (green + "Bail out!", 0, False),
        (green.replace("# todo 0", "# todo 1"), 0, False),
        (green.replace("# cancelled 0", "# cancelled 1"), 0, False),
        (green.replace(sorted(NAMES)[0], sorted(NAMES)[0] + " # SKIP"), 0, False),
        (green, 1, False), (red, 0, True),
        ("not ok 1 - commentEditDrafts.test.ts\ncode: ERR_MODULE_NOT_FOUND\n", 1, True),
    ]
    for tap, status, baseline in bad:
        try:
            validate(tap, status, baseline)
        except RuntimeError:
            continue
        raise RuntimeError("Verifier accepted invalid evidence")
    print(f"PASS: two valid TAP shapes; {len(bad)} invalid shapes rejected; no product runtime")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.out is None:
        parser.error("--out is required")
    root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], cwd=HERE, text=True).strip())
    manifest = json.loads((HERE / "source.json").read_text())
    check(manifest["status"] == "SEALED_AFTER_1046_MERGE", "Prepared source is not admitted execution evidence")
    baseline = manifest["baseline"]
    check(subprocess.run(["git", "merge-base", "--is-ancestor", manifest["anchor_merge"], baseline], cwd=root).returncode == 0,
          "Baseline does not consume the merged moved-anchor change")
    for path, expected in manifest["dependencies"].items():
        check(sha((root / path).read_bytes()) == expected, f"Dependency changed: {path}")
    for name, span in manifest["reference"]["spans"].items():
        check(sha((HERE / "reference" / f"reference-{name}.txt").read_bytes()) == span["sha256"],
              f"Retained reference changed: {name}")
    fixture_hash = sha((root / FIXTURE).read_bytes())
    check(fixture_hash == manifest["fixture_sha256"], "Fixture changed")
    check(sha(subprocess.check_output(["git", "show", f"{baseline}:{PRODUCT}"], cwd=root)) == manifest["product"]["baseline"], "Baseline changed")
    check(sha((root / PRODUCT).read_bytes()) == manifest["product"]["candidate"], "Candidate changed")
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    receipt = {
        "result": "INCOMPLETE", "baseline": baseline,
        "candidate": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
        "fixture_sha256": fixture_hash, "phases": {},
        "scope": "Mounted ReviewComments with real React and localCommentStore; substituted DialogFrame, markdown and commentsApi selector",
        "not_exercised": ["Browser/editor DOM", "Native/E1", "Real Tauri/SQLite transport", "Visual parity", "Package acceptance"],
    }
    receipt_path = out / "receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    for phase in ("baseline", "candidate"):
        env = dict(os.environ)
        env.pop("DIFF_COMMENT_DRAFT_REF", None)
        if phase == "baseline":
            env["DIFF_COMMENT_DRAFT_REF"] = baseline
        command = ["node", "--experimental-strip-types", "--test", "--test-concurrency=1", "--test-reporter=tap", FIXTURE]
        run = subprocess.run(command, cwd=root, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=180)
        (out / f"{phase}.tap").write_text(run.stdout)
        result = validate(run.stdout, run.returncode, phase == "baseline")
        receipt["phases"][phase] = {**result, "exit_code": run.returncode, "tap_sha256": sha(run.stdout.encode()), "command": command}
        receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    receipt["result"] = "PASS"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
