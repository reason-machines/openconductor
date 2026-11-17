#!/usr/bin/env python3
"""Check retained REA data, the frozen fixture, and the current main source pins."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
sha = lambda raw: hashlib.sha256(raw).hexdigest()
manifest = json.loads((OUT / 'qualification-original.json').read_text())
current = json.loads((OUT / 'current-source.json').read_text())
assets_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.rea-work/dlg-pr-title-cancel-focus-retained'
assets = {key: (assets_dir / name).read_bytes() for key, name in [
    ('renderer', 'renderApp-D_fmY7hW.js'), ('index', 'index-BGEQ8YjU.js'),
]}
for key, raw in assets.items():
    assert sha(raw) == manifest['asset_sha256'][key], key
for record in manifest['spans']:
    start, end = record['utf8_half_open']
    raw = assets[record['asset']][start:end]
    assert sha(raw) == record['sha256'], record['name']
    assert raw == (OUT / record['file']).read_bytes(), record['file']
for record in manifest['frozen_fixture']:
    assert sha((OUT / 'frozen' / record['path']).read_bytes()) == record['sha256'], record['path']
assert (ROOT / 'src/components/createProjectImplicitEnter.test.ts').read_bytes() == (OUT / 'frozen/createProjectImplicitEnter.test.ts.txt').read_bytes()
for record in manifest['current_sources']:
    path = record['path']
    original = (OUT / 'baseline' / path).read_bytes()
    assert sha(original) == record['sha256'], path
    fresh = subprocess.check_output(['git', 'show', f"{current['main']}:{path}"], cwd=ROOT)
    assert fresh == original, path
    assert (ROOT / path).read_bytes() == fresh, path
print(json.dumps({
    'result': 'PASS', 'main': current['main'], 'assets': len(assets),
    'reference_spans': len(manifest['spans']), 'frozen_fixture_files': len(manifest['frozen_fixture']),
    'current_source_pins': len(manifest['current_sources']),
    'claim': 'Static source identity only; no original JavaScript or browser executed',
}, indent=2))
