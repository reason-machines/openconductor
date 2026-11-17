#!/usr/bin/env python3
"""Inert byte verification only: never import/evaluate Conductor JavaScript."""
from pathlib import Path
import argparse
import hashlib
import json

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--index', type=Path, required=True)
parser.add_argument('--renderer', type=Path, required=True)
args = parser.parse_args()
parents = {'index': args.index.read_bytes(), 'renderer': args.renderer.read_bytes()}
recovery = HERE / 'reference/renderer-binding-recovery'
manifest = json.loads((recovery / 'manifest.json').read_text())
for name, value in manifest['assets'].items():
    data = parents[name]
    assert len(data) == value['bytes']
    assert hashlib.sha256(data).hexdigest() == value['sha256']
count = 0
for folder, key in [(recovery, None), (HERE / 'reference/reference-extension', 'index')]:
    packet = json.loads((folder / 'manifest.json').read_text())
    for record in packet['records']:
        literal = (folder / record['path']).read_bytes()
        a, b = record['utf8_half_open']
        assert literal == parents[key or record['asset']][a:b], record['symbol']
        assert len(literal) == record['bytes']
        assert hashlib.sha256(literal).hexdigest() == record['sha256']
        count += 1
print(f'PASS: {count} literal records checked against both digest-pinned full parents; no JavaScript evaluation')
