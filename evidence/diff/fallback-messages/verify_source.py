"""Verify retained REA assets, immutable regression, and fresh-main binding."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--assets", type=Path, required=True)
parser.add_argument("--main", required=True)
args = parser.parse_args()
evidence = Path(__file__).parent
source = json.loads((evidence / "source.json").read_text())
sha256 = lambda data: hashlib.sha256(data).hexdigest()
assets = {sha256(path.read_bytes()): path.read_bytes() for path in args.assets.glob("*.js")}
for name, span in source["original"].items():
    asset = assets[span["asset_sha256"]]
    start, end = span["utf8_half_open"]
    assert sha256(asset[start:end]) == span["sha256"], name
renderer = assets[source["original"]["Mqo"]["asset_sha256"]].decode()
assert 'children:"Binary file changed"' in renderer
assert 'children:"No changes in this file"' in renderer
assert sha256(Path("src/features/diff/fallbackMessages.test.ts").read_bytes()) == source["test_sha256"]
original_fixture = (evidence / "largeFilePlaceholder.mounted.original.mjs.txt").read_bytes()
current_fixture = Path("tests/diff/largeFilePlaceholder.mounted.test.mjs").read_bytes()
assert current_fixture == original_fixture.replace(b'"Binary file not shown."', b'"Binary file changed"')

def git(*parts):
    return subprocess.check_output(["git", *parts])

main = git("rev-parse", args.main).decode().strip()
paths = [*source["files"], "tests/diff/largeFilePlaceholder.mounted.test.mjs"]
main_files = {path: sha256(git("show", f"{main}:{path}")) for path in paths}
view_path = "src/features/diff/FileDiffView.tsx"
baseline = git("show", f"{main}:{view_path}")
assert Path(view_path).read_bytes() == baseline.replace(
    b'>Binary file not shown.</div>', b'>Binary file changed</div>'
).replace(b'>No content changes in this file.</div>', b'>No changes in this file</div>')
for line in (evidence / "frozen-baseline.sha256").read_text().splitlines():
    expected, path = line.split(maxsplit=1)
    actual = sha256(Path(path).read_bytes()) if path.endswith("fallbackMessages.test.ts") else main_files[path]
    assert actual == expected, path
merge = "4f632b826"
git("merge-base", "--is-ancestor", merge, main)
turn_paths = [
    "src-tauri/src/diff/git.rs",
    "src-tauri/src/diff/turn_large_file_tests.rs",
    "src/features/chat/turnFilePreview.ts",
    "src/features/chat/turnFilePreview.test.ts",
]
turn_hashes = {}
for path in turn_paths:
    content = git("show", f"{main}:{path}")
    assert content == git("show", f"{merge}:{path}"), path
    assert content == Path(path).read_bytes(), path
    turn_hashes[path] = sha256(content)
receipt = {
    "main_sha": main,
    "main_files": main_files,
    "original_asset_and_span_hashes": "PASS",
    "frozen_test_and_baseline_hashes": "PASS",
    "exact_two_string_product_diff": "PASS",
    "exact_one_string_fixture_maintenance": "PASS",
    "pr1143_merge_sha": git("rev-parse", merge).decode().strip(),
    "pr1143_consuming_main_source": turn_hashes,
    "pr1143_main_behavior_package_native": "NOT_RUN; manual-only workflows and no runtime admission",
}
(evidence / "fresh-main-binding.json").write_text(json.dumps(receipt, indent=2) + "\n")
print("PASS: retained source, frozen fixtures, two-string diff, and #1143 consuming-main source at", main)
