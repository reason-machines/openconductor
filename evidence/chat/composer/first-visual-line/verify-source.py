import argparse
import gzip
import hashlib
import json
import subprocess
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


parser = argparse.ArgumentParser()
parser.add_argument("--renderer", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[4]
folder = Path(__file__).resolve().parent
manifest_bytes = (folder / "source.json").read_bytes()
manifest = json.loads(manifest_bytes)
setup = json.loads((folder / "setup-v2.json").read_text())
assert digest(manifest_bytes) == setup["original_manifest"]["sha256"]
original = args.renderer.read_bytes()
assert len(original) == manifest["original"]["bytes"]
assert digest(original) == manifest["original"]["sha256"]
spans = json.loads((folder / manifest["reference_spans"]).read_text())
for span in spans:
    start, end = span["utf8_bytes_half_open"]
    data = original[start:end]
    assert data.decode() == span["compiled_javascript"]
    assert digest(data) == span["sha256_utf8"]
for pin in manifest["main_source_pins"]:
    data = subprocess.check_output(
        ["git", "-c", "gc.auto=0", "show", f'{manifest["baseline"]}:{pin["path"]}'],
        cwd=root,
    )
    assert len(data) == pin["bytes"] and digest(data) == pin["sha256"], pin["path"]
for pin in manifest["frozen_main_fixtures"] + [setup["fixture"], setup["fixture_setup_patch"], setup["preserved_v1_fixture"], *setup["unchanged_candidate_modules"], *setup["preserved_v1_results"]]:
    data = (root / pin["path"]).read_bytes()
    assert len(data) == pin["bytes"] and digest(data) == pin["sha256"], pin["path"]
for pin in setup["preserved_v1_results"]:
    if "gzip_uncompressed" in pin:
        data = gzip.decompress((root / pin["path"]).read_bytes())
        assert len(data) == pin["gzip_uncompressed"]["bytes"]
        assert digest(data) == pin["gzip_uncompressed"]["sha256"]
assert setup["preserved_v1_fixture"]["sha256"] == manifest["fixture"]["sha256"]
assert not setup["preserved_v1_fixture"]["path"].endswith(".test.ts")
v1 = (root / setup["preserved_v1_fixture"]["path"]).read_text()
v2 = (root / setup["fixture"]["path"]).read_text()
marker = 'test("nonzero caret on the first visual line focuses the last queue row"'
v1_tail = v1[v1.index(marker):]
v2_tail = v2[v2.index(marker):]
for edit in setup["setup_only_test_tail_edits"]:
    assert v2_tail.count(edit["v2"]) == 1
    v2_tail = v2_tail.replace(edit["v2"], edit["v1"], 1)
assert v1_tail == v2_tail, "existing twenty-case assertions or controls changed"
key_start = "    key(fields: Partial<KeyFields> = {}) {"
key_end = "    close() {"
assert v1[v1.index(key_start):v1.index(key_end)] == v2[v2.index(key_start):v2.index(key_end)]
for pin in manifest["excluded_unmerged_fixture"]:
    assert not (root / pin["path"]).exists(), pin["path"]
print(json.dumps({
    "renderer": "passed", "retained_spans": len(spans),
    "baseline_inputs": len(manifest["main_source_pins"]),
    "frozen_main_fixtures": len(manifest["frozen_main_fixtures"]),
    "preserved_v1_fixture": "passed", "active_v2_fixture_identity": "passed",
    "unchanged_twenty_case_assertions_and_key_state_checks": "passed",
    "unchanged_candidate_modules": len(setup["unchanged_candidate_modules"]),
    "preserved_v1_results": len(setup["preserved_v1_results"]),
    "application_runtime": "not exercised",
}))
