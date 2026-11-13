#!/usr/bin/env python3
"""Run the same actual-component width fixture before and after Unicode 11 activation."""

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
PRODUCT = Path("src/components/ScriptOutput.tsx")
FIXTURE = Path("src/scripts/outputUnicode.test.ts")
FILES = (PRODUCT, FIXTURE, Path("src/scripts/output.ts"), Path("package.json"))
COMMAND = ["node", "--test", "--test-reporter=tap", str(FIXTURE)]
CASES = (
    "Run and Setup output reserve two cells for a Unicode 11 emoji",
    "adjacent Unicode 11 emoji preserve the following output column",
    "wide Unicode 11 output wraps the next character onto the next row",
    "Unicode 11 combining marks do not advance the output cursor",
    "ASCII output keeps its original cell width",
    "CJK output keeps its existing wide-cell behavior",
    "existing combining accents keep their existing zero-cell behavior",
    "empty output leaves the terminal at its initial position",
    "output replacement and cleanup still use the real terminal lifecycle",
)
DIFFERENCES = (("3", "4"), ("3", "5"), ("''", "'Z'"), ("3", "2"))


def sha(data):
    return hashlib.sha256(data).hexdigest()


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
        assert "ERR_ASSERTION" in diagnostic and "strictEqual" in diagnostic, "not a width assertion"
        actual, expected_value = DIFFERENCES[index]
        assert re.search(rf"^\s+actual: {re.escape(actual)}$", diagnostic, re.MULTILINE), "wrong baseline width"
        assert re.search(rf"^\s+expected: {re.escape(expected_value)}$", diagnostic, re.MULTILINE), "wrong expected width"
    assert re.search(r"^# tests 9$", output, re.MULTILINE), "incomplete run"
    assert re.search(rf"^# fail {4 if baseline else 0}$", output, re.MULTILINE), "wrong failure total"
    return {"passed": 5 if baseline else 9, "failed": 4 if baseline else 0}


def prepare(directory):
    record = json.loads((HERE / "contract.json").read_text())
    historical_fixture = (HERE / "outputUnicode.test.ts.txt").read_bytes()
    historical_product = (HERE / "candidate-ScriptOutput.tsx.txt").read_bytes()
    assert sha(historical_fixture) == record["fixture_sha256"], "historical fixture changed"
    assert sha(historical_product) == record["candidate_product_sha256"], "historical candidate changed"
    current_fixture = (ROOT / FIXTURE).read_bytes()
    assert current_fixture[current_fixture.index(b'test("'):] == historical_fixture[historical_fixture.index(b'test("'):], "nine current assertions changed"
    assert sha((HERE / "unicode.patch").read_bytes()) == record["patch_sha256"], "patch changed"
    for path in FILES:
        (directory / path).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / path, directory / path)
    (directory / FIXTURE).write_bytes(historical_fixture)
    (directory / PRODUCT).write_bytes(historical_product)
    (directory / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
    subprocess.run(["git", "apply", "--reverse", str(HERE / "unicode.patch")], cwd=directory, check=True)
    assert sha((directory / PRODUCT).read_bytes()) == record["baseline_product_sha256"], "not the exact main baseline"
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    receipt = {
        "head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "command": COMMAND,
        "proof_scope": "frozen historical pair; ordinary frontend unit CI tests the current component",
        "native_or_visual_behavior_verified": False,
    }
    with tempfile.TemporaryDirectory(prefix="output-unicode-replay-") as temporary:
        directory = Path(temporary)
        record = prepare(directory)
        receipt["baseline_main"] = record["main_checked"]
        receipt["fixture_sha256"] = record["fixture_sha256"]
        receipt["lockfile_sha256"] = sha((ROOT / "package-lock.json").read_bytes())
        for phase in ("before", "after"):
            if phase == "after":
                shutil.copyfile(HERE / "candidate-ScriptOutput.tsx.txt", directory / PRODUCT)
            assert sha((directory / FIXTURE).read_bytes()) == record["fixture_sha256"], "fixture changed between phases"
            result = subprocess.run(COMMAND, cwd=directory, text=True, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, timeout=90, check=False)
            (args.out_dir / f"{phase}.tap").write_text(result.stdout)
            print(f"::group::Unicode width regression {phase}", flush=True)
            print(result.stdout, flush=True)
            print("::endgroup::", flush=True)
            receipt[phase] = {
                **validate_tap(result.stdout, result.returncode, phase == "before"),
                "product_sha256": sha((directory / PRODUCT).read_bytes()),
                "fixture_sha256": sha((directory / FIXTURE).read_bytes()),
                "tap_sha256": sha(result.stdout.encode()),
            }
    (args.out_dir / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2), flush=True)


if __name__ == "__main__":
    main()
