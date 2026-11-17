#!/usr/bin/env python3
"""Verify inert source spans, frozen fixtures, exact inputs and scoped treatment."""
import gzip
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
checks = []

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check(name, value):
    assert value, name
    checks.append(name)

reference = json.loads((HERE / 'reference.json').read_text())
for span in reference['spans']:
    data = span['text'].encode()
    start, end = span['utf8_half_open']
    name = span['asset'] + ':' + span['label']
    check(name, len(data) == span['bytes'] == end - start and hashlib.sha256(data).hexdigest() == span['sha256'])
closure = json.loads((HERE / 'context-closure.json').read_text())
check('complete AST parsed without diagnostics', closure['parse_diagnostics'] == 0)
check('only two context binding uses', len(closure['non_property_identifier_occurrences']) == 2)
for name, expected in {
    'unmount.test.cjs': '9172057e530f7d7c6162554f62a73a0340664ea4887312d3c0d8099efc041746',
    'ownership.test.cjs': 'ba148ebc90b158329252e58408e3500895059180f5070454b1804c86b1070658',
}.items():
    check('unchanged frozen fixture ' + name, sha(HERE / name) == sha(HERE / 'frozen' / name) == expected)
for name, expected in {
    'baseline.tap.gz': (3, 2, 1),
    'ownership-baseline.tap.gz': (4, 4, 0),
    'lifecycle-baseline.tap.gz': (4, 3, 1),
    'treatment-initial.tap.gz': (11, 11, 0),
    'adjacent-treatment.tap.gz': (106, 106, 0),
    'owning-contracts-treatment.tap.gz': (5, 5, 0),
}.items():
    tap = gzip.decompress((HERE / name).read_bytes()).decode()
    check('recorded check totals ' + name, all(f'# {key} {count}\n' in tap for key, count in zip(['tests', 'pass', 'fail'], expected)) and '# skipped 0\n' in tap and '# cancelled 0\n' in tap)
state = json.loads((HERE / 'source-state.json').read_text())
for name, expected in state['treatment'].items():
    check('exact treatment ' + name, sha(ROOT / name) == expected)
for name, expected in state['unchanged'].items():
    check('unchanged owning/control ' + name, sha(ROOT / name) == expected)
for name in ['owner.ts', 'producer.ts', 'RepoMiscRows.tsx']:
    key = next(key for key in reference['snapshots'] if key.endswith('/' + name))
    check('frozen baseline owner ' + name, sha(HERE / 'frozen' / name) == reference['snapshots'][key]['sha256'])
# These guards do not substitute for the actual-row and ownership callback tests.
row = (ROOT / 'src/settings/rows/RepoMiscRows.tsx').read_text()
check('Preview URL alone opts into discard', row.count('"discard");') == 1 and '500, `${repoPath}:preview`, "discard");' in row)
check('Files-to-copy keeps default policy', '1000, `${repoPath}:files`);' in row)
producer = (ROOT / 'src/lib/persistence/producer.ts').read_text()
check('default/true policy preserved', 'unmountPolicy: boolean | "discard" = false' in producer and 'if (unmountPolicy === true) edit.flush();' in producer and 'else edit.abandon();' in producer)
print(json.dumps({'result': 'PASS', 'checks': len(checks), 'baseline_main': state['baseline_main'], 'not_verified': ['physical UI timing', 'Tauri transport', 'disk persistence', 'installed identity', 'package inclusion']}, indent=2))
