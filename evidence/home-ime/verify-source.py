import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--phase', choices=['baseline', 'guarded'], required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
folder = Path(__file__).resolve().parent
record = json.loads((folder / 'source.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
for span in record['reference_spans']:
    data = (folder / 'reference' / span['file']).read_bytes()
    assert len(data) == span['bytes'] and sha(data) == span['sha256'], span['name']
for pin in record['current_source_pins']:
    baseline = subprocess.check_output(['git', 'show', f"{pin['commit']}:{pin['path']}"], cwd=root)
    assert len(baseline) == pin['bytes'] and sha(baseline) == pin['sha256'], pin['path']
    current = (root / pin['path']).read_bytes()
    if pin['path'] == 'src/components/AllWorkspaces.tsx' and args.phase == 'guarded':
        guard = b'    if (e.defaultPrevented || e.nativeEvent.isComposing || e.keyCode === 229) return;\n'
        assert current.count(guard) == 1
        current = current.replace(guard, b'', 1)
    assert current == baseline, pin['path']
for frozen in record['frozen_neighbors']:
    data = (root / frozen['path']).read_bytes()
    assert len(data) == frozen['bytes'] and sha(data) == frozen['sha256'], frozen['path']
expected, path = (folder / 'fixture.sha256').read_text().split()
assert sha((root / path).read_bytes()) == expected
print(json.dumps({'phase': args.phase, 'reference_spans': len(record['reference_spans']),
                  'current_source_pins': len(record['current_source_pins']), 'frozen_neighbors': len(record['frozen_neighbors']),
                  'fixture_sha256': expected, 'result': 'PASS_STATIC_ONLY'}))
