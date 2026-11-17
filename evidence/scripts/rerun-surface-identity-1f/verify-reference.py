#!/usr/bin/env python3
"""Verify retained source as inert bytes; never execute vendor JavaScript."""
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
    assert sha(archive.read_bytes()) == manifest["archive_sha256"], "original archive"
    with tarfile.open(archive) as tar:
        for name, identity in manifest["assets"].items():
            member = tar.extractfile(identity["archive_member"])
            assert member is not None, name
            assets[name] = member.read()
            assert sha(assets[name]) == identity["sha256"], name

retained = {}
for span in manifest["spans"]:
    body = (HERE / span["path"]).read_bytes()
    assert sha(body) == span["sha256"], span["path"]
    assert len(body) == span["end_exclusive"] - span["start"], span["path"]
    if assets:
        assert body == assets[span["asset"]][span["start"]:span["end_exclusive"]], span["path"]
    assert Path(span["path"]).name not in retained, "unique retained paths"
    retained[Path(span["path"]).name] = body.decode()

assert sha((ROOT / manifest["fixture"]).read_bytes()) == manifest["fixture_sha256"], "frozen fixture"
assert "?.runScriptRunId??s.lastRunIds.get(Bn(t,e))" in retained["task-run-id.txt"]
assert retained["index-export.txt"] == "ARt as gU" and retained["renderer-import.txt"] == "gU as q_"
assert "Le=q_.useTaskRunId(r?.localId,ke)" in retained["renderer-state-bindings.txt"] and "Ve=Le" in retained["renderer-state-bindings.txt"]
assert 'p.jsx(OJs,{panelKind:"right",runId:Ve,taskId:ke,localWorkspaceId:r.localId,sessionId:c},Ve)' in retained["renderer-output-complete.txt"]
assert "d=vSe(i)" in retained["output-surface-OJs.txt"] and "const _=xEi(g)" in retained["output-surface-OJs.txt"]
assert retained["identity-export.txt"] == "EI as g6" and retained["identity-import.txt"] == "g6 as vSe"
assert retained["identity-helper-EI.txt"] == 'function EI(t){return`run:${t}`}'
assert retained["surface-store-export.txt"] == "K2 as g5" and retained["surface-store-import.txt"] == "g5 as AO"
assert retained["surface-selector-AJs.txt"] == "function AJs(t){return t.upsertSurfaceConfig}"
assert "R=AO(AJs)" in retained["surface-effect-xEi.txt"]
assert 'R({kind:"run",panelKind:t.panelKind,runId:v??""' in retained["surface-effect-xEi.txt"]
store = retained["surface-store-K2.txt"]
assert "upsertSurfaceConfig:e=>" in store and "r.set(e.surfaceId,e)" in store
assert "surfaceConfigs:r,surfacePlacements:i" in store and "removeSurface:e=>" in store
assert "t.get(n)!==s&&K2.getState().removeSurface(EI(s))" in retained["replace-removes-surface.txt"]
assert retained["run-identity-store-subscription.txt"] == "js.subscribe((t,e)=>{d$t(t.lastRunIds,e.lastRunIds)})"
assert "surfaceConfigs:t.surfaceConfigs" in retained["uSa.txt"]
assert "AO(ed(uSa))" in retained["aSa.txt"] and "children:a.map(lSa)" in retained["aSa.txt"]
assert 'p.jsx(rSa,{config:t.config,isVisible:t.isVisible,shouldFocus:t.shouldFocus})},t.config.surfaceId)' in retained["lSa.txt"]
assert 'h=n.surfaceId' in retained["rSa.txt"] and 'terminalKey:h' in retained["rSa.txt"]
assert 'p.jsx(iSa,{focusTerminal:E,isReady:k,onAddToChat:X,sessionId:n.sessionId,selectedText:u,terminalRef:I})' in retained["rSa.txt"]
assert "const d=dzt(u)" in retained["iSa.txt"] and "isOpen:d.isSearchOpen" in retained["iSa.txt"]
assert '[i,r]=$.useState(!1),[o,a]=$.useState("")' in retained["dzt.txt"]
assert "searchTerm:o,setSearchTerm:a" in retained["dzt.txt"]
for name, receipt in manifest["qualification_log_hashes"].items():
    body = (HERE / (name + ".log.gz")).read_bytes()
    assert sha(body) == receipt["gzip_sha256"], name
    assert sha(gzip.decompress(body)) == receipt["raw_sha256"], name
