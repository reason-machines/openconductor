import hashlib
import json
import pathlib
import sys
import tarfile

root = pathlib.Path(__file__).resolve().parent
receipt = json.loads((root / 'reference-source.json').read_text())
sha = lambda body: hashlib.sha256(body).hexdigest()
archive = pathlib.Path(sys.argv[1])
assert sha(archive.read_bytes()) == receipt['archive_sha256']
assets = {}
with tarfile.open(archive) as tar:
    for name, expected in receipt['asset_sha256'].items():
        members = [m for m in tar.getmembers() if m.isfile() and pathlib.PurePosixPath(m.name).name == name]
        assert len(members) == 1, name
        body = tar.extractfile(members[0]).read()
        assert sha(body) == expected, name
        assets[name] = body
for span in receipt['reference_spans']:
    start, end = span['utf8_half_open']
    body = assets[span['asset']][start:end]
    assert sha(body) == span['sha256'], span['name']
    assert body == (root / 'reference' / span['path']).read_bytes(), span['name']
fixture = root.parents[2] / 'src/settings/agents/loginTerminal.test.ts'
assert sha(fixture.read_bytes()) == 'b01b2a8d502fb7a1eba2b02e5ecfaf9ea2e7bbea28df81700e7b660772a305e7'
assert sha((root / 'baseline-parts.tsx.txt').read_bytes()) == '21e4f365407020b2d7e6da3c75b4605948cf04e89315ee2220cd9771a4218348'
print(json.dumps({'result': 'PASS', 'reference_spans': len(receipt['reference_spans']), 'frozen_fixture': True, 'frozen_baseline': True, 'product_execution': False}))
