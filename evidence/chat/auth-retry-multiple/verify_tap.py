from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

CONTRACT = Path(__file__).with_name("contract.json")


def qualify(text: str, exit_code: int, profile: dict) -> dict:
    expected = profile["tests"]
    failed = set(profile["failed_tests"])
    count = len(expected)
    required_exit = 1 if failed else 0
    if exit_code != required_exit:
        raise ValueError(f"Node exit {exit_code}, expected {required_exit}")
    if text.splitlines()[:1] != ["TAP version 13"] or "Bail out!" in text:
        raise ValueError("Missing TAP version or aborted TAP stream")
    plans = re.findall(r"^1\.\.(\d+)$", text, re.MULTILINE)
    if plans != [str(count)]:
        raise ValueError("Missing, duplicate or incorrect test plan")
    summaries = {
        "tests": count, "suites": 0, "pass": count - len(failed),
        "fail": len(failed), "cancelled": 0, "skipped": 0, "todo": 0,
    }
    for key, value in summaries.items():
        actual = re.findall(rf"^# {key} (\d+)$", text, re.MULTILINE)
        if actual != [str(value)]:
            raise ValueError(f"Missing, duplicate or incorrect {key} summary")
    records = list(re.finditer(r"^(ok|not ok) (\d+) - (.+)$", text, re.MULTILINE))
    if len(records) != count:
        raise ValueError("Missing or extra top-level test results")
    names = [record.group(3) for record in records]
    if len(set(names)) != count or set(names) != set(expected):
        raise ValueError("Test names do not match the frozen fixture contract")
    if [int(record.group(2)) for record in records] != list(range(1, count + 1)):
        raise ValueError("Test result numbers are not complete and sequential")
    actual_failed = {record.group(3) for record in records if record.group(1) == "not ok"}
    if actual_failed != failed:
        raise ValueError("Failed test names do not match the required behavior failures")
    for index, record in enumerate(records):
        if record.group(1) != "not ok":
            continue
        end = records[index + 1].start() if index + 1 < count else len(text)
        diagnostic = text[record.end():end]
        for key, value in [("failureType", "testCodeFailure"), ("code", "ERR_ASSERTION")]:
            values = re.findall(rf"^  {key}: ['\"]([^'\"]+)['\"]$", diagnostic, re.MULTILINE)
            if values != [value]:
                raise ValueError(f"Failed case lacks the required assertion diagnostic: {key}")
        fragment = profile.get("required_failure_fragments", {}).get(record.group(3))
        if fragment and fragment not in diagnostic:
            raise ValueError("Failed case is not the intended second-message delivery assertion")
    return {"outcome": "QUALIFIED_RED" if failed else "GREEN", "node_exit": exit_code, **summaries}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("profile")
    parser.add_argument("tap_log", type=Path)
    parser.add_argument("--exit-code", type=int, required=True)
    args = parser.parse_args()
    try:
        profiles = json.loads(CONTRACT.read_text())["profiles"]
        result = qualify(args.tap_log.read_text(), args.exit_code, profiles[args.profile])
    except (OSError, UnicodeError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"outcome": "REJECTED", "reason": str(error)}))
        return 1
    print(json.dumps({"profile": args.profile, **result}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
