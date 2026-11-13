import argparse
import hashlib
import json
from pathlib import Path
import re

CASES = (
    "the hidden Anthropic API key action is named Reveal",
    "the hidden OpenAI API key action is named Reveal",
    "a configured row without a reveal callback has no reveal toggle",
    "the visible action keeps its Hide name and pressed state",
)
LABELS = ("Anthropic API key", "OpenAI API key")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def require_field(block, name, expected):
    values = re.findall(r"^\s+" + re.escape(name) + r": ([^\r\n]+)$", block, re.MULTILINE)
    require(len(values) == 1, "Missing or ambiguous diagnostic field: " + name)
    raw = values[0]
    if raw.startswith("'") and raw.endswith("'"):
        actual = raw[1:-1].replace("''", "'")
    elif raw.startswith('"') and raw.endswith('"'):
        actual = json.loads(raw)
    else:
        actual = raw
    require(actual == expected, "Unexpected diagnostic field: " + name)


def inspect(raw, phase, exit_code):
    tap = raw.decode("utf-8")
    failures = [1, 2] if phase == "red" else []
    require(exit_code == (1 if failures else 0), "Unexpected test exit")
    require(not re.search(r"^Bail out!", tap, re.MULTILINE), "TAP bailout")
    results = list(re.finditer(r"^(not ok|ok) (\d+) - ([^\r\n]+)$", tap, re.MULTILINE))
    require(len(results) == len(CASES), "Unexpected result count")
    require([int(result[2]) for result in results] == [1, 2, 3, 4], "Unexpected case numbers")
    require(tuple(result[3] for result in results) == CASES, "Unexpected case names or directives")
    require(not any(re.search(r"#\s*(?:SKIP|TODO)\b", result[0], re.IGNORECASE) for result in results), "Result-line directive")
    require(re.findall(r"^1\.\.(\d+)$", tap, re.MULTILINE) == ["4"], "Missing or ambiguous TAP plan")
    summary = dict(tests=4, **{"pass": 4 - len(failures)}, fail=len(failures), cancelled=0, skipped=0, todo=0)
    for name, expected in summary.items():
        values = re.findall(r"^# " + name + r" (\d+)$", tap, re.MULTILINE)
        require(values == [str(expected)], "Unexpected summary: " + name)
    actual_failures = [int(result[2]) for result in results if result[1] == "not ok"]
    require(actual_failures == failures, "Unexpected failing cases")
    for index in range(len(failures)):
        result = results[index]
        block = tap[result.end():results[index + 1].start()]
        require_field(block, "failureType", "testCodeFailure")
        require_field(block, "code", "ERR_ASSERTION")
        require_field(block, "operator", "strictEqual")
        require_field(block, "actual", "Show " + LABELS[index])
        require_field(block, "expected", "Reveal " + LABELS[index])
    return {
        "author": "Conductor Rebuild",
        "phase": phase,
        "classification": "QUALIFYING_RED" if failures else "VALID_GREEN",
        "exit_code": exit_code,
        "summary": summary,
        "failures": actual_failures,
        "raw_tap_sha256": hashlib.sha256(raw).hexdigest(),
        "test_execution_performed_by_inspector": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("red", "green"), required=True)
    parser.add_argument("--exit-code", type=int, required=True)
    parser.add_argument("tap", type=Path)
    args = parser.parse_args()
    print(json.dumps(inspect(args.tap.read_bytes(), args.phase, args.exit_code), indent=2))


if __name__ == "__main__":
    main()
