"""Replay one frozen prefix fixture against the recorded baseline and this tree."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command, cwd, output, env=None):
    result = subprocess.run(command, cwd=cwd, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
    output.write_text(result.stdout)
    print(result.stdout, end="")
    return result


def prepare_sources(tree, phase, manifest):
    for path in manifest["baseline_sources"]:
        destination = tree / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / path, destination)
    if phase == "baseline":
        subprocess.run(["git", "apply", "--unidiff-zero", "--reverse", str(HERE / "fix.patch")], cwd=tree, check=True)
        shutil.copyfile(HERE / "baseline/types.ts", tree / "src/settings/types.ts")
        for path, expected in manifest["baseline_sources"].items():
            assert digest(tree / path) == expected, f"Baseline source changed: {path}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()
    out = Path(args.out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((HERE / "source.json").read_text())
    fixture = ROOT / "src/settings/customPrefix.test.ts"
    rust_fixture = HERE / "fixture/prefix.rs"
    input_fixture = ROOT / "src/settings/customPrefixInput.test.ts"
    assert digest(input_fixture) == manifest["input_fixture_sha256"], "Mounted input fixture changed"
    assert digest(fixture) == manifest["node_fixture_sha256"], "Node fixture changed"
    assert digest(rust_fixture) == manifest["rust_fixture_sha256"], "Rust fixture changed"
    for span in manifest["reference_spans"]:
        assert digest(HERE / "reference" / span["file"]) == span["sha256"], span["file"]
    receipt = {"baseline_commit": manifest["baseline_commit"], "phases": {}}
    for phase in ["baseline", "candidate"]:
        with tempfile.TemporaryDirectory(prefix="oc-prefix-") as temp:
            tree = Path(temp)
            prepare_sources(tree, phase, manifest)
            shutil.copyfile(fixture, tree / "src/settings/customPrefix.test.ts")
            shutil.copyfile(input_fixture, tree / "src/settings/customPrefixInput.test.ts")
            assert digest(tree / "src/settings/customPrefix.test.ts") == manifest["node_fixture_sha256"]
            node = run(["node", "--test", "src/settings/customPrefix.test.ts"], tree, out / f"{phase}-node.tap")
            counts = {key: int(re.search(rf"^# {key} (\d+)$", node.stdout, re.M)[1]) for key in ["tests", "pass", "fail"]}
            expected = {"tests": 7, "pass": 3, "fail": 4} if phase == "baseline" else {"tests": 7, "pass": 7, "fail": 0}
            assert counts == expected, f"Unexpected {phase} Node counts: {counts}"
            assert node.returncode == (1 if phase == "baseline" else 0), "Unexpected Node exit"
            if phase == "baseline":
                for wanted in ["myname/tokyo", "team/tokyo", "team/ui/tokyo", "team-ui/tokyo", "ERR_ASSERTION"]:
                    assert wanted in node.stdout, f"Missing intended baseline failure: {wanted}"
            assert digest(tree / "src/settings/customPrefixInput.test.ts") == manifest["input_fixture_sha256"]
            env = {**os.environ, "CUSTOM_PREFIX_SOURCE_ROOT": str(tree), "CUSTOM_PREFIX_DEPS": os.environ.get("CUSTOM_PREFIX_DEPS", str(ROOT))}
            mounted = run(["node", "--test", "src/settings/customPrefixInput.test.ts"], tree, out / f"{phase}-input.tap", env)
            input_counts = {key: int(re.search(rf"^# {key} (\d+)$", mounted.stdout, re.M)[1]) for key in ["tests", "pass", "fail"]}
            assert input_counts == ({"tests": 6, "pass": 2, "fail": 4} if phase == "baseline" else {"tests": 6, "pass": 6, "fail": 0}), f"Unexpected {phase} mounted input counts: {input_counts}"
            assert mounted.returncode == (1 if phase == "baseline" else 0), "Unexpected input fixture exit"
            if phase == "baseline":
                for wanted in ["Preview: myname/tokyo", "Preview: team/tokyo", "Preview: team/ui/tokyo", "Preview: team-ui/tokyo", "ERR_ASSERTION"]:
                    assert wanted in mounted.stdout, f"Missing intended mounted baseline failure: {wanted}"
            shutil.copyfile(tree / "src-tauri/src/workspace/naming.rs", tree / "naming.rs")
            shutil.copyfile(rust_fixture, tree / "prefix.rs")
            assert digest(tree / "prefix.rs") == manifest["rust_fixture_sha256"]
            build = run(["rustc", "--edition", "2021", "--test", "-A", "dead_code", "prefix.rs", "-o", "prefix-tests"], tree, out / f"{phase}-rust-build.txt")
            assert build.returncode == 0, "Rust fixture did not compile"
            rust = run([str(tree / "prefix-tests")], tree, out / f"{phase}-rust.txt")
            assert rust.returncode == (101 if phase == "baseline" else 0), "Unexpected Rust exit"
            if phase == "baseline":
                assert 'left: "myname-/tokyo"' in rust.stdout
                assert 'right: "myname-tokyo"' in rust.stdout
            else:
                assert "1 passed; 0 failed" in rust.stdout
            receipt["phases"][phase] = {"node": counts, "node_exit": node.returncode, "mounted_input": input_counts, "input_exit": mounted.returncode, "input_fixture_sha256": digest(input_fixture), "rust_exit": rust.returncode, "node_fixture_sha256": digest(fixture), "rust_fixture_sha256": digest(rust_fixture)}
    receipt["result"] = "PASS: intended baseline assertions fail; identical fixtures pass on candidate"
    (out / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(receipt["result"])


if __name__ == "__main__":
    main()
