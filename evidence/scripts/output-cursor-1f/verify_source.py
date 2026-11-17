"""Verify source identities and the sealed fixture without executing JavaScript."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--original-dir', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent
receipt = json.loads((root / 'source.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
assets = {}
if args.original_dir:
    for identity in [receipt['original_identity'], receipt['supporting_original_identity']]:
        data = (args.original_dir / identity['name']).read_bytes()
        assert sha(data) == identity['sha256'] and len(data) == identity['bytes']
        assets['index' if identity['name'].startswith('index-') else 'renderer'] = data
for pin in receipt['spans']:
    data = (root / 'reference' / (pin['symbol'] + '.txt')).read_bytes()
    assert sha(data) == pin['sha256'], pin['symbol']
    if assets:
        asset = assets[pin.get('asset', 'renderer')]
        begin, end = pin['utf8_half_open']
        assert asset[begin:end] == data and asset.count(data) == 1, pin['symbol']
for name in ['ScriptOutput.tsx', 'ScriptsPanel.tsx']:
    pin = next(pin for pin in receipt['current_source'] if pin['path'].endswith('/' + name))
    assert sha((root / 'baseline' / (name + '.txt')).read_bytes()) == pin['sha256']
fixture = Path(receipt['fixture']['path'])
assert sha(fixture.read_bytes()) == receipt['fixture']['sha256']
assert fixture.read_text().count('\ntest(') == receipt['fixture']['cases']
assert (root / 'fixture.sha256').read_text() == receipt['fixture']['sha256'] + '  ' + str(fixture) + '\n'
assert all(receipt['static_checks'].values())
print(json.dumps({'original_asset_identity': 'PASS' if assets else 'NOT_CHECKED (supply --original-dir)', 'retained_spans': len(receipt['spans']), 'sealed_cases': receipt['fixture']['cases'], 'baseline_product_snapshots': 'PASS', 'fixture_sha256': receipt['fixture']['sha256'], 'behavioral_execution': 'NOT_RUN by this verifier'}, indent=2))
