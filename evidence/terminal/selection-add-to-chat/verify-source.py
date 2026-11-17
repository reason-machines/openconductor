"""Verify inert source identities and unchanged regression fixture bytes."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--renderer', type=Path)
args = parser.parse_args()
contract = json.loads((ROOT / 'source.json').read_text())
sha = lambda raw: hashlib.sha256(raw).hexdigest()
for item in contract['fixtures']:
    raw = (REPO / item['path']).read_bytes()
    assert sha(raw) == item['sha256'], item['path']
    assert len(raw) == item['bytes'], item['path']
if args.renderer:
    raw = args.renderer.read_bytes()
    assert sha(raw) == contract['renderer_sha256']
    for item in contract['original_spans']:
        start, end = item['utf8_half_open']
        assert sha(raw[start:end]) == item['sha256'], item['symbol']
print(json.dumps({'fixtures': len(contract['fixtures']), 'fixture_identity': 'PASS',
                  'renderer_spans': 'PASS' if args.renderer else 'NOT_SUPPLIED',
                  'node_or_app_execution': False}, indent=2))
