import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--renderer', type=Path, required=True)
parser.add_argument('--index', type=Path, required=True)
parser.add_argument('--baseline', action='store_true')
args = parser.parse_args()
root = Path(__file__).parent
source = json.loads((root / 'source.json').read_text())
assets = {'renderer': args.renderer.read_bytes(), 'index': args.index.read_bytes()}
for name, raw in assets.items():
    assert hashlib.sha256(raw).hexdigest() == source['reference_assets'][name]['sha256'], name
for span in source['spans']:
    raw = assets[span['asset']][span['start']:span['end']]
    assert hashlib.sha256(raw).hexdigest() == span['sha256'], span['symbol']
    assert raw == (root / span['retained']).read_bytes(), span['symbol']
for path, expected in source['current_main_pins'].items():
    historical = subprocess.check_output(['git', 'show', source['checked_main'] + ':' + path])
    assert hashlib.sha256(historical).hexdigest() == expected, path
    if args.baseline:
        assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == expected, path
for row in (root / 'fixture.sha256').read_text().splitlines():
    digest, path = row.split(maxsplit=1)
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, path
cases = Path('src/components/sidebarNumberHintOverrides.test.ts').read_text()
assert cases.count('test("Sidebar number hints:') == 9
print('PASS_SOURCE_ONLY: two original assets, 18 exact spans, five historical main pins, nine frozen cases and both Archive fixtures')