red = gzip.decompress((HERE / "red.log.gz").read_bytes()).decode()
assert "# pass 5\n# fail 2\n" in red and "# skipped 0\n" in red
assert red.count("a replacement run must not inherit the predecessor's open Find bar") == 2
if (HERE / "green.log.gz").exists():
    green = gzip.decompress((HERE / "green.log.gz").read_bytes()).decode()
    assert "# pass 7\n# fail 0\n" in green and "# skipped 0\n" in green
if (HERE / "publication.json").exists():
    publication = json.loads((HERE / "publication.json").read_text())
    assert sha((ROOT / manifest["product"]).read_bytes()) == publication["treatment_product_sha256"]
    for name, receipt in publication["log_hashes"].items():
        body = (HERE / (name + ".log.gz")).read_bytes()
        assert sha(body) == receipt["gzip_sha256"], name
        assert sha(gzip.decompress(body)) == receipt["raw_sha256"], name
    fresh_red = gzip.decompress((HERE / "fresh-red.log.gz").read_bytes()).decode()
    fresh_green = gzip.decompress((HERE / "fresh-green.log.gz").read_bytes()).decode()
    assert "# pass 5\n# fail 2\n" in fresh_red and "# skipped 0\n" in fresh_red
    assert "# pass 7\n# fail 0\n" in fresh_green and "# skipped 0\n" in fresh_green
    affected = gzip.decompress((HERE / "integrated-affected.log.gz").read_bytes()).decode()
    assert "# pass 91\n# fail 0\n" in affected and "# skipped 0\n" in affected
    initial_adjacent = gzip.decompress((HERE / "fresh-adjacent-before-migration.log.gz").read_bytes()).decode()
    assert "# pass 82\n# fail 2\n" in initial_adjacent and "# skipped 0\n" in initial_adjacent
    assert "built in" in gzip.decompress((HERE / "integrated-build.log.gz").read_bytes()).decode()
    assert publication["log_hashes"]["integrated-build"]["exit_code"] == 0
    assert publication["log_hashes"]["integrated-typecheck"]["exit_code"] == 0
    assert publication["log_hashes"]["fresh-build-first-timeout"]["exit_code"] is None
    cases = {
        "src/scripts/runningInput.test.ts": ("input follows running/stopping/rerun without remounting or reusing the old generation", "input preserves the same run through stopping and isolates a replacement generation"),
        "src/scripts/runningResize.test.ts": ("same mounted screen disables resize on stop and sends measured geometry to a replacement generation", "same-run stop preserves its screen and replacement geometry targets only the new generation"),
    }
    for path, receipt in publication["test_migration_originals"].items():
        archive = (HERE / receipt["archive"]).read_bytes()
        assert sha(archive) == receipt["gzip_sha256"], path
        original = gzip.decompress(archive)
        current = (ROOT / path).read_bytes()
        assert sha(original) == receipt["raw_sha256"] and sha(current) == receipt["current_sha256"], path
        def outside_case(body, name):
            prefix, case = body.decode().split(f'test("{name}",', 1)
            _, suffix = case.split('\n\ntest(', 1)
            return prefix, suffix
        assert outside_case(original, cases[path][0]) == outside_case(current, cases[path][1]), "only leased test case changed: " + path
    print("PASS: fresh-main frozen baseline/treatment, 91 affected tests, two-case-only migrations and publication receipt hashes")
print(f"PASS: {len(retained)} exact spans, full run/surface/store/consumer/local-Find join, frozen actual mounted RED")
print("PASS: original archive and both complete assets" if assets else "PARTIAL: retained byte checks only; original archive not supplied")
print("NOT RUN: browser/native/process/PTY/provider/package; no stale xterm-selection claim")
