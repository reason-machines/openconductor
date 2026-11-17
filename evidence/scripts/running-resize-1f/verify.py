#!/usr/bin/env python3
"""Verify retained source and frozen fixture identity; never execute target code."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--original-dir', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent
repo = root.parents[2]
source = json.loads((root / 'source.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
assets = {}
if args.original_dir:
    for name, expected in source['original_assets'].items():
        data = (args.original_dir / name).read_bytes()
        assert sha(data) == expected, name
        assets[name] = data
for span in source['spans']:
    data = (root / span['file']).read_bytes()
    assert len(data) == span['bytes'] and sha(data) == span['sha256'], span['symbol']
    if assets:
        start, end = span['utf8_half_open']
        assert data == assets[span['asset']][start:end], span['symbol']
for entry in source['current_sources']:
    data = (root / entry['file']).read_bytes()
    assert len(data) == entry['bytes'] and sha(data) == entry['sha256'], entry['path']
fixture = source['fixture']
assert sha((repo / fixture['path']).read_bytes()) == fixture['sha256']
assert sha((root / fixture['frozen_copy']).read_bytes()) == fixture['sha256']
print(json.dumps(dict(status='PASS_STATIC_ONLY', original_assets=len(assets), spans=len(source['spans']), baseline_files=len(source['current_sources']), frozen_cases=fixture['cases'], main=source['main_checked'])))
