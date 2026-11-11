#!/usr/bin/env python3
"""Run the frozen inline-comment IME fixture against pinned baseline and candidate."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
PRODUCT = "src/features/diff/ReviewComments.tsx"
FIXTURE = "src/features/diff/commentImeSubmit.test.ts"
FAILURES = {
    **{f"comment IME {signal} blocks {modifier} Enter": "IME must not submit the comment"
       for modifier in ("metaKey", "ctrlKey") for signal in ("native", "lifecycle", "keyCode", "which")},
    **{f"comment IME {signal} blocks Escape cancellation": "IME must not cancel the comment"
       for signal in ("native", "lifecycle", "legacy")},
}
CONTROLS = {
    "comment non-IME metaKey Enter saves exact text once",
    "comment non-IME ctrlKey Enter saves exact text once",
    "comment composition end and blur restore normal shortcuts",
    "comment blank submit remains disabled after composition",
    "comment non-IME Escape still confirms dirty cancellation",
}
NAMES = set(FAILURES) | CONTROLS


def check(value, message):
    if not value:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def validate(tap, status, baseline):
    cases = list(re.finditer(r"^(ok|not ok) \d+ - (.+)$", tap, re.MULTILINE))
    check(len(cases) == 16 and {c[2] for c in cases} == NAMES, "Incomplete, duplicate or renamed TAP cases")
    check(re.search(r"^1\.\.16$", tap, re.MULTILINE), "Missing TAP plan")
    for field, value in {"tests": 16, "pass": 5 if baseline else 16, "fail": 11 if baseline else 0,
                         "cancelled": 0, "skipped": 0, "todo": 0}.items():
        check(re.search(rf"^# {field} {value}$", tap, re.MULTILINE), f"Wrong TAP {field} summary")
    check("Bail out!" not in tap and not re.search(r"^(?:ok|not ok) \d+ - .*#\s*(?:SKIP|TODO)\b", tap, re.I | re.M),
          "Unfinished or skipped TAP")
    for index, case in enumerate(cases):
        red = baseline and case[2] in FAILURES
        check((case[1] == "not ok") == red, f"Wrong result for {case[2]}")
        if red:
            block = tap[case.end():cases[index + 1].start() if index + 1 < len(cases) else len(tap)]
            check(FAILURES[case[2]] in block and re.search(r"code: ['\"]?ERR_ASSERTION(?:['\"]|\s|$)", block),
                  f"Wrong behavioral assertion for {case[2]}")
    check(status == (1 if baseline else 0), "Unexpected terminal exit")
    return {"passed": 5 if baseline else 16, "failed": 11 if baseline else 0}


def synthetic(baseline):
    lines = ["TAP version 13"]
    for index, name in enumerate(sorted(NAMES), 1):
        red = baseline and name in FAILURES
        lines.append(f"{'not ok' if red else 'ok'} {index} - {name}")
        if red:
            lines += ["  ---", f"  error: '{FAILURES[name]}'", "  code: 'ERR_ASSERTION'", "  ..."]
    lines += ["1..16", "# tests 16", f"# pass {5 if baseline else 16}", f"# fail {11 if baseline else 0}",
              "# cancelled 0", "# skipped 0", "# todo 0"]
    return "\n".join(lines) + "\n"


def self_test():
    red, green = synthetic(True), synthetic(False)
    validate(red, 1, True)
    validate(green, 0, False)
    invalid = [
        (red.replace("ERR_ASSERTION", "ERR_MODULE_NOT_FOUND", 1), 1, True),
        (red.replace("IME must not submit", "Unrelated failure", 1), 1, True),
        (green.replace("1..16", "1..15"), 0, False),
        (green.replace("# skipped 0", "# skipped 1"), 0, False),
        (green.replace("# cancelled 0", "# cancelled 1"), 0, False),
        (green.replace("# todo 0", "# todo 1"), 0, False),
        (green.replace(sorted(NAMES)[0], sorted(NAMES)[0] + " # SKIP"), 0, False),
        (green.replace(sorted(NAMES)[0], sorted(NAMES)[1]), 0, False),
        (green + "Bail out!", 0, False), (red, 0, True), (green, 1, False),
    ]
    for tap, status, baseline in invalid:
        try:
            validate(tap, status, baseline)
        except RuntimeError:
            continue
        raise RuntimeError("Verifier accepted invalid evidence")
    print(f"PASS: two valid TAP shapes; {len(invalid)} invalid shapes rejected; no product runtime")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.out is None:
        parser.error("--out required")
    root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], cwd=HERE, text=True).strip())
    manifest = json.loads((HERE / "source.json").read_text())
    baseline = manifest["baseline"]
    for path, expected in {FIXTURE: manifest["fixture_sha256"], **manifest["dependencies"]}.items():
        check(sha((root / path).read_bytes()) == expected, f"Input changed: {path}")
    for span in manifest["reference_spans"].values():
        check(sha((HERE / "reference" / span["snapshot"]).read_bytes()) == span["sha256"], "Reference changed")
    check(sha(subprocess.check_output(["git", "show", f"{baseline}:{PRODUCT}"], cwd=root)) == manifest["product"]["baseline"],
          "Baseline source changed")
    check(sha((root / PRODUCT).read_bytes()) == manifest["product"]["candidate"], "Candidate source changed")
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    receipt = {"result": "INCOMPLETE", "baseline": baseline,
               "candidate": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
               "fixture_sha256": manifest["fixture_sha256"], "phases": {},
               "scope": "Mounted actual inline-comment Composer; real React with substituted DialogFrame and inert external boundaries",
               "not_exercised": ["Browser/editor DOM", "Actual platform IME event delivery", "Native/E1", "Visual parity", "SQLite transport"]}
    receipt_path = out / "receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    for phase in ("baseline", "candidate"):
        env = dict(os.environ)
        env.pop("DIFF_COMMENT_IME_REF", None)
        if phase == "baseline":
            env["DIFF_COMMENT_IME_REF"] = baseline
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
