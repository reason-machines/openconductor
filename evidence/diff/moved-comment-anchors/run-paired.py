#!/usr/bin/env python3
"""Run one sealed component fixture against pre-fix and candidate product code."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FIXTURE = "src/features/diff/movedCommentAnchors.test.ts"
NAMES = {f"{layout} {store} {first} keeps moved ranges through reload without double shifting"
         for layout in ("unified", "split", "file")
         for store in ("local store", "IPC adapter") for first in ("save", "complete")}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def validate(tap, status, baseline):
    cases = list(re.finditer(r"^(ok|not ok) \d+ - (.+)$", tap, re.MULTILINE))
    check(len(cases) == len(NAMES) and {c[2] for c in cases} == NAMES, "Incomplete or renamed TAP cases")
    check(not re.search(r"^Bail out!|^# (?:cancelled|skipped|todo) [1-9]", tap, re.MULTILINE), "Skipped or incomplete TAP")
    for i, case in enumerate(cases):
        check((case[1] == "not ok") == baseline, f"Unexpected outcome for {case[2]}")
        if baseline:
            block = tap[case.end():cases[i + 1].start() if i + 1 < len(cases) else len(tap)]
            check("persisted range follows editor annotation to lines 4-6" in block,
                  f"Wrong regression failure for {case[2]}")
            check(re.search(r"code: ['\"]?ERR_ASSERTION(?:['\"]|\s|$)", block), "Setup failure is not RED")
    check(status == (1 if baseline else 0), "Unexpected terminal status")
    return {"passed": 0 if baseline else len(cases), "failed": len(cases) if baseline else 0}


def self_test():
    def tap(red):
        output = []
        for i, name in enumerate(sorted(NAMES), 1):
            output.append(f"{'not ok' if red else 'ok'} {i} - {name}")
            if red:
                output += ["  ---", "  error: 'persisted range follows editor annotation to lines 4-6'",
                           "  code: 'ERR_ASSERTION'", "  ..."]
        output += [f"1..{len(NAMES)}", "# cancelled 0", "# skipped 0", "# todo 0"]
        return "\n".join(output) + "\n"
    red, green = tap(True), tap(False)
    validate(red, 1, True)
    validate(green, 0, False)
    bad = [(red.replace("ERR_ASSERTION", "ERR_MODULE_NOT_FOUND", 1), 1, True),
           (red.replace("persisted range", "unrelated range", 1), 1, True),
           (green.replace("# skipped 0", "# skipped 1"), 0, False),
           (green.replace("ok 1 - ", "# absent 1 - "), 0, False),
           (green, 1, False), (red, 0, True),
           ("not ok 1 - movedCommentAnchors.test.ts\ncode: ERR_MODULE_NOT_FOUND\n", 1, True)]
    for data, status, baseline in bad:
        try:
            validate(data, status, baseline)
        except RuntimeError:
            continue
        raise RuntimeError("Verifier accepted invalid evidence")
    print("PASS: two valid TAP shapes; seven invalid evidence shapes rejected; no product execution")


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
    manifest = json.loads((HERE / "source.json").read_text())
    check(sha((ROOT / FIXTURE).read_bytes()) == manifest["fixture_sha256"], "Sealed fixture changed")
    for path, hashes in manifest["product"].items():
        before = subprocess.check_output(["git", "show", f"{manifest['baseline']}:{path}"], cwd=ROOT)
        check(sha(before) == hashes["baseline"], f"Baseline changed: {path}")
        check(sha((ROOT / path).read_bytes()) == hashes["candidate"], f"Candidate changed: {path}")
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    receipt = {"candidate": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
               "baseline": manifest["baseline"], "fixture_sha256": manifest["fixture_sha256"],
               "scope": "Mounted frontend components, real Pierre annotation mapping and persistence adapters",
               "not_exercised": ["CodeView DOM/editor lifecycle", "Real Tauri transport", "Native/visual acceptance", "Package acceptance"],
               "phases": {}, "result": "INCOMPLETE"}
    receipt_file = out / "receipt.json"
    receipt_file.write_text(json.dumps(receipt, indent=2) + "\n")
    for phase in ("baseline", "candidate"):
        env = dict(os.environ)
        env.pop("DIFF_ANCHORS_BASELINE", None)
        if phase == "baseline":
            env["DIFF_ANCHORS_BASELINE"] = manifest["baseline"]
        command = ["node", "--experimental-strip-types", "--test", "--test-concurrency=1", "--test-reporter=tap", FIXTURE]
        run = subprocess.run(command, cwd=ROOT, env=env, text=True, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, timeout=180)
        (out / f"{phase}.tap").write_text(run.stdout)
        result = validate(run.stdout, run.returncode, phase == "baseline")
        receipt["phases"][phase] = {**result, "exit_code": run.returncode, "tap_sha256": sha(run.stdout.encode()), "command": command}
        receipt_file.write_text(json.dumps(receipt, indent=2) + "\n")
    receipt["result"] = "PASS"
    receipt_file.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
