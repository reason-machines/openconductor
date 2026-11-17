import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--phase', choices=['baseline', 'candidate'], required=True)
parser.add_argument('--renderer', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
folder = Path(__file__).resolve().parent
record = json.loads((folder / 'source.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
reference = root / 'evidence/home-ime'
original = (reference / 'source.json').read_bytes()
assert sha(original) == record['original_reference_record_sha256']
old = json.loads(original)
asset = args.renderer.read_bytes() if args.renderer else None
if asset is not None:
    assert len(asset) == old['reference']['bytes']
    assert sha(asset) == old['reference']['sha256']
for span in old['reference_spans']:
    data = (reference / 'reference' / span['file']).read_bytes()
    assert len(data) == span['bytes'] and sha(data) == span['sha256'], span['name']
    if asset is not None:
        start, end = span['utf8_half_open']
        assert asset[start:end] == data, span['name']
for pin in record['inputs']:
    baseline = subprocess.check_output(['git', 'show', f"{pin['commit']}:{pin['path']}"], cwd=root)
    assert len(baseline) == pin['bytes'] and sha(baseline) == pin['sha256'], pin['path']
    current = (root / pin['path']).read_bytes()
    if pin['path'] == 'src/components/AllWorkspaces.tsx' and args.phase == 'candidate':
        changes = [
            (b'    if (e.key === "Home" || e.key === "End") {',
             b'    if (e.key === "Home" || e.key === "End" || (e.metaKey && (e.key === "ArrowUp" || e.key === "ArrowDown"))) {'),
            (b'      const entry = flat[e.key === "Home" ? 0 : flat.length - 1];',
             b'      const entry = flat[e.key === "Home" || e.key === "ArrowUp" ? 0 : flat.length - 1];'),
        ]
        for before, after in changes:
            assert current.count(after) == 1
            current = current.replace(after, before, 1)
    assert current == baseline, pin['path']
for line in (folder / 'fixture.sha256').read_text().splitlines():
    expected, path = line.split()
    assert sha((root / path).read_bytes()) == expected, path
print(json.dumps({'result': 'PASS_STATIC_ONLY', 'phase': args.phase,
                  'main': record['baseline_main'], 'rea_spans': len(old['reference_spans']),
                  'fresh_inputs': len(record['inputs']), 'full_asset_verified': asset is not None}))
