"""Check candidate source and pin-maintenance integrity, not runtime behavior."""
from pathlib import Path
import hashlib
import json
import runpy
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def differences(before, after, path=()):
    if isinstance(before, dict) and isinstance(after, dict):
        assert before.keys() == after.keys(), path
        return [delta for key in before for delta in differences(before[key], after[key], (*path, key))]
    return [] if before == after else [path]


initial = json.loads((HERE / "pin-maintenance-v1/execution-source-manifest.before.json").read_text())
intermediate_path = HERE / "pin-maintenance-v2/hidden-whitespace-editing-execution-source-manifest.json.before.json"
intermediate = json.loads(intermediate_path.read_text())
current_path = ROOT / "evidence/diff/hidden-whitespace-editing/execution-source-manifest.json"
current = json.loads(current_path.read_text())
assert differences(initial, intermediate) == [("files", "candidate/src/features/diff/types.ts")]
assert differences(intermediate, current) == [("files", "candidate/src/features/diff/FileDiffView.tsx")]
for name in ["types.ts", "FileDiffView.tsx"]:
    path = f"src/features/diff/{name}"
    assert current["files"][f"candidate/{path}"] == sha(ROOT / path)

old_moved = json.loads((HERE / "pin-maintenance-v2/moved-comment-anchors-source.json.before.json").read_text())
moved = json.loads((ROOT / "evidence/diff/moved-comment-anchors/source.json").read_text())
assert differences(old_moved, moved) == [("product", "src/features/diff/FileDiffView.tsx", "candidate")]
assert moved["product"]["src/features/diff/FileDiffView.tsx"]["candidate"] == sha(ROOT / "src/features/diff/FileDiffView.tsx")

runner = ROOT / "evidence/diff/hidden-whitespace-editing/run-paired.py"
runpy.run_path(str(runner), run_name="pin_check")["source_inputs"]()
for name, hashes in moved["product"].items():
    assert sha(ROOT / name) == hashes["candidate"], name
    raw = subprocess.check_output(["git", "show", f"{moved['baseline']}:{name}"], cwd=ROOT)
    assert hashlib.sha256(raw).hexdigest() == hashes["baseline"], name
assert sha(ROOT / "src/features/diff/movedCommentAnchors.test.ts") == moved["fixture_sha256"]

integration = json.loads((HERE / "candidate-integration.json").read_text())
for name, expected in integration["product_sha256"].items():
    assert sha(ROOT / name) == expected, name
for name, expected in integration["protected_sha256"].items():
    assert sha(ROOT / name) == expected, name
body = (ROOT / "src/features/diff/FileDiffView.tsx").read_text()
assert body.index('if (file.hide_reason === "file_too_large")') < body.index("else if (file.binary)")
assert "File too large to display" in body
print(json.dumps({"result": "CANDIDATE_SOURCE_AND_SCALAR_PIN_CHECKS_PASS", "manifest_scalars": 3,
                  "behavioral_execution": "NOT_PERFORMED_BY_THIS_CHECK"}))
