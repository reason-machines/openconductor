import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--renderer', type=Path, required=True)
parser.add_argument('--index', type=Path, required=True)
parser.add_argument('--baseline', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent
packet = json.loads((root / 'source.json').read_text())
assets = {'renderer': args.renderer.read_bytes(), 'index': args.index.read_bytes()}


def digest(data):
    return hashlib.sha256(data).hexdigest()


for name, data in assets.items():
    assert digest(data) == packet['reference_assets'][name], name
for span in packet['spans']:
    data = assets[span['asset']][span['start']:span['end']]
    assert data == (root / span['retained']).read_bytes(), span['symbol']
    assert digest(data) == span['sha256'], span['symbol']
for path, expected in packet['current_main_pins'].items():
    baseline = subprocess.check_output(['git', 'show', f"{packet['checked_main']}:{path}"])
    assert digest(baseline) == expected, path
    if args.baseline:
        assert Path(path).read_bytes() == baseline, f'product changed before qualified RED: {path}'
for name in ['fixture', 'existing_tooltip_fixture']:
    fixture = packet[name]
    assert digest(Path(fixture['path']).read_bytes()) == fixture['sha256'], fixture['path']
print(f"PASS: two complete retained REA assets, {len(packet['spans'])} exact spans, five fresh-main inputs and both frozen fixtures. SOURCE ONLY; hosted behavior and native acceptance NOT_RUN.")
