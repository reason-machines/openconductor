#!/usr/bin/env python3
"""Verify retained REA spans and the unchanged regression; never run reference JS."""
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
frozen = json.loads((HERE / "frozen.json").read_text())
fixture = ROOT / "src/features/terminal/attachmentOwnership.test.mjs"
assert hashlib.sha256(fixture.read_bytes()).hexdigest() == frozen["fixture_sha256"]
assert fixture.stat().st_size == frozen["fixture_bytes"]
print("unchanged five-case fixture: PASS")
for span in frozen["spans_verified"]:
    data = (ROOT / span["retained_path"]).read_bytes()
    assert len(data) == span["bytes"], span["symbol"]
    assert hashlib.sha256(data).hexdigest() == span["sha256"], span["symbol"]
    print(f"retained REA span {span['symbol']}: PASS")

baseline = "8e1c32c3f05efc1562177ea91ad3adccc940c7fe"
source_path = "src/features/terminal/session.ts"
original = subprocess.check_output(["git", "show", f"{baseline}:{source_path}"], cwd=ROOT)
assert hashlib.sha256(original).hexdigest() == "1aa41588140bcfbf7a223aae21470482680a2778ba27a1a269ff667abae13a21"
print(f"fresh-main RED baseline {baseline}: PASS")

# The two theme objects and all other pre-attach production code must stay byte-identical.
current = (ROOT / source_path).read_bytes()
old_interface = b"  opened: boolean;\n  appearance?: MutationObserver;"
new_interface = b"  opened: boolean;\n  /** The current attachment alone owns its host and resize observer. */\n  attachment?: { detach: () => void; observer: ResizeObserver };\n  appearance?: MutationObserver;"
assert current.split(b"export function attachTab(")[0].replace(new_interface, old_interface) == original.split(b"export function attachTab(")[0]
print("selection/startup source preservation: PASS")
print("Complete original app assets: NOT_REHASHED (retained full-asset provenance only)")
