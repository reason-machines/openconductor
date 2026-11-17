#!/usr/bin/env python3
"""Verify retained Hji bytes without executing app-extracted source."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
packet = Path(__file__).resolve().parent
proof = json.loads((packet / "reference-proof.json").read_text())
span = (root / "evidence/dialogs/workspace-launch-close/reference/Hji.txt").read_bytes()
assert hashlib.sha256(span).hexdigest() == proof["span_sha256"]
start = 9770840
for name, check in proof["checks"].items():
    lo, hi = check["utf8_half_open"]
    assert span[lo - start:hi - start] == check["literal"].encode(), name
    print(f"PASS {name}: [{lo}, {hi})")
print("PASS retained Hji span SHA256 and all seven byte-range checks")
print("QUALIFIED retained source only; no fresh REA or native interaction")
