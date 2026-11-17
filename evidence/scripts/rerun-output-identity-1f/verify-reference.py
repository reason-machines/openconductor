#!/usr/bin/env python3
"""Verify retained run-output identity evidence as inert bytes, never evaluate it."""
import gzip
import hashlib
import json
from pathlib import Path
import sys
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
manifest = json.loads((HERE / "source.json").read_text())
sha = lambda b: hashlib.sha256(b).hexdigest()
assets = {}
if len(sys.argv) > 1:
    archive = Path(sys.argv[1])
    assert sha(archive.read_bytes()) == manifest["archive_sha256"], "original archive identity"
    with tarfile.open(archive) as tar:
        for name, identity in manifest["assets"].items():
            asset = tar.extractfile(identity["archive_member"])
            assert asset is not None, name
            assets[name] = asset.read()
            assert sha(assets[name]) == identity["sha256"], name

retained = {}
for span in manifest["spans"]:
    body = (HERE / span["path"]).read_bytes()
    assert sha(body) == span["sha256"], span["path"]
    assert len(body) == span["end_exclusive"] - span["start"], span["path"]
    if assets:
        assert body == assets[span["asset"]][span["start"]:span["end_exclusive"]], span["path"]
    retained[Path(span["path"]).name] = body.decode()

for name, receipt in manifest["log_receipts"].items():
    compressed = (HERE / receipt["raw_path"]).read_bytes()
    assert sha(compressed) == receipt["compressed_sha256"], name
    assert sha(gzip.decompress(compressed)) == receipt["raw_sha256"], name
    assert sha((HERE / name).read_bytes()) == receipt["display_sha256"], name

assert sha((ROOT / manifest["fixture"]).read_bytes()) == manifest["fixture_sha256"], "frozen fixture"
assert "?.runScriptRunId??s.lastRunIds.get(Bn(t,e))" in retained["task-run-id.txt"]
assert retained["index-export.txt"] == "ARt as gU"
assert retained["renderer-import.txt"] == "gU as q_"
assert "Le=q_.useTaskRunId(r?.localId,ke)" in retained["renderer-state-bindings.txt"]
assert "Ve=Le" in retained["renderer-state-bindings.txt"]
assert 'p.jsx(OJs,{panelKind:"right",runId:Ve,taskId:ke,localWorkspaceId:r.localId,sessionId:c},Ve)' in retained["renderer-output-complete.txt"]
surface = retained["output-surface-OJs.txt"]
assert surface.startswith("function OJs(t){") and surface.endswith("w}")
assert "d=vSe(i)" in surface and "surfaceId:h" in surface and "runId:i" in surface and "const _=xEi(g)" in surface
assert retained["identity-export.txt"] == "EI as g6"
assert retained["identity-import.txt"] == "g6 as vSe"
assert retained["identity-helper-EI.txt"] == "function EI(t){return`run:${t}`}"
effect = retained["surface-effect-xEi.txt"]
assert effect.startswith("function xEi(t){") and effect.endswith("B}")
assert 'v=t.kind==="run"?t.runId:void 0' in effect
assert 'R({kind:"run",panelKind:t.panelKind,runId:v??""' in effect
assert 'D=[t.kind,t.panelKind,t.stackOrder,t.surfaceId,t.localWorkspaceId,a,c,u,d,h,m,g,_,v,x,w,R]' in effect
assert "$.useEffect(O,D)" in effect and "R=AO(AJs)" in effect
assert retained["surface-selector-AJs.txt"] == "function AJs(t){return t.upsertSurfaceConfig}"
red = (HERE / "red.log").read_text()
green = (HERE / "green.log").read_text()
assert "# pass 5\n# fail 2\n" in red and "the replacement must not borrow the previous run's transcript" in red
assert "# pass 7\n# fail 0\n" in green and "# skipped 0\n" in green
qualification = json.loads((HERE / "qualification.json").read_text())
assert qualification["fresh_main"] == "a0ed68ce45257c6a4eecc3b0e09bf974fef8ccda"
assert qualification["fixture_sha256"] == manifest["fixture_sha256"]
assert sha((ROOT / qualification["product"]).read_bytes()) == qualification["treatment_product_sha256"]
fresh = {}
for name, receipt in qualification["log_receipts"].items():
    compressed = (HERE / receipt["raw_path"]).read_bytes()
    assert sha(compressed) == receipt["compressed_sha256"], name
    raw = gzip.decompress(compressed)
    assert sha(raw) == receipt["raw_sha256"], name
    assert sha((HERE / receipt["display_path"]).read_bytes()) == receipt["display_sha256"], name
    fresh[name] = raw.decode()
assert "# pass 5\n# fail 2\n" in fresh["red"]
assert "# pass 7\n# fail 0\n" in fresh["green"] and "# skipped 0\n" in fresh["green"]
assert "# pass 64\n# fail 0\n" in fresh["adjacent"] and "# skipped 0\n" in fresh["adjacent"]
assert "built in" in fresh["build"]
print("PASS: fresh-main frozen RED/GREEN, 64 adjacent tests, integrated build and six command receipt hashes")
print(f"PASS: {len(retained)} retained spans, run-ID caller/output/remount/surface/effect join, frozen fixture, baseline/treatment")
print("PASS: original archive and both complete asset bindings" if assets else "PARTIAL: original archive not supplied; retained-byte verification only")
print("NOT RUN: browser/native/process/PTY/provider/package acceptance; native serializer/kill ABI remain unresolved")
