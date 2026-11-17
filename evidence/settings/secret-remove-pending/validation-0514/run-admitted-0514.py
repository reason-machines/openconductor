"""Finite corrected-Remove allocation; frozen fixtures and original receipts are immutable."""
import ast
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time

ROOT = Path.cwd().resolve()
BASE = ROOT / '.rea-work/secret-remove-indicator64'
P = BASE / 'proposal-v1'
SUP = BASE / 'harness-realm-supplement-v1'
OUT = BASE / 'validation-0514'
OUT.mkdir(exist_ok=False)
START = dt.datetime.fromisoformat('2026-11-13T05:19:49.308771155+00:00').timestamp()
DEADLINE = START + 1560
KIT = ROOT / 'src/settings/agents/kit.tsx'
TEST = ROOT / 'src/settings/agents/secretRemovePending.test.ts'
ADJ = ['src/settings/agents/secretRevealLabel.test.ts', 'src/settings/agents/secretEditorKeyLink.test.ts', 'src/settings/agents/kitModel.test.ts']
OLD = b'aria-label={shown ? `Hide ${label}` : `Show ${label}`}'
NEW = b'aria-label={shown ? `Hide ${label}` : `Reveal ${label}`}'
CASES = [f'{label} Remove shows pending feedback until {outcome} settles' for label in ['Anthropic API key', 'OpenAI API key'] for outcome in ['success', 'failure']]
receipt = {'author': 'Conductor Rebuild', 'token': 'ACC_64_REMOVE4_REALM_CORRECTED_20261113T0514', 'actual_start': dt.datetime.fromtimestamp(START, dt.timezone.utc).isoformat(), 'driver_start': dt.datetime.now(dt.timezone.utc).isoformat(), 'status': 'RUNNING', 'phases': [], 'predicted_cases': CASES, 'predicted_red': 'Exactly 4 ERR_ASSERTION failures: pending Remove needs its own working indicator; actual 0 expected 1', 'rss': 'NOT_SAMPLED; no complete process-tree peak RSS claim', 'reveal_remote_head': 'f7f5decf7b2f119ee8537cf125edcf5c323c1867', 'reveal_merge': '6e1c5e9d38c4d35aa7042edbbcfb6eed0b6d891c', 'native_package_provider_credentials': 'NOT_RUN', 'start_resources_observed': {'computer': 'Cloud 355; own assigned checkout', 'disk_available': '31 GiB', 'memory_available_mib': 10797, 'dependencies': 'React/renderer18.3.1; TypeScript5.9.3 present'}, 'prior_failures_preserved': 'Original Remove GREEN 2PASS/2FAIL; Reveal source/pretest186.587s > source60; no waiver'}
owned = []
baseline = None
created_test = False

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def sha(path):
    return digest(Path(path).read_bytes())

def require(value, message):
    if not value:
        raise RuntimeError(message)

def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()

