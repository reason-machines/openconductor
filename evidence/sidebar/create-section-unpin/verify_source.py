from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent
repo = root.parents[2]
sha = lambda data: hashlib.sha256(data).hexdigest()
manifest = json.loads((root / 'source.json').read_text())
for span in manifest['reference']['spans']:
    data = (root / span['path']).read_bytes()
    assert sha(data) == span['sha256'], span['path']
    lo, hi = span['utf8_half_open']
    assert len(data) == hi - lo, span['path']
expected, path = (root / 'fixture.sha256').read_text().split()
assert sha((repo / path).read_bytes()) == expected, path
original = (root / 'reference/A-dollar-t.txt').read_text()
assert 'await t.run(' in original
assert 'localWorkspaceIdToMove!==void 0&&e.setWorkspacePinned' in original
assert 'pinned:!1' in original
assert 'await t.writePersisted(' in (root / 'reference/tve.txt').read_text()
print(json.dumps({'source_integrity': 'PASS', 'frozen_fixture_sha256': expected, 'behavior': 'NOT_RUN_BY_THIS_VERIFIER'}))
