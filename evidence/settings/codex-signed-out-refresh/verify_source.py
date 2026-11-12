import argparse
import hashlib
import json
from pathlib import Path
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('--archive', type=Path, required=True)
args = parser.parse_args()
packet = json.loads(Path(__file__).with_name('source.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
archive_bytes = args.archive.read_bytes()
assert len(archive_bytes) == packet['source_attachment']['bytes']
assert sha(archive_bytes) == packet['source_attachment']['sha256']
with tarfile.open(args.archive) as archive:
    assets = {}
    for asset in packet['assets']:
        file = archive.extractfile(asset['archive_member'])
        assert file is not None, asset['key']
        data = file.read()
        assert len(data) == asset['bytes'], asset['key']
        assert sha(data) == asset['sha256'], asset['key']
        assets[asset['key']] = data
for span in packet['spans']:
    start, end = span['utf8_half_open']
    data = assets[span['asset']][start:end]
    assert len(data) == span['bytes'], span['name']
    assert sha(data) == span['sha256'], span['name']
    assert data.decode('utf-8') == span['literal'], span['name']
print(f"PASS: original archive, {len(assets)} assets and {len(packet['spans'])} literal spans")
