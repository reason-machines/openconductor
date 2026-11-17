#!/usr/bin/env python3
"""Verify retained source and frozen fixture bytes; never execute reference code."""
import hashlib
import json
from pathlib import Path
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
PRIOR = HERE.parent / "run-start-retention-1f"
FROZEN = "960cf79f44df116b97c0253008ac10a6eaddc46ca17b118b4128a93f48369450"
NRO = "906c982d3300028803e71158d7f70c6fd3c1cc6f55f1ff6e9c6fd645cac34123"


def digest(data):
    return hashlib.sha256(data).hexdigest()


fixture = ROOT / "src/scripts/cancelledWaitIdle.test.ts"
assert digest(fixture.read_bytes()) == FROZEN, "frozen regression changed"
manifest = json.loads((PRIOR / "source.json").read_text())
for span in manifest["reference_spans"]:
    data = (PRIOR / span["path"]).read_bytes()
    assert len(data) == span["end_exclusive"] - span["start"]
    assert digest(data) == span["sha256"], span["path"]
nro = (ROOT / "evidence/terminal/strip-toolbar/reference-nro.txt").read_bytes()
assert len(nro) == 29165 and digest(nro) == NRO
body = nro[7197052 - 7170202:7199367 - 7170202]
assert b'Ve&&r&&ke&&!ft?' in body and b'Ne==="waiting_for_setup"' in body
assert b'Ne==="stopping"' in body and b'`Start ${ve.label}`' in body
if len(sys.argv) > 1:
    archive = Path(sys.argv[1])
    assert digest(archive.read_bytes()) == manifest["original_archive_sha256"]
    with tarfile.open(archive, "r:gz") as handle:
        assets = {}
        for name, asset in manifest["reference_assets"].items():
            data = handle.extractfile(asset["archive_member"]).read()
            assert digest(data) == asset["sha256"], name
            assets[name] = data
        for span in manifest["reference_spans"]:
            assert assets[span["asset"]][span["start"]:span["end_exclusive"]] == (PRIOR / span["path"]).read_bytes()
        assert assets["renderApp-D_fmY7hW.js"][7170202:7199367] == nro
    print("PASS: original archive, both complete assets, nine bound spans and complete renderer body")
else:
    print("PASS: retained nine spans and complete renderer body; original archive not supplied")
print(f"PASS: frozen five-case regression {FROZEN}")
