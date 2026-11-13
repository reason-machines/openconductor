import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile

root = Path(__file__).resolve().parent
repo = root.parents[2]
receipt = json.loads((root / 'reference-source.json').read_text())
sha = lambda body: hashlib.sha256(body).hexdigest()

for span in receipt['reference_spans']:
    body = (root / 'reference' / span['path']).read_bytes()
    assert sha(body) == span['sha256'], span['path']

frozen = {
    repo / 'src/settings/agents/loginTerminalAck.test.ts': receipt['proposed_fixture_sha256'],
    repo / 'src/settings/agents/loginTerminal.test.ts': receipt['completion_fixture_sha256'],
    root / 'baseline-parts.tsx.txt': receipt['main_source_pins'][0]['sha256'],
}
for path, expected in frozen.items():
    assert sha(path.read_bytes()) == expected, path

checked_archive = False
if len(sys.argv) > 1:
    archive = Path(sys.argv[1])
    assert sha(archive.read_bytes()) == receipt['archive_sha256']
    with tarfile.open(archive) as tar:
        for name, expected in receipt['asset_sha256'].items():
            members = [m for m in tar.getmembers() if m.isfile() and PurePosixPath(m.name).name == name]
            assert len(members) == 1, name
            body = tar.extractfile(members[0]).read()
            assert sha(body) == expected, name
            for span in receipt['reference_spans']:
                if span['asset'] == name:
                    start, end = span['utf8_half_open']
                    assert body[start:end] == (root / 'reference' / span['path']).read_bytes(), span['path']
    checked_archive = True

print(json.dumps({
    'result': 'PASS static identities only',
    'main_sha': receipt['main_sha'],
    'reference_spans': len(receipt['reference_spans']),
    'frozen_files': len(frozen),
    'original_archive_checked': checked_archive,
    'product_execution': False,
}))
