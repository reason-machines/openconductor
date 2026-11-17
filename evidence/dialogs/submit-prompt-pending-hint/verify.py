#!/usr/bin/env python3
"""Audit the retained source, frozen counterexample and one-line treatment."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
sha = lambda raw: hashlib.sha256(raw).hexdigest()
manifest = json.loads((OUT / 'source.json').read_text())
asset_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.rea-work/dlg-pr-title-cancel-focus-retained/renderApp-D_fmY7hW.js'
asset = asset_path.read_bytes()
assert len(asset) == manifest['asset']['bytes']
assert sha(asset) == manifest['asset']['sha256']
for record in manifest['spans']:
    start, end = record['utf8_half_open']
    raw = asset[start:end]
    assert len(raw) == record['bytes'], record['name']
    assert sha(raw) == record['sha256'], record['name']
    assert raw == (OUT / record['file']).read_bytes(), record['file']

component = 'src/components/SubmitPromptDialog.tsx'
before = '{key && <span className="submit-prompt-kbd">{glyphs(key)}</span>}'
after = '{!opening && key && <span className="submit-prompt-kbd">{glyphs(key)}</span>}'
original = gzip.decompress((OUT / 'baseline/SubmitPromptDialog.tsx.gz').read_bytes())
assert original.count(before.encode()) == 1
for record in manifest['current_sources']:
    path = record['path']
    old = subprocess.check_output(['git', 'show', f"{manifest['main_checked']}:{path}"], cwd=ROOT)
    assert sha(old) == record['sha256'], path
    if path == component:
        assert old == original
        expected = old.replace(before.encode(), after.encode())
    else:
        expected = old
    assert (ROOT / path).read_bytes() == expected, path

fixture = (ROOT / 'src/components/submitPromptPendingHint.test.ts').read_bytes()
assert sha(fixture) == manifest['fixture_sha256']
assert fixture == (OUT / 'baseline/submitPromptPendingHint.test.ts.txt').read_bytes()
assert sha(fixture) == (OUT / 'fixture.sha256').read_text().split()[0]
archives = json.loads((OUT / 'raw-red-archives.json').read_text())
for record in archives:
    packed = (OUT / record['path']).read_bytes()
    raw = gzip.decompress(packed)
    assert sha(packed) == record['gzip_sha256']
    assert sha(raw) == record['original_sha256'] and len(raw) == record['original_bytes']
    assert raw == subprocess.check_output(['git', 'show', f"{record['original_commit']}:{record['original_path']}"], cwd=ROOT)
for name, passes, failures in [('baseline.tap.gz', 7, 2), ('treatment.tap', 9, 0), ('adjacent-baseline.tap', 10, 0), ('adjacent-treatment.tap', 10, 0)]:
    log = gzip.decompress((OUT / name).read_bytes()).decode() if name.endswith('.gz') else (OUT / name).read_text()
    for line in [f'# pass {passes}', f'# fail {failures}', '# cancelled 0', '# skipped 0']:
        assert line in log.splitlines(), (name, line)
red = gzip.decompress((OUT / 'baseline.tap.gz').read_bytes()).decode()
assert red.count('pending button must not advertise an idle shortcut') == 2
assert red.count('not ok ') == 2
assert 'not ok 3 - Submit prompt hides the default hint while the opener is pending' in red
assert 'not ok 5 - Submit prompt hides the custom hint while the opener is pending' in red
print(json.dumps({
    'result': 'PASS', 'main_checked': manifest['main_checked'],
    'source_bindings': len(manifest['spans']), 'current_source_pins': len(manifest['current_sources']),
    'product_replacements': 1, 'legacy_test_edits': 0, 'byte_exact_red_archives': len(archives),
    'frozen9_sha256': sha(fixture), 'baseline': '7 pass / 2 intended failures',
    'treatment': '9 pass', 'adjacent_before_and_after': '10 pass',
    'limits': 'Retained source and inert mounted form callbacks, not browser/native/package acceptance',
}, indent=2))
