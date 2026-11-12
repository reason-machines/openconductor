import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--index', type=Path)
parser.add_argument('--baseline', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
evidence = Path(__file__).resolve().parent
packet = json.loads((evidence / 'source.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
for span in packet['spans']:
    literal = span['literal'].encode()
    start, end = span['utf8_half_open']
    assert len(literal) == end - start
    assert sha(literal) == span['sha256']
if args.index:
    original = args.index.read_bytes()
    assert len(original) == packet['index']['bytes']
    assert sha(original) == packet['index']['sha256']
    for span in packet['spans']:
        start, end = span['utf8_half_open']
        assert original[start:end] == span['literal'].encode()
for item in packet['baseline_inputs']:
    original = subprocess.check_output(['git', 'show', f"{item['commit']}:{item['path']}"], cwd=root)
    assert len(original) == item['bytes']
    assert sha(original) == item['sha256']
    if args.baseline and item['path'] != 'src-tauri/src/diff/git_tests.rs':
        assert sha((root / item['path']).read_bytes()) == item['sha256']
for line in (evidence / 'fixture.sha256').read_text().splitlines():
    digest, path = line.split(maxsplit=1)
    assert sha((root / path).read_bytes()) == digest
print(json.dumps({'retained_spans': len(packet['spans']), 'baseline_inputs': len(packet['baseline_inputs']), 'fixture': 'PASS', 'complete_original': 'PASS' if args.index else 'NOT_CHECKED', 'current_product_matches_baseline': args.baseline, 'reference_execution': 'NOT_RUN'}))
