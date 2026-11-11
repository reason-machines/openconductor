"""Verify retained REA bytes, frozen fixture, and the product baseline without executing JS."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--original-assets', type=Path, required=True)
parser.add_argument('--phase', choices=['baseline', 'candidate'], default='baseline')
args = parser.parse_args()
packet = Path(__file__).resolve().parent
root = packet.parents[2]
sha = lambda b: hashlib.sha256(b).hexdigest()
q = json.loads((packet / 'qualification.json').read_text())
original = json.loads((packet / 'original-source.json').read_text())
checks = []

def check(name, passed):
    checks.append({'check': name, 'passed': bool(passed)})
    assert passed, name

for asset in original['retained_assets']:
    data = (args.original_assets / asset['name']).read_bytes()
    check('original asset: ' + asset['name'], len(data) == asset['bytes'] and sha(data) == asset['sha256'])
    for span in [s for s in original['spans'] if s['asset'] == asset['name']]:
        start, end = span['utf8_half_open']
        actual = data[start:end]
        check('original span: ' + span['label'], actual == (packet / 'original-spans' / Path(span['file']).name).read_bytes() and sha(actual) == span['sha256'])
fixture = (packet / q['fixture']['path']).read_bytes()
check('unchanged V3 five-case fixture', sha(fixture) == q['fixture']['sha256'])
for source in q['source_inputs']:
    baseline = subprocess.check_output(['git', 'show', q['baseline_main'] + ':' + source['path']], cwd=root)
    check('baseline pin: ' + source['path'], sha(baseline) == source['sha256'])
    if source['path'] not in q['test_only_changes'] and (args.phase == 'baseline' or source['path'] not in q['allowed_product_changes']):
        check('worktree source: ' + source['path'], sha((root / source['path']).read_bytes()) == source['sha256'])
check('real Popover dependency remains imported', 'import { Popover } from "@base-ui/react/popover";' in (root / 'src/features/chat/ChatEmptyState.tsx').read_text())
check('pinned installed primitive', json.loads((root / 'package.json').read_text())['dependencies']['@base-ui/react'] == '1.9.0')
check('catalog stays a separate proposed field before RED', args.phase != 'baseline' or 'transcript_chats' not in (root / 'src-tauri/src/persistence/mod.rs').read_text())
receipt = {'author': 'Conductor Rebuild', 'phase': args.phase, 'baseline_main': q['baseline_main'], 'checks_passed': len(checks), 'fixture_sha256': sha(fixture), 'status': 'STATIC_PASS_ONLY', 'checks': checks, 'not_run': ['JavaScript parsing/React/DOM', 'Rust DB/DTO execution', 'browser/native/provider/installation']}
(packet / (args.phase + '-source-receipt.json')).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k: v for k, v in receipt.items() if k != 'checks'}))