def save():
    (OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')

def run(name, command, seconds, heap, expected=0):
    require(time.time() + seconds + 5 + 155 < DEADLINE, 'Insufficient inclusive phase/cleanup/receipt time')
    env = os.environ.copy()
    env.update(NODE_ENV='development', NODE_OPTIONS=f'--max-old-space-size={heap}', SECRET_REMOVE_SOURCE_FILE=str(KIT))
    argv = ['nice', '-n19', 'timeout', '--signal=TERM', '--kill-after=5s', f'{seconds}s', *command]
    item = {'name': name, 'start': now(), 'cap_seconds': seconds, 'grace_seconds': 5, 'argv': argv, 'env_nonsecret': {k: env[k] for k in ['NODE_ENV', 'NODE_OPTIONS', 'SECRET_REMOVE_SOURCE_FILE']}, 'stdout': name + '.stdout.txt', 'stderr': name + '.stderr.txt'}
    receipt['phases'].append(item)
    save()
    begin = time.monotonic()
    with (OUT / item['stdout']).open('wb') as out, (OUT / item['stderr']).open('wb') as err:
        proc = subprocess.Popen(argv, stdout=out, stderr=err, env=env, start_new_session=True)
        owned.append(proc.pid)
        item['pgid'] = proc.pid
        try:
            code = proc.wait(timeout=seconds + 5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
            raise RuntimeError('Phase deadline exhausted: ' + name)
    item.update(end=now(), elapsed_seconds=time.monotonic() - begin, exit_code=code, stdout_sha256=sha(OUT / item['stdout']), stderr_sha256=sha(OUT / item['stderr']))
    save()
    require(item['elapsed_seconds'] <= seconds + 5, 'Phase wall cap exhausted: ' + name)
    require(code == expected, f'Unexpected {name} exit {code}')
    return code

def inspect(phase, code):
    raw = (OUT / (phase + '.stdout.txt')).read_bytes()
    tap = raw.decode()
    results = list(re.finditer(r'^(not ok|ok) (\d+) - ([^\n]+)$', tap, re.M))
    failures = list(range(1, 5)) if phase == 'red' else []
    require(code == (1 if phase == 'red' else 0), 'Wrong exit')
    require(not re.search(r'^Bail out!', tap, re.M), 'TAP bailout')
    require(len(results) == 4 and [int(r[2]) for r in results] == list(range(1, 5)), 'Unexpected case count/number')
    require([r[3] for r in results] == CASES, 'Case identity/directive drift')
    require([int(r[2]) for r in results if r[1] == 'not ok'] == failures, 'Wrong failing case set')
    summary = {'tests': 4, 'pass': 4-len(failures), 'fail': len(failures), 'cancelled': 0, 'skipped': 0, 'todo': 0}
    for key, value in summary.items():
        require(re.findall(r'^# ' + key + r' (\d+)$', tap, re.M) == [str(value)], 'Wrong TAP ' + key)
    require(re.findall(r'^1\.\.(\d+)$', tap, re.M) == ['4'], 'Wrong TAP plan')
    for i, result in enumerate(results):
        if result[1] == 'not ok':
            block = tap[result.end():results[i+1].start() if i+1 < len(results) else len(tap)]
            for pattern in [r'^\s+code: [\'\"]ERR_ASSERTION[\'\"]$', r'pending Remove needs its own working indicator', r'^\s+expected: 1$', r'^\s+actual: 0$']:
                require(re.search(pattern, block, re.M), 'Unexpected baseline assertion')
    value = {'phase': phase, 'classification': 'QUALIFYING_RED' if failures else 'VALID_GREEN', 'exit_code': code, 'summary': summary, 'failures': failures, 'raw_tap_sha256': digest(raw), 'inspector_driver_sha256': sha(__file__)}
    (OUT / ('inspect-' + phase + '.json')).write_text(json.dumps(value, indent=2) + '\n')
    receipt[phase + '_classification'] = value
    save()

try:
    require(time.time() - START < 300, 'Full source phase already exhausted before qualification')
    require(git('branch', '--show-current') == 'reason/task-64baa6b6', 'Branch changed')
    require(not git('diff', '--name-only') and not git('diff', '--cached', '--name-only'), 'Tracked checkout dirty')
    require(not TEST.exists(), 'Remove fixture already active')
    require(sha(BASE / 'same64-remove-indicator-source-v1.tar.gz') == '6404f233c57a493c17f36cd2509f60dae8e76d1a9e4bf274628a707e037dd667', 'Original archive drift')
    require(sha(BASE / 'same64-remove-harness-realm-supplement-v1.tar.gz') == '038ae752252c8ccd47238ee3ada743491479a50b11a7ba14b8584cc89736ee20', 'Harness supplement drift')
    prep = json.loads((P / 'source-preparation-receipt.json').read_text())
    supplement = json.loads((SUP / 'receipt.json').read_text())
    require(sha(P / 'candidate.patch') == prep['candidate_patch_sha256'] == '16786423fa3d1f61434b562d230047c504ee5116a9f92d174d651c72a78a84dc', 'Candidate patch drift')
    require(sha(P / 'secretRemovePending.test.ts.txt') == prep['regression_sha256'] == 'd2b4030ff178c115fcd5bfbad3e8a1c4090e6c7337b9fb956661fdd6dae4e0aa', 'Original fixture drift')
    corrected = (SUP / 'secretRemovePending.test.ts.txt').read_bytes()
    require(digest(corrected) == '1b86085cd4acce31968b4eaa74cfca4e47403b960360da35de7486fee4ff7bc7', 'Corrected fixture drift')
    require(corrected.count(b'`, { Error }, { filename })') == 1, 'Correction site differs')
    require(corrected.replace(b'`, { Error }, { filename })', b'`, {}, { filename })', 1) == (P / 'secretRemovePending.test.ts.txt').read_bytes(), 'Correction exceeds approved realm-only substitution')
    for path, expected in supplement['failed_logs'].items():
        require(sha(BASE / 'validation-0342' / path) == expected, 'Prior failed receipt/log drift: ' + path)
    for path, expected in prep['protected'].items():
        require(sha(ROOT / path) == expected, 'Protected input drift: ' + path)
    for span in prep['reference_spans']:
        require(sha(P / 'reference' / (span['name'] + '.txt')) == span['sha256'], 'REA witness drift: ' + span['name'])
    baseline = KIT.read_bytes()
    require(baseline.count(NEW) == 1 and OLD not in baseline, 'Qualified Reveal prefix missing')
    require(baseline.replace(NEW, OLD, 1) == (P / 'base/kit.tsx').read_bytes(), 'Reverse exact Reveal prefix does not recover sealed baseline')
    for pin in prep['source_pins']:
        raw = (ROOT / pin['path']).read_bytes()
        if pin['path'] == 'src/settings/agents/kit.tsx':
            raw = raw.replace(NEW, OLD, 1)
        require(digest(raw) == pin['sha256'], 'Execution pin drift: ' + pin['path'])
    require(sha(ROOT / ADJ[0]) == '8db2461a8d82202cf3d9804803530ec604cb52d469fad90430ae9124e776cac3', 'Reveal fixture drift')
    require(subprocess.check_output(['git', 'show', receipt['reveal_merge'] + ':' + ADJ[0]]) == (ROOT / ADJ[0]).read_bytes(), 'Reveal merged fixture binding differs')
    for path in ADJ:
        require((ROOT / path).is_file(), 'Exact adjacent path missing: ' + path)
    main = git('rev-parse', 'origin/main')
    require(main.startswith('c79a81086'), 'Unqualified main pin')
    require(subprocess.run(['git', 'merge-base', '--is-ancestor', main, 'HEAD']).returncode == 0, 'Current main not normally included')
    require(subprocess.run(['git', 'merge-base', '--is-ancestor', receipt['reveal_merge'], 'HEAD']).returncode == 0, 'Reveal merge missing')
    for pin in prep['source_pins']:
        path = pin['path']
        require((ROOT / path).read_bytes() == subprocess.check_output(['git', 'show', main + ':' + path]), 'Current main input mismatch: ' + path)
    require(sha(ROOT / 'package-lock.json') == '0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a', 'Root lock drift')
    versions = {}
    for name, version in [('react', '18.3.1'), ('react-dom', '18.3.1'), ('react-test-renderer', '18.3.1'), ('typescript', '5.9.3')]:
        path = ROOT / 'node_modules' / name / 'package.json'
        require(path.is_file() and json.loads(path.read_text())['version'] == version, 'Own-root dependency absent/different: ' + name)
        require(path.resolve().is_relative_to(ROOT / 'node_modules'), 'Foreign dependency root: ' + name)
        versions[name] = {'version': version, 'sha256': sha(path)}
    require((ROOT / 'node_modules/.bin/tsc').resolve().is_relative_to(ROOT / 'node_modules') and (ROOT / 'node_modules/.bin/tsc').exists(), 'Own local compiler missing')
    require(subprocess.run(['git', 'apply', '--check', str(P / 'candidate.patch')], capture_output=True).returncode == 0, 'Original patch does not apply')
    candidate = (P / 'candidate/kit.tsx').read_bytes().replace(OLD, NEW, 1)
    require(sha(P / 'candidate/kit.tsx') == prep['candidate_source_sha256'], 'Sealed candidate drift')
    TEST.write_bytes(corrected)
    created_test = True
    elapsed = time.time() - START
    receipt.update(source_end=now(), source_elapsed_seconds=elapsed, source_cap_seconds=300, qualified_head=git('rev-parse', 'HEAD'), qualified_tree=git('rev-parse', 'HEAD^{tree}'), qualified_main=main, actual_kit_sha256=sha(KIT), actual_kit_blob=git('hash-object', str(KIT)), known_reveal_reverse_sha256=digest(baseline.replace(NEW, OLD, 1)), semantic_remove_leaf='UNCHANGED; all other bytes exact', input_sha256={pin['path']: sha(ROOT / pin['path']) for pin in prep['source_pins']}, adjacent_sha256={path: sha(ROOT / path) for path in ADJ}, root_versions=versions, setup='NOT_NEEDED; matching own root reused', fixture_sha256=sha(TEST), patch_sha256=sha(P / 'candidate.patch'), driver_sha256=sha(__file__), lock_sha256=sha(ROOT / 'package-lock.json'), npm_lock_sha256=sha(ROOT / 'node_modules/.package-lock.json'))
    require(elapsed < 300, 'Full actual source phase exceeded 300s; no Node/setup admitted')
    save()
    command = ['node', '--experimental-strip-types', '--test', '--test-concurrency=1', 'src/settings/agents/secretRemovePending.test.ts']
    red = run('red', command, 90, 768, expected=1)
    inspect('red', red)
    require(KIT.read_bytes() == baseline and sha(TEST) == receipt['fixture_sha256'], 'Baseline/fixture drift')
    subprocess.run(['git', 'apply', str(P / 'candidate.patch')], check=True)
    require(KIT.read_bytes() == candidate, 'Applied patch not exact original plus known Reveal prefix')
    receipt['candidate_kit_sha256'] = sha(KIT)
    green = run('green', command, 90, 768)
    inspect('green', green)
    run('adjacent', ['node', '--experimental-strip-types', '--test', '--test-concurrency=1', *ADJ], 120, 768)
    tap = (OUT / 'adjacent.stdout.txt').read_text()
    summary = {key: re.findall(r'^# ' + key + r' (\d+)$', tap, re.M) for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']}
    require(summary == {'tests': ['13'], 'pass': ['13'], 'fail': ['0'], 'cancelled': ['0'], 'skipped': ['0'], 'todo': ['0']}, 'Adjacent summary mismatch')
    receipt['adjacent_summary'] = summary
    run('typecheck', ['npx', '--no-install', 'tsc', '--noEmit'], 180, 1536)
    require(KIT.read_bytes() == candidate and sha(TEST) == receipt['fixture_sha256'], 'Tested final bytes drift')
    require(all(sha(ROOT / path) == expected for path, expected in receipt['adjacent_sha256'].items()), 'Adjacent input drift')
    require(sha(ROOT / 'package-lock.json') == receipt['lock_sha256'] and sha(ROOT / 'node_modules/.package-lock.json') == receipt['npm_lock_sha256'], 'Dependency lock drift')
    require(all(sha(ROOT / 'node_modules' / name / 'package.json') == value['sha256'] for name, value in versions.items()), 'Installed dependency drift')
    receipt['status'] = 'PASS'
except BaseException as error:
    receipt.update(status='FAILED_STOP_NO_RETRY', error=str(error))
finally:
    cleanup_start = time.time()
    for pgid in owned:
        try:
            os.killpg(pgid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    if baseline is not None and KIT.read_bytes() != baseline:
        KIT.write_bytes(baseline)
    if created_test:
        TEST.unlink(missing_ok=True)
    remaining = []
    for pgid in owned:
        try:
            os.killpg(pgid, 0)
            remaining.append(pgid)
        except ProcessLookupError:
            pass
    receipt.update(terminal=now(), inclusive_elapsed_seconds=time.time()-START, candidate_restored=baseline is None or KIT.read_bytes()==baseline, fixture_inactive=not TEST.exists(), own_process_groups_absent=not remaining, groups_remaining=remaining, cleanup_elapsed_seconds=time.time()-cleanup_start, release='EXPLICIT_RELEASE')
    save()
    print(json.dumps(receipt, indent=2))
    print('RELEASE ' + receipt['terminal'] + ' own_process_groups_absent=' + str(not remaining))
