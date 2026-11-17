#!/usr/bin/env python3
"""Verify inert source receipts and unchanged regression/scenario bytes."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[4]
evidence = Path(__file__).resolve().parent
packet = json.loads((evidence / "source.json").read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
for receipt in packet["reference"]["receipts"]:
    assert sha(receipt["source"].encode()) == receipt["sha256"], receipt["label"]
fixture = root / "src/features/chat/modelPickerFuzzySearch.test.ts"
assert sha(fixture.read_bytes()) == packet["frozen_test_sha256"]
baseline = packet["baseline_commit"]
original = subprocess.check_output(["git", "show", f"{baseline}:src/features/chat/ModelPicker.tsx"], cwd=root)
assert sha(original) == packet["baseline_picker_sha256"]
package = json.loads((root / "package.json").read_text())
assert package["dependencies"]["fuzzysort"] == packet["dependency"]["version"]
for suffix, key in [
    ("DisabledResults", "name"), ("LoadoutClose", "name"),
    ("QualifiedModelSearch", "specifier"), ("SearchAgentLabel", "specifier"),
    ("SearchInputAttributes", "name"), ("UnsupportedEffort", "specifier"),
]:
    path = f"src/features/chat/modelPicker{suffix}.test.ts"
    before = subprocess.check_output(["git", "show", f"{baseline}:{path}"], cwd=root).decode()
    current = (root / path).read_text()
    wire = f'      if ({key} === "fuzzysort") return {{ default: dependencies({key}) }};\n'
    assert current.count(wire) == 1
    assert current.replace(wire, "") == before, path
path = "src/features/chat/modelPickerAgentSearch.test.ts"
before = subprocess.check_output(["git", "show", f"{baseline}:{path}"], cwd=root).decode()
current = (root / path).read_text()
current = current.replace('import fuzzysort from "fuzzysort";\n', "")
current = current.replace('"AGENT_LABEL", "fuzzysort",', '"AGENT_LABEL",')
current = current.replace("AGENT_LABEL, fuzzysort);", "AGENT_LABEL);")
assert current == before, path
path = "src/features/chat/chatModelFriendlyLabel.test.ts"
before = subprocess.check_output(["git", "show", f"{baseline}:{path}"], cwd=root).decode()
current = (root / path).read_text()
wire = '        if (specifier === "fuzzysort") return { default: dependencies(specifier) };\n'
assert current.count(wire) == 1
assert current.replace(wire, "") == before, path
print(f"PASS: {len(packet['reference']['receipts'])} retained span hashes, frozen regression, baseline and dependency; eight existing test scenarios/assertions unchanged")
