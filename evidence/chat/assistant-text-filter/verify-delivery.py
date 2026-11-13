"""Verify retained V3 execution evidence and current candidate bytes; never run tests."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
ACTUAL = EVIDENCE / "actual-v3"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_text())


def git_bytes(ref, path):
    return subprocess.check_output(["git", "show", f"{ref}:{path}"], cwd=ROOT)


manifest = read_json(ACTUAL / "MANIFEST.json")
for entry in manifest["files"]:
    data = (ACTUAL / entry["path"]).read_bytes()
    assert len(data) == entry["bytes"] and sha(data) == entry["sha256"], entry["path"]
assert len(manifest["files"]) == 12
qualification = read_json(EVIDENCE / "qualification-v3.json")
assert qualification == read_json(ACTUAL / "qualification-v3.json")
assert read_json(EVIDENCE / "execution-request-v3.json") == read_json(ACTUAL / "execution-request-v3.json")

receipts = {}
inventories = {}
for phase, expected in (("red", (109, 92, 17)), ("green", (109, 109, 0))):
    receipt = read_json(ACTUAL / f"{phase}-receipt.json")
    receipts[phase] = receipt
    tap = (ACTUAL / f"{phase}.tap").read_bytes()
    assert sha(tap) == receipt["tap_sha256"]
    totals = {key: int(value) for key, value in re.findall(
        r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$", tap.decode(), re.M)}
    assert totals == receipt["summary"]
    assert tuple(totals[key] for key in ("tests", "pass", "fail")) == expected
    assert all(totals[key] == 0 for key in ("cancelled", "skipped", "todo"))
    assert receipt["postrun_pins_unchanged"] and receipt["tracked_tree_unchanged"]
    inventory = read_json(ACTUAL / f"{phase}-source-inventory.json")
    inventories[phase] = inventory
    assert len(inventory) == receipt["source_files"] == 954
    assert sha((ACTUAL / f"{phase}-source-inventory.json").read_bytes()) == receipt["source_inventory_sha256"]

red, green = receipts["red"], receipts["green"]
assert red["command"] == green["command"]
assert red["overlays"] == green["overlays"] and len(red["overlays"]) == 8
for key in ("resolver_pins", "physical_entries", "node_binary"):
    assert red[key] == green[key]
assert len(red["physical_entries"]) == 17
changed = [path for path in inventories["red"] if inventories["red"][path] != inventories["green"][path]]
assert changed == ["src/features/chat/Transcript.tsx"]
qualified_red = read_json(ACTUAL / "red-qualified.json")
assert qualified_red["qualified"] and len(qualified_red["failures"]) == 17
assert all(item["error_code"] == "ERR_ASSERTION" for item in qualified_red["failures"])
release = read_json(ACTUAL / "release.json")
assert release["released"] and release["active_node_processes_with_target_cwd"] == []

for entry in qualification["files"]:
    path = entry["path"]
    assert sha((ROOT / path).read_bytes()) == entry["candidate_sha256"], path
    assert inventories["green"][path]["sha256"] == entry["candidate_sha256"], path
    if "baseline_sha256" in entry:
        assert sha(git_bytes(qualification["baseline_main"], path)) == entry["baseline_sha256"], path

reference = read_json(EVIDENCE / "source-v1/source-packet.json")
for entry in reference["spans"]:
    data = (EVIDENCE / "source-v1" / entry["path"]).read_bytes()
    assert sha(data) == entry["sha256"] and len(data) == entry["bytes"]

print(json.dumps({
    "author": "Conductor Rebuild",
    "status": "PASS_STATIC_IDENTITY_AND_RETAINED_RECEIPTS",
    "current_main": subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=ROOT, text=True).strip(),
    "source_checkpoint": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
    "manifest_hashes": 12,
    "candidate_source_pins": len(qualification["files"]),
    "reference_spans": len(reference["spans"]),
    "red": red["summary"],
    "green": green["summary"],
    "only_execution_delta": changed,
    "runtime_replayed": False,
    "gaps": release["gaps"],
}, indent=2))
