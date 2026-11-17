#!/usr/bin/env python3
"""Verify inert retained source and frozen RED/GREEN identities; never evaluate JS."""
import hashlib
import json
from pathlib import Path
import sys
import tarfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
MANIFEST = json.loads((ROOT / 'source.json').read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


for span in MANIFEST['reference_spans']:
    content = (ROOT / span['path']).read_bytes()
    assert digest(content) == span['sha256'], span['path']
    assert len(content) == span['end_exclusive'] - span['start'], span['path']

if len(sys.argv) > 1:
    with tarfile.open(sys.argv[1], 'r:gz') as archive:
        bundles = {name: archive.extractfile(info['archive_member']).read()
                   for name, info in MANIFEST['reference_assets'].items()}
    for name, bundle in bundles.items():
        assert digest(bundle) == MANIFEST['reference_assets'][name]['sha256']
    for span in MANIFEST['reference_spans']:
        assert bundles[span['asset']][span['start']:span['end_exclusive']] == (ROOT / span['path']).read_bytes()

start = (ROOT / 'reference/start-process.txt').read_text()
clear = (ROOT / 'reference/clear-workspace-runs.txt').read_text()
assert start.index('await e().killProcess(s),e().clearWorkspaceRuns(s)') < start.index('"waiting_for_setup"')
for deletion in ('p.delete(R)', 'm.delete(R)', 'v.delete(R)', '_.delete(R)', 'S.delete(R)', 'k.delete(R)', 'I.delete(x)', 'C.delete(x)', 'A.delete(x)'):
    assert deletion in clear, deletion
assert 'for(const R of h)' in clear and 'Np(p,s)' in clear
keys = (ROOT / 'reference/workspace-keys.txt').read_text()
assert 'function Bn(t,e=Iy){return`${t}:${e}`}' in keys
assert 'function Np(t,e){return t.startsWith(`${e}:`)}' in keys
kill = (ROOT / 'reference/kill-process.txt').read_text()
assert 'if(n===void 0)' in kill and 'if(!c||c==="stopped")' in kill
assert 'return{success:!1,error:"No process to stop"}' in kill
getter = (ROOT / 'reference/task-run-id.txt').read_text()
assert 's.processes.get(Bn(t,e))?.runScriptRunId??s.lastRunIds.get(Bn(t,e))' in getter
bindings = (ROOT / 'reference/renderer-state-bindings.txt').read_text()
assert 'Le=q_.useTaskRunId(r?.localId,ke)' in bindings and 'Ve=Le' in bindings
body = (ROOT / 'reference/renderer-output-body.txt').read_text()
assert 'Ve&&r&&ke&&!ft?' in body and 'runId:Ve,taskId:ke' in body
assert 'Ne==="waiting_for_setup"' in body and 'Setting up...' in body
assert (ROOT / 'reference/renderer-import.txt').read_text() == 'gU as q_'
assert (ROOT / 'reference/index-export.txt').read_text() == 'ARt as gU'
for path, expected in MANIFEST['unchanged_current_consumer_sha256'].items():
    assert digest((REPO / path).read_bytes()) == expected, path
panel = (REPO / 'src/components/ScriptsPanel.tsx').read_text()
assert 'const shownStatus = runs.find((r) => r.scriptId === shown);' in panel
assert 'api.runOutput(wsId, shown)' in panel
assert 'shownStatus !== undefined, hasOutput)' in panel
assert 'scripts.runs.output(&workspace_id, &script_id)' in (REPO / 'src-tauri/src/scripts.rs').read_text()

frozen = (REPO / 'crates/scripts/src/runner/tests.rs').read_bytes()
assert digest(frozen) == MANIFEST['frozen_test_sha256']
red = (ROOT / 'red.log').read_text()
green = (ROOT / 'green.log').read_text()
assert '2 passed; 2 failed' in red and '4 passed; 0 failed' in green
for name in MANIFEST['failing_tests']:
    assert f'test runner::tests::{name} ... FAILED' in red
    assert f'test runner::tests::{name} ... ok' in green
for name in MANIFEST['control_tests']:
    assert f'test runner::tests::{name} ... ok' in red
    assert f'test runner::tests::{name} ... ok' in green
print('PASS: exact inert source spans, pre-wait clear ordering, workspace scoping, frozen tests and 2-RED/4-GREEN receipts')
print('Full retained bundle checked' if len(sys.argv) > 1 else 'Stored spans only; pass original archive to verify its bundle binding')
