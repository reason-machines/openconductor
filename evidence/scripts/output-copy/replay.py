#!/usr/bin/env python3
"""Replay the unchanged copy fixture before and after the retained product patch."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
FIXTURE = Path("src/scripts/outputCopy.test.ts")
PRODUCT = Path("src/components/ScriptOutput.tsx")
FILES = (FIXTURE, PRODUCT, Path("src/scripts/output.ts"), Path("src/backend.ts"), Path("package.json"))
CASES = (
    "copy trims a selection ending in spaces before later terminal text",
    "copy trims each selected line without removing indentation or internal spacing",
    "copying only selected spaces produces an empty plain-text value",
    "copy preserves selected blank lines rather than trimming the complete selection",
    "copy keeps leading and internal spaces when no line ends in whitespace",
    "a collapsed terminal selection leaves clipboard contents and the default action alone",
    "copy outside the terminal is not intercepted",
    "copy without clipboard data does not throw",
    "unmount leaves an old terminal unable to rewrite a later copy event",
)
COMMAND = ["node", "--test", "--test-reporter=tap", str(FIXTURE)]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def prepare(directory):
    record = json.loads((HERE / "source-identity.json").read_text())
    historical_fixture = (HERE / "frozen-outputCopy.test.ts.txt").read_bytes()
    assert sha(historical_fixture) == record["frozen_fixture_sha256"], "frozen fixture changed"
    for adapter in record["fixture_adapters"]:
        before, after = adapter["before"].encode(), adapter["after"].encode()
        assert historical_fixture.count(before) == 1, adapter["reason"]
        historical_fixture = historical_fixture.replace(before, after)
    assert sha(historical_fixture) == record["delivered_fixture_sha256"], "historical fixture changed"
    historical_product = (HERE / "candidate-ScriptOutput.tsx.txt").read_bytes()
    assert sha(historical_product) == record["candidate_sha256"], "historical candidate changed"
    assert sha((HERE / "copy.patch").read_bytes()) == record["patch_sha256"], "patch changed"
    current_fixture = (ROOT / FIXTURE).read_bytes()
    assert historical_fixture[historical_fixture.index(b'test("'):] == current_fixture[current_fixture.index(b'test("'):], "nine current assertions changed"
    for path in FILES:
        (directory / path).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / path, directory / path)
    (directory / FIXTURE).write_bytes(historical_fixture)
    (directory / PRODUCT).write_bytes(historical_product)
    (directory / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
    subprocess.run(["git", "apply", "--reverse", str(HERE / "copy.patch")], cwd=directory, check=True)
    baseline = next(item for item in record["main_inputs"] if item["path"] == str(PRODUCT))
    assert sha((directory / PRODUCT).read_bytes()) == baseline["sha256"], "not the recorded main baseline"
    assert (directory / FIXTURE).read_bytes() == historical_fixture, "fixture changed in replay"
    return record


def validate_tap(output, returncode, baseline):
    results = list(re.finditer(r"^(not ok|ok) \d+ - (.+)$", output, re.MULTILINE))
    assert [match[2] for match in results] == list(CASES), "missing, extra or setup-failed cases"
    expected = ["not ok"] * 4 + ["ok"] * 5 if baseline else ["ok"] * 9
    assert [match[1] for match in results] == expected, "unexpected behavioral result"
    assert returncode == (1 if baseline else 0), "unexpected runner exit"
    for index, match in enumerate(results):
        if match[1] != "not ok":
            continue
        end = results[index + 1].start() if index + 1 < len(results) else len(output)
        diagnostic = output[match.end():end]
        assert "ERR_ASSERTION" in diagnostic and "deepStrictEqual" in diagnostic, "not a payload assertion"
        assert "text:" in diagnostic and "prevented:" in diagnostic, "missing clipboard payload difference"
    assert re.search(r"^# tests 9$", output, re.MULTILINE), "incomplete test run"
    assert re.search(rf"^# fail {4 if baseline else 0}$", output, re.MULTILINE), "wrong failure total"
    return {"passed": 5 if baseline else 9, "failed": 4 if baseline else 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    receipt = {"head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
               "command": COMMAND, "native_clipboard_or_rendering_verified": False,
               "proof_scope": "frozen historical pair; ordinary frontend unit CI tests the current component"}
    with tempfile.TemporaryDirectory(prefix="output-copy-replay-") as temporary:
        directory = Path(temporary)
        record = prepare(directory)
        receipt["fixture_sha256"] = record["delivered_fixture_sha256"]
        receipt["baseline_main"] = record["main_checked"]
        for phase in ("before", "after"):
            if phase == "after":
                shutil.copyfile(HERE / "candidate-ScriptOutput.tsx.txt", directory / PRODUCT)
            assert sha((directory / FIXTURE).read_bytes()) == receipt["fixture_sha256"], "fixture changed between phases"
            product_hash = sha((directory / PRODUCT).read_bytes())
            result = subprocess.run(COMMAND, cwd=directory, text=True, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, timeout=90, check=False)
            (args.out_dir / f"{phase}.tap").write_text(result.stdout)
            print(f"::group::Copy regression {phase}", flush=True)
            print(result.stdout, flush=True)
            print("::endgroup::", flush=True)
            receipt[phase] = {
                **validate_tap(result.stdout, result.returncode, phase == "before"),
                "product_sha256": product_hash,
                "fixture_sha256": sha((directory / FIXTURE).read_bytes()),
                "tap_sha256": sha(result.stdout.encode()),
            }
    (args.out_dir / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2), flush=True)


if __name__ == "__main__":
    main()
