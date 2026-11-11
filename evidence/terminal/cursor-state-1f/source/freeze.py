"""Freeze retained inert source evidence and a current-main comparison without executing JavaScript."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

BASE = 'b34ba2de9ad45365715d21a0bfe24d9c36b335fb'
ROOT = Path(__file__).resolve().parent
PRIOR = Path('.oc-tmp/cursor-state-1f/source')
ORIGINALS = Path('.oc-tmp/vio-received-72733982/originals')
sha = lambda data: hashlib.sha256(data).hexdigest()
manifest = json.loads((PRIOR / 'reference.json').read_text())
assets = {}
for asset in manifest['artifacts']:
    data = (ORIGINALS / asset['name']).read_bytes()
    assert len(data) == asset['bytes'] and sha(data) == asset['sha256'], asset['name']
    assets[asset['artifact']] = data
for span in manifest['spans']:
    data = (PRIOR / span['file']).read_bytes()
    start, end = span['utf8_half_open']
    assert data == assets[span['artifact']][start:end]
    assert len(data) == span['bytes'] and sha(data) == span['sha256'], span['name']
    dest = ROOT / span['file']
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
for source in manifest['main_sources']:
    data = subprocess.check_output(['git', 'show', BASE + ':' + source['path']])
    dest = ROOT / source['retained_file']
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    source.update({'git_blob': subprocess.check_output(['git', 'rev-parse', BASE + ':' + source['path']]).decode().strip(),
                   'bytes': len(data), 'sha256': sha(data)})
for source in manifest['existing_dependency_sources']:
    data = Path(source['path']).read_bytes()
    assert len(data) == source['bytes'] and sha(data) == source['sha256'], source['path']
fixture = Path('src/features/terminal/cursorState.test.ts')
manifest.update({'task': 'terminal cursor-state frozen regression authoring', 'main_checked': BASE,
                 'fixture': {'path': str(fixture), 'bytes': fixture.stat().st_size,
                             'sha256': sha(fixture.read_bytes()), 'executed': False},
                 'product_tests_run': False, 'product_patch_applied': False})
(ROOT / 'reference.json').write_text(json.dumps(manifest, indent=2) + '\n')
shutil.copyfile(PRIOR / 'README.md', ROOT / 'qualification-historical.md')
print(json.dumps({'main_checked': BASE, 'complete_assets_verified': len(assets),
                  'retained_spans_verified': len(manifest['spans']),
                  'current_main_blobs': len(manifest['main_sources']),
                  'existing_dependency_files_verified': len(manifest['existing_dependency_sources']),
                  'fixture_sha256': manifest['fixture']['sha256'],
                  'manifest_sha256': sha((ROOT / 'reference.json').read_bytes()),
                  'product_or_reference_execution': False}, indent=2))
