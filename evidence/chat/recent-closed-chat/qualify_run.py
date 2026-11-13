"""Qualify hosted TAP without counting loader, transport, or provider failures as RED."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--phase', choices=['baseline', 'candidate'], required=True)
parser.add_argument('--tap', type=Path, required=True)
parser.add_argument('--commit', required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--baseline', type=Path)
args = parser.parse_args()
packet = Path(__file__).resolve().parent
root = packet.parents[2]
q = json.loads((packet / 'qualification.json').read_text())
fixture_path = 'evidence/chat/recent-closed-chat/' + q['fixture']['path']
fixture = subprocess.check_output(['git', 'show', args.commit + ':' + fixture_path], cwd=root)
fixture_sha = hashlib.sha256(fixture).hexdigest()
assert fixture_sha == q['fixture']['sha256'], 'frozen mounted fixture changed'
if args.phase == 'baseline':
    for item in q['source_inputs']:
        if item['path'] not in q['test_only_changes']:
            data = subprocess.check_output(['git', 'show', args.commit + ':' + item['path']], cwd=root)
            assert hashlib.sha256(data).hexdigest() == item['sha256'], 'baseline source drift: ' + item['path']
else:
    assert args.baseline, 'candidate needs a qualified actual baseline receipt'
    red = json.loads(args.baseline.read_text())
    assert red['verdict'] == 'EXPECTED_BEHAVIORAL_RED' and red['fixture_sha256'] == fixture_sha
raw = args.tap.read_text()
tap = re.sub(r'^\d{4}-\d\d-\d\dT\S+Z ', '', raw, flags=re.M)
ids = ['CLOSED_ELIGIBLE', 'OPEN_CONTROL', 'NO_USER_CONTROL', 'WORKSPACE_CONTROL', 'REOPEN_AND_ATTACH']
markers = {
    'CLOSED_ELIGIBLE': 'closed user source is missing',
    'WORKSPACE_CONTROL': 'own workspace closed source is missing',
    'REOPEN_AND_ATTACH': 'reclosed user source is missing',
}
pattern = re.compile(r'^(not ok|ok) \d+ - (' + '|'.join(ids) + r'):[^\n]*$', re.M)
matches = list(pattern.finditer(tap))
cases = []
for index, match in enumerate(matches):
    end = matches[index + 1].start() if index + 1 < len(matches) else len(tap)
    body = tap[match.start():end]
    passed = match.group(1) == 'ok'
    cases.append({'id': match.group(2), 'passed': passed, 'intended_assertion': passed or markers.get(match.group(2), 'NO_EXPECTED_FAILURE') in body})
expected = {key: (args.phase == 'candidate' or key not in markers) for key in ids}
valid = (len(cases) == 5 and {c['id'] for c in cases} == set(ids)
         and all(c['passed'] == expected[c['id']] and c['intended_assertion'] for c in cases)
         and not re.search(r'Unbound native command|Missing fixture module|New TSX loader dependency|Provider execution is outside|transport assertions must not be swallowed', tap))
verdict = ('EXPECTED_BEHAVIORAL_RED' if args.phase == 'baseline' else 'ALL_FIVE_GREEN') if valid else 'HARNESS_OR_UNEXPECTED_FAILURE'
receipt = {'author': 'Conductor Rebuild', 'phase': args.phase, 'verdict': verdict, 'commit': args.commit, 'baseline_main': q['baseline_main'], 'fixture_sha256': fixture_sha, 'tap_sha256': hashlib.sha256(raw.encode()).hexdigest(), 'cases': cases, 'scope': 'Mounted React warm-snapshot cases only; no DB/native/provider/cold-start credit'}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
assert valid, 'No behavioral credit; inspect the exact TAP failure'
