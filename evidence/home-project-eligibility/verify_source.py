import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--renderer', type=Path)
parser.add_argument('--index', type=Path)
args = parser.parse_args()
root = Path(__file__).parent
record = json.loads((root / 'reference.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
assets = {}
for name in ['renderer', 'index']:
    path = getattr(args, name)
    if path is not None:
        data = path.read_bytes()
        expected = record['reference']['assets'][name]
        assert len(data) == expected['bytes'], name
        assert sha(data) == expected['sha256'], name
        assets[name] = data
for span in record['spans']:
    data = span['source'].encode()
    start, end = span['utf8_half_open']
    assert len(data) == span['bytes'] == end - start, span['name']
    assert sha(data) == span['sha256'], span['name']
    if span['asset'] in assets:
        assert assets[span['asset']][start:end] == data, span['name']
for pin in record['baseline_pins']:
    data = subprocess.check_output(['git', 'show', f"{record['main']}:{pin['path']}"])
    assert len(data) == pin['bytes'], pin['path']
    assert sha(data) == pin['sha256'], pin['path']
for check in record['anchor_checks']:
    assert sha(check['needle'].encode()) == check['sha256'], check['name']
fixture = Path('src/components/homeProjectEligibility.test.ts').read_bytes()
assert fixture == (root / 'fixture-v1.ts.txt').read_bytes()
for line in (root / 'fixture.sha256').read_text().splitlines():
    expected, path = line.split('  ', 1)
    assert sha(Path(path).read_bytes()) == expected, path
print(json.dumps({'baseline': record['main'], 'full_assets_rechecked': len(assets), 'reference_spans': len(record['spans']), 'baseline_pins': len(record['baseline_pins']), 'anchor_digests': len(record['anchor_checks']), 'frozen_fixture': sha(fixture), 'status': 'PASS_STATIC_NOT_RUNTIME'}))
