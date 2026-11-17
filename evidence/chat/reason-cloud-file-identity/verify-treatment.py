#!/usr/bin/env python3
"""Verify frozen inputs, retained RED and current GREEN receipts, without a runtime."""
from pathlib import Path
import gzip
import hashlib
import json
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sha = lambda value: hashlib.sha256(value).hexdigest()
BASE = '860041bd42aca394da3b8bdbf9d7fa1ca7597836'
PRODUCTION = {
    'src/features/chat/conductorTools.ts',
    'src/features/chat/Transcript.tsx',
    'src/components/WorkspaceView.tsx',
}
source = json.loads((HERE / 'source.json').read_text())
for path, digest in json.loads((HERE / 'freeze.json').read_text()).items():
    assert sha((ROOT / path).read_bytes()) == digest, ('frozen bytes changed', path)
for path, digest in source['production_files'].items():
    baseline = subprocess.check_output(['git', 'show', f'{BASE}:{path}'], cwd=ROOT)
    assert sha(baseline) == digest, ('fresh-main identity changed', path)
    if path not in PRODUCTION:
        assert sha((ROOT / path).read_bytes()) == digest, ('unowned production changed', path)
for span in source['rust_source_spans']:
    text = (ROOT / span['path']).read_bytes()[span['start_byte']:span['end_byte']]
    assert sha(text) == span['sha256'], span.get('name')

def totals(name, tests, passed, failed):
    path = HERE / name
    text = path.read_text() if path.exists() else gzip.decompress((HERE / (name + '.gz')).read_bytes()).decode()
    for key, value in [('tests', tests), ('pass', passed), ('fail', failed), ('cancelled', 0), ('skipped', 0)]:
        assert f'# {key} {value}\n' in text, (name, key)
    return text

red = totals('baseline.tap', 31, 19, 12)
expected = []
inputs = json.loads((HERE / 'inputs.json').read_text())
for phase in ['live', 'restored']:
    for case in inputs['cases']:
        for index, path in enumerate(case['paths']):
            if path['place'] == 'cloud' and path['raw'].startswith(inputs['cwd'] + '/'):
                expected.append(f"{phase} file target: {case['id']}#{index} (cloud, {case['mode']})")
assert [n.replace('\\#', '#') for n in re.findall(r'^not ok \d+ - (.+)$', red, re.M)] == expected
for name, args in {
    'treatment.tap': (31, 31, 0),
    'controls-baseline.tap': (17, 7, 10),
    'controls-final.tap': (18, 18, 0),
    'adjacent-treatment.tap': (66, 66, 0),
    'primary-candidate-baseline.tap': (1, 0, 1),
}.items():
    totals(name, *args)
before = json.loads((HERE / 'baseline-observations.json').read_text())
after = json.loads((HERE / 'treatment-observations.json').read_text())
assert (HERE / 'observations.json').read_bytes() == (HERE / 'baseline-observations.json').read_bytes()
assert before['wire_sha256'] == after['wire_sha256'] == sha((HERE / 'wire.json').read_bytes())
assert len(before['observations']) == len(after['observations']) == 26
assert len([o for o in before['observations'] if o['declaredTarget']['place'] == 'cloud' and o['effects']]) == 12
for observation in after['observations']:
    if observation['declaredTarget']['place'] == 'cloud':
        assert not observation['effects'], observation
        assert any('cloud' in n['message'] for n in observation['notifications']), observation
for capture in after['executed_source']:
    assert sha(capture['text'].encode()) == capture['sha256']
    assert any(capture['text'] in (ROOT / path).read_text() for path in source['production_files'] if path.endswith(('.ts', '.tsx'))), capture['name']
# No other production change is included; added artifacts are under one prefix.
changes = subprocess.check_output(['git', 'diff', '--name-only', BASE], cwd=ROOT, text=True).splitlines()
assert all(path in PRODUCTION or path == 'src/reasonCloudFileIdentity.test.ts' or path.startswith('evidence/chat/reason-cloud-file-identity/') for path in changes), changes
result = {
    'checked_main': BASE,
    'frozen_files': 6,
    'unchanged_rust_source_spans': len(source['rust_source_spans']),
    'retained_baseline': {'pass': 19, 'intended_fail': 12},
    'frozen_treatment': {'pass': 31, 'fail': 0},
    'supplemental_baseline': {'pass': 7, 'intended_fail': 10},
    'supplemental_final': {'pass': 18, 'fail': 0},
    'additional_primary_control': 'first candidate RED 0/1; final GREEN 1/1; not part of original 17',
    'adjacent': {'pass': 66, 'fail': 0},
    'click_witnesses_per_phase': 26,
    'typescript_treatment_spans': len(after['executed_source']),
    'production_files': {path: sha((ROOT / path).read_bytes()) for path in sorted(PRODUCTION)},
    'supplemental_tests': {name: sha((HERE / name).read_bytes()) for name in ['controls.test.ts', 'primary.test.ts']},
    'verdict': 'FROZEN_RED_TO_GREEN_VERIFIED',
}
print(json.dumps(result, indent=2))
