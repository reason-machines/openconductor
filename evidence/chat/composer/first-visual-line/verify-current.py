import argparse
import gzip
import hashlib
import json
import subprocess
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


parser = argparse.ArgumentParser()
parser.add_argument('--renderer', type=Path, required=True)
args = parser.parse_args()
folder = Path(__file__).resolve().parent
root = folder.parents[3]
source = json.loads((folder / 'source.json').read_bytes())
setup = json.loads((folder / 'setup-v2.json').read_bytes())
current = json.loads((folder / 'current-main.json').read_bytes())
renderer = args.renderer.read_bytes()
assert len(renderer) == source['original']['bytes']
assert digest(renderer) == source['original']['sha256']
spans = json.loads((folder / source['reference_spans']).read_bytes())
for span in spans:
    start, end = span['utf8_bytes_half_open']
    data = renderer[start:end]
    assert data.decode() == span['compiled_javascript']
    assert digest(data) == span['sha256_utf8']
for ref, pins in [(source['baseline'], source['main_source_pins']), (current['main'], current['main_source_pins'])]:
    for pin in pins:
        data = subprocess.check_output(['git', '-c', 'gc.auto=0', 'show', ref + ':' + pin['path']], cwd=root)
        assert len(data) == pin['bytes'] and digest(data) == pin['sha256'], pin['path']
for pin in source['frozen_main_fixtures'] + [setup['fixture'], setup['fixture_setup_patch'], setup['preserved_v1_fixture'], *setup['preserved_v1_results'], *current['product_pins']]:
    data = (root / pin['path']).read_bytes()
    assert len(data) == pin['bytes'] and digest(data) == pin['sha256'], pin['path']
for pin in setup['preserved_v1_results']:
    if 'gzip_uncompressed' in pin:
        data = gzip.decompress((root / pin['path']).read_bytes())
        assert len(data) == pin['gzip_uncompressed']['bytes']
        assert digest(data) == pin['gzip_uncompressed']['sha256']
assert digest((folder / 'source.json').read_bytes()) == setup['original_manifest']['sha256']
v1 = (root / setup['preserved_v1_fixture']['path']).read_text()
v2 = (root / setup['fixture']['path']).read_text()
marker = 'test("nonzero caret on the first visual line focuses the last queue row"'
a, b = v1[v1.index(marker):], v2[v2.index(marker):]
for edit in setup['setup_only_test_tail_edits']:
    assert b.count(edit['v2']) == 1
    b = b.replace(edit['v2'], edit['v1'], 1)
assert a == b, 'original twenty-case assertions changed'
for pin in source['excluded_unmerged_fixture']:
    assert not (root / pin['path']).exists(), pin['path']
for pin in current['historical_results']:
    data = (folder / pin['file']).read_bytes()
    assert len(data) == pin['bytes'] and digest(data) == pin['sha256']
    if pin['file'].endswith('.gz'):
        assert digest(gzip.decompress(data)) == pin['uncompressed_sha256']
print(json.dumps({'status': 'PASS', 'main': current['main'], 'retained_spans': len(spans), 'frozen_fixtures': len(source['frozen_main_fixtures']), 'original_twenty_case_assertions': 'unchanged', 'v1_failure': 'preserved', 'historical_v2_results': 'preserved', 'runtime': 'NOT_RUN_BY_THIS_VERIFIER'}))
