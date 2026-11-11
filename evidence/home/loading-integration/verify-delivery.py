#!/usr/bin/env python3
"""Verify the delivered loading correction against the serialized execution receipt."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
BASE = "b6e7473d17462ce09948437b4239fb0a31e8d37f"


def sha(data):
    return hashlib.sha256(data).hexdigest()


receipt_bytes = (OUT / "terminal-receipt.json").read_bytes()
assert sha(receipt_bytes) == "ac8b3c1619dbc69036b45505b79b5132e19102109dc153d5d39a23837d115dc1"
receipt = json.loads(receipt_bytes)
pins = receipt["preflight"]["source_pins"]
assert len(pins) == 18
for pin in pins:
    raw = subprocess.check_output(["git", "show", f"{BASE}:{pin['path']}"], cwd=ROOT)
    assert sha(raw) == pin["sha256"], pin["path"]

fixture = receipt["preflight"]["fixture"]
raw = (ROOT / fixture["intended_path"]).read_bytes()
assert len(raw) == fixture["bytes"] and sha(raw) == fixture["sha256"]
for path, scope in receipt["preflight"]["scope"].items():
    assert sha((ROOT / path).read_bytes()) == scope["candidate_sha256"], path

manifest = json.loads((OUT / "manifest.json").read_bytes())
assert len(manifest["reference_spans"]) == 33
for span in manifest["reference_spans"]:
    raw = (ROOT / span["path"]).read_bytes()
    assert len(raw) == span["bytes"] and sha(raw) == span["sha256"], span["path"]

red = receipt["phases"]["home-loading-red"]
green = receipt["phases"]["home-loading-green"]
assert red["receipt"]["process_exit"] == 1 and "# pass 3\n# fail 1\n" in red["stdout"]
assert "pending workspace data must render Loading workspaces" in red["stdout"]
assert green["receipt"]["process_exit"] == 0 and "# pass 4\n# fail 0\n" in green["stdout"]
assert receipt["preflight"]["fixture_identical_both_trees"] is True
record = {
    "producer": "Conductor Rebuild",
    "delivery_base": BASE,
    "executed_baseline": receipt["preflight"]["qualified_baseline"],
    "18_delivery_base_inputs_identical_to_executed_baseline": True,
    "3_delivered_product_files_identical_to_executed_candidate": True,
    "fixture_sha256": fixture["sha256"],
    "reference_spans_verified": 33,
    "source_reconciliation": "passed",
    "serialized_regression": "expected baseline failure (3 pass, 1 fail), candidate passed (4 pass)",
    "local_runtime_repeated": False,
    "full_app_typecheck_and_build": "not run locally; exact-head hosted CI required",
    "reference_mounted_native_visual": "not run",
}
(OUT / "delivery-reconciliation.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps(record, indent=2))
