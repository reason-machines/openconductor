import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--baseline', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent
repo = Path.cwd()
manifest = json.loads((root / 'source.json').read_text())


def sha(data):
    return hashlib.sha256(data).hexdigest()


for name in ['reference-P9.txt', 'reference-wrapper.txt']:
    data = (root / name).read_bytes()
    span = manifest['reference']['spans'][name]
    assert sha(data) == span['sha256'], name
    begin, end = span['utf8_half_open']
    assert len(data) == end - begin, name
p9 = (root / 'reference-P9.txt').read_bytes()
wrapper = (root / 'reference-wrapper.txt').read_bytes()
arrow = manifest['reference']['spans']['_vs']
begin, end = arrow['utf8_half_open']
p9_begin = manifest['reference']['spans']['reference-P9.txt']['utf8_half_open'][0]
assert sha(p9[begin-p9_begin:end-p9_begin]) == arrow['sha256']
assert b'_t=xd(_vs)' in p9 and b'onKeyDown:_t' in p9
assert wrapper == b'function hEe(t){return t}const dBr=hEe,pEe=hEe,_v=hEe,fBr=hEe,xd=hEe;'
assert sha((root / 'baseline-OpenInButton.tsx.txt').read_bytes()) == manifest['product_sha256']
fixture = repo / manifest['fixture_path']
assert sha(fixture.read_bytes()) == manifest['fixture_sha256'], 'frozen fixture changed'
if args.baseline:
    assert sha((repo / manifest['product_path']).read_bytes()) == manifest['product_sha256'], 'product changed before hosted baseline'
assert len(manifest['scenarios']['expected_baseline_failures']) == 4
assert len(manifest['scenarios']['expected_baseline_controls']) == 5
print('PASS retained REA spans, wrapper identity, baseline snapshot and frozen nine-case fixture' + ('; product unchanged' if args.baseline else ''))
