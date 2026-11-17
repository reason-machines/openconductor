"""Verify inert source spans; optional --assets points at retained original assets.
No extracted JavaScript is evaluated. OpenConductor's local adapter is not the
unobserved proprietary native implementation; skill-link grammar is our own.
"""
from pathlib import Path
import argparse
import hashlib
import json

parser = argparse.ArgumentParser()
parser.add_argument('--assets', type=Path)
args = parser.parse_args()
root = Path(__file__).parent
proof = json.loads((root / 'reference.json').read_text())
checks = 0
for span in proof['spans']:
    data = span['text'].encode()
    start, end = span['utf8_half_open']
    assert len(data) == end - start
    assert hashlib.sha256(data).hexdigest() == span['sha256']
    checks += 2
    if args.assets:
        parent = (args.assets / span['asset']).read_bytes()
        assert hashlib.sha256(parent).hexdigest() == proof['assets'][span['asset']]
        assert parent[start:end] == data
        checks += 2
for join in proof['joins']:
    span = next(span for span in proof['spans'] if span['name'] == join['span'])
    assert join['text'] in span['text'], join['label']
    checks += 1
print(json.dumps({'passed': checks, 'spans': len(proof['spans']), 'parent_range_checks': bool(args.assets)}))
