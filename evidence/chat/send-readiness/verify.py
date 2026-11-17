import hashlib
import json
from pathlib import Path
import subprocess

here = Path(__file__).resolve().parent
repo = here.parents[2]
fixture = json.loads((here / 'fixture.json').read_text())
for path, expected in fixture['published_files'].items():
    assert hashlib.sha256((repo / path).read_bytes()).hexdigest() == expected, path
source = json.loads((here / 'source.json').read_text())
for item in source['current_source']:
    data = subprocess.check_output(['git', '-C', str(repo), 'show', f'{source["main"]}:{item["path"]}'])
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
assert '# pass 4\n' in (here / 'local-service-controls.tap').read_text()
assert '# pass 79\n' in (here / 'local-mounted-prepublication.tap').read_text()
assert '# fail 1\n' in (here / 'exploratory-assumption-failure.tap').read_text()
assert all(item['status'] == 'DETECTED_INTENDED_ASSERTION' for item in json.loads((here / 'sensitivity.json').read_text()))
print('PASS: published fixture hashes, eight baseline source bindings, preserved local outcomes, and three sensitivity receipts')
print('Integrity only. This script does not execute product tests or authenticate hosted, native, or provider behavior.')
