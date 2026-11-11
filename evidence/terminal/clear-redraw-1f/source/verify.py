#!/usr/bin/env python3
"""Verify retained inert source bytes and the immutable comparison baseline."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--originals', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent
manifest = json.loads((root / 'reference.json').read_text())
sha256 = lambda data: hashlib.sha256(data).hexdigest()
assets = {}
for artifact in manifest['artifacts']:
    data = (args.originals / artifact['name']).read_bytes()
    assert len(data) == artifact['bytes'], artifact['name']
    assert sha256(data) == artifact['sha256'], artifact['name']
    assets[artifact['artifact']] = data
for span in manifest['spans']:
    data = (root / span['file']).read_bytes()
    start, end = span['utf8_half_open']
    assert len(data) == span['bytes'] == end - start, span['name']
    assert sha256(data) == span['sha256'], span['name']
    assert assets[span['artifact']][start:end] == data, span['name']
for source in manifest['main_sources']:
    data = subprocess.check_output(['git', 'show', source['commit'] + ':' + source['file']])
    assert len(data) == source['bytes'], source['file']
    assert sha256(data) == source['sha256'], source['file']
print(json.dumps({
    'result': 'PASS',
    'main_checked': manifest['main_checked'],
    'complete_assets_rehashed': len(assets),
    'exact_utf8_spans_matched': len(manifest['spans']),
    'immutable_baseline_blobs_matched': len(manifest['main_sources']),
    'reference_execution': False,
    'product_execution': False,
}, indent=2))
