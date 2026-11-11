"""Verify retained bytes only. This does not run either application."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent
repo = root.parents[2]
packet = json.loads((root / 'source-v1/source-pins.json').read_text())
for row in packet['files']:
    data = (root / row['path']).read_bytes()
    assert len(data) == row['bytes'], row['path']
    assert hashlib.sha256(data).hexdigest() == row['sha256'], row['path']
fixture = repo / 'src/features/diff/filePathChipAlacritty.test.ts'
assert hashlib.sha256(fixture.read_bytes()).hexdigest() == packet['regression_sha256']
for row in packet['joins']:
    assert row['text'] in (root / row['path']).read_text(), row
print(json.dumps({
    'result': 'PASS static source pins and frozen regression integrity',
    'baseline_main': packet['baseline_main'],
    'files': len(packet['files']),
    'source_joins': len(packet['joins']),
    'behavior': 'NOT_RUN',
    'native': 'NOT_RUN',
}))
