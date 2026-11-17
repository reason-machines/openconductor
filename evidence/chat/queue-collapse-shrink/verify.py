"""Verify frozen evidence only: no Node, product imports, or behavioral rerun."""
from pathlib import Path
import gzip
import hashlib
import json
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
checks = []


def check(label, condition):
    if not condition:
        raise AssertionError(label)
    checks.append(label)


def digest(data):
    return hashlib.sha256(data).hexdigest()


for entry in json.loads((HERE / 'manifest.json').read_text()):
    content = (HERE / entry['path']).read_bytes()
    check('identity: ' + entry['path'], len(content) == entry['bytes'] and digest(content) == entry['sha256'])

request = json.loads((HERE / 'baseline/request.json').read_text())
green = json.loads((HERE / 'green-request.json').read_text())
fixture = (ROOT / request['fixture']['path']).read_bytes()
check('immutable executable fixture', digest(fixture) == '948310bd9247754387556adc910acec1cc3174c26bdff38b2dff3b65e0d77cad')
check('same inert fixture', fixture == (HERE / 'baseline/composerQueueCollapseShrink.test.ts.txt').read_bytes())
baseline = (HERE / 'baseline/Composer.tsx.txt').read_bytes()
treatment = (HERE / 'treatment-Composer.tsx.txt').read_bytes()
check('baseline Composer', digest(baseline) == request['baseline_source']['sha256'])
check('treatment Composer', digest(treatment) == green['treatment']['sha256'])
check('executable Composer is tested treatment', (ROOT / 'src/features/chat/Composer.tsx').read_bytes() == treatment)
check('all code before QueuePanel unchanged', baseline.split(b'function QueuePanel(')[0] == treatment.split(b'function QueuePanel(')[0])
check('QueueRow and following code unchanged', baseline.split(b'interface RowProps {')[1] == treatment.split(b'interface RowProps {')[1])

case_names = {}
for phase, passed, failed in [('red', 13, 5), ('green', 18, 0)]:
    output_path = HERE / f'runtime/{phase}-test.stdout'
    output = (gzip.decompress(output_path.with_suffix('.stdout.gz').read_bytes()).decode()
              if phase == 'red' else output_path.read_text())
    receipt = json.loads((HERE / f'runtime/{phase}-receipt.json').read_text())
    case_names[phase] = re.findall(r'^# Subtest: (.+)$', output, re.M)
    check(f'{phase}: all 18 cases executed', len(case_names[phase]) == 18)
    for key, value in [('tests', 18), ('pass', passed), ('fail', failed), ('cancelled', 0), ('skipped', 0), ('todo', 0)]:
        check(f'{phase}: {key} {value}', f'# {key} {value}\n' in output)
    failures = re.findall(r'^not ok \d+ - (.+)$', output, re.M)
    check(f'{phase}: only intended semantic failures', len(failures) == failed and all(name.startswith('shrink/') for name in failures))
    check(f'{phase}: assertion failures only', output.count("code: 'ERR_ASSERTION'") == failed)
    check(f'{phase}: fixture unchanged', receipt['fixture_sha256'] == request['fixture']['sha256'])
    check(f'{phase}: exact same command', receipt['command'] == request['command'])
    check(f'{phase}: setup passed', receipt['static-preflight_exit_code'] == receipt['node-capability_exit_code'] == 0 and 'setup_or_wrapper_error' not in receipt)
    check(f'{phase}: expected exit', receipt['test_exit_code'] == (1 if failed else 0))
    check(f'{phase}: no live survivors at release', receipt['surviving_pids'] == [] and bool(receipt['actual_release_utc']))
    check(f'{phase}: bounded evidence', receipt['own_incremental_evidence_bytes'] < 16 * 1024**2)
check('identical paired case order', case_names['red'] == case_names['green'])
check('five decisive cases', sum(name.startswith('shrink/') for name in case_names['red']) == 5)
check('thirteen unaffected controls', sum(name.startswith('control/') for name in case_names['red']) == 13)

for span in json.loads((HERE / 'reference/spans.json').read_text()):
    source = (HERE / ('reference/' + span['name'] + '.txt')).read_bytes()
    # Retained declaration files append a newline outside the exact renderer range.
    if len(source) == span['bytes'] + 1 and source.endswith(b'\n'):
        source = source[:-1]
    check('reference span: ' + span['name'], len(source) == span['bytes'] and digest(source) == span['sha256'])
binding = json.loads((HERE / 'reference/corrected-binding.json').read_text())
check('legacy digest interpretation preserved as superseded', bool(binding['supersedes']) and binding['disposition'] == 'REFERENCE_BINDING_CORRECTED_STATIC_ONLY')
print(json.dumps({'static_checks_passed': len(checks), 'checks': checks, 'node_or_product_execution': False}, indent=2))
