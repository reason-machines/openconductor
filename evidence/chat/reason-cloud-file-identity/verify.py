#!/usr/bin/env python3
"""Verify the frozen RED without executing a compiler, provider or application."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
sha = lambda b: hashlib.sha256(b).hexdigest()
source = json.loads((HERE / 'source.json').read_text())
freeze = json.loads((HERE / 'freeze.json').read_text())
inputs = json.loads((HERE / 'inputs.json').read_text())
observed = json.loads((HERE / 'observations.json').read_text())
for path, expected in freeze.items():
    assert sha((ROOT / path).read_bytes()) == expected, ('frozen bytes changed', path)
for path, expected in source['production_files'].items():
    assert sha((ROOT / path).read_bytes()) == expected, ('baseline production bytes changed', path)
for s in source['rust_source_spans']:
    b = (ROOT / s['path']).read_bytes()[s['start_byte']:s['end_byte']]
    assert sha(b) == s['sha256'], ('extracted Rust source changed', s.get('name'))
    if 'text' in s:
        assert b == s['text'].encode()
        assert s['text'] in (HERE / 'probe.rs').read_text(), ('extracted Rust missing from probe', s['name'])
for capture in observed['executed_source']:
    assert sha(capture['text'].encode()) == capture['sha256']
    assert any(capture['text'] in (ROOT / p).read_text() for p in source['production_files'] if p.endswith(('.ts', '.tsx'))), capture['name']
expected_failures = []
for phase in ['live', 'restored']:
    for c in inputs['cases']:
        for index, target in enumerate(c['paths']):
            if target['place'] == 'cloud' and target['raw'].startswith(inputs['cwd'] + '/'):
                expected_failures.append(f"{phase} file target: {c['id']}#{index} (cloud, {c['mode']})")
tap = (HERE / 'baseline.tap').read_text()
actual_failures = [name.replace('\\#', '#') for name in re.findall(r'^not ok \d+ - (.+)$', tap, re.M)]
assert actual_failures == expected_failures
assert '# tests 31\n' in tap and '# pass 19\n# fail 12\n' in tap
assert '# cancelled 0\n# skipped 0\n' in tap
adjacent = (HERE / 'adjacent.tap').read_text()
assert '# tests 66\n' in adjacent and '# pass 66\n# fail 0\n' in adjacent
assert len(observed['observations']) == 26
wrong_local_opens = [o for o in observed['observations'] if o['declaredTarget']['place'] == 'cloud' and o['effects']]
assert len(wrong_local_opens) == 12
assert all(not o['notifications'] for o in wrong_local_opens)
assert observed['wire_sha256'] == sha((HERE / 'wire.json').read_bytes())
# Validate the artifact scope without assuming new files are already staged.
tracked_changes = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=ROOT, text=True).splitlines()
assert all(p == 'src/reasonCloudFileIdentity.test.ts' or p.startswith('evidence/chat/reason-cloud-file-identity/') for p in tracked_changes), tracked_changes
result = {'checked_main': source['checked_main'], 'frozen_files': len(freeze), 'production_file_identity': len(source['production_files']), 'rust_source_spans': len(source['rust_source_spans']), 'typescript_source_spans': len(observed['executed_source']), 'frozen_baseline': {'pass': 19, 'intended_fail': 12, 'unexpected_fail': 0, 'skipped': 0}, 'adjacent': {'pass': 66, 'fail': 0, 'skipped': 0}, 'actual_click_witnesses': len(observed['observations']), 'production_edits': 0, 'verdict': 'FROZEN_RED_VERIFIED'}
print(json.dumps(result, indent=2))
