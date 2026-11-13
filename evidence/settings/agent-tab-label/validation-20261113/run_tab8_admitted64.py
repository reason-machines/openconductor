import datetime
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

ROOT = Path.cwd()
OUT = ROOT / '.ara-state/tab8-admitted-20261113T0226'
OUT.mkdir(exist_ok=True)
START = json.loads((OUT / 'start.json').read_text())
START_MONO = START['monotonic']
BASE = ROOT / '.rea-work/settings-tab-label64/source-v1'
TOKEN = 'ACC_64_TAB8_CURRENT_MAIN_20261113T0226'
records = []
non_test = 0.0
active = set()
backups = {}
qualified_green = False
main = None
head = None
status = 'STOP'
error = None

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def remaining():
    return 360 - (time.monotonic() - START_MONO)

def require(ok, message):
    if not ok:
        raise RuntimeError(message)

def run(name, argv, expected=0, cap=45, env=None, test_phase=False):
    global non_test
    require(remaining() > 60, 'Cleanup reserve reached before ' + name)
    if not test_phase:
        cap = min(cap, 60 - non_test, remaining() - 60)
    require(cap > 0, 'Shared non-test cap exhausted')
    begin = time.monotonic()
    log = {'name': name, 'argv': argv, 'started_at': now(), 'timeout_s': cap}
    proc = None
    with (OUT / (name + '.stdout')).open('wb') as stdout, (OUT / (name + '.stderr')).open('wb') as stderr:
        proc = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
        active.add(proc.pid)
        log['pid'] = proc.pid
        try:
            code = proc.wait(timeout=cap)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
            code = proc.returncode
            log['timed_out'] = True
        finally:
            active.discard(proc.pid)
    elapsed = time.monotonic() - begin
    if not test_phase:
        non_test += elapsed
    log.update(exit_code=code, elapsed_s=elapsed, finished_at=now(), stdout_sha256=sha(OUT / (name + '.stdout')), stderr_sha256=sha(OUT / (name + '.stderr')))
    records.append(log)
    (OUT / 'phase-records.json').write_text(json.dumps(records, indent=2) + '\n')
    require(not log.get('timed_out'), name + ' timed out')
    require(code == expected, name + ' unexpected exit ' + str(code))
    return (OUT / (name + '.stdout')).read_text()

try:
    setup = time.monotonic()
    run('normal-main-merge', ['git', 'merge', '--no-edit', 'origin/main'])
    main = run('main-identity', ['git', 'rev-parse', 'origin/main']).strip()
    tree = run('main-tree', ['git', 'rev-parse', 'origin/main^{tree}']).strip()
    head = run('head-identity', ['git', 'rev-parse', 'HEAD']).strip()
    binding = json.loads((BASE / 'binding.json').read_text())
    for path, expected in binding['source_pins'].items():
        actual = subprocess.check_output(['git', 'show', main + ':' + path])
        require(hashlib.sha256(actual).hexdigest() == expected, 'Current main source changed: ' + path)
    old_guard = ROOT / '.rea-work/settings-tab-label64/main-rebind-a66/verify_rebind.py'
    guard = OUT / 'verify_current.py'
    text = old_guard.read_text().replace('EXPECTED_MAIN = "a66b72e9fc3790a0c93ac614a901da727929c5d9"', 'EXPECTED_MAIN = ' + json.dumps(main)).replace('EXPECTED_TREE = "c1908e66d1a2918d5b855e6939be21d58568ca71"', 'EXPECTED_TREE = ' + json.dumps(tree))
    require(text != old_guard.read_text(), 'Source-guard amendment not applied')
    guard.write_text(text)
    (OUT / 'source-guard-amendment.json').write_text(json.dumps({'token': TOKEN, 'main': main, 'tree': tree, 'head': head, 'original_guard_sha256': sha(old_guard), 'actual_guard_sha256': sha(guard), 'relevant_pins': 21, 'amendment': 'main and committed tree identities only', 'original_packet_sha256': sha(BASE.parent / 'source-v1-ready.tar.gz')}, indent=2) + '\n')
    run('baseline-guard', ['python3', '-B', str(guard), '--phase', 'baseline'])
    for path in binding['candidate_sources']:
        backups[path] = (ROOT / path).read_bytes()
        target = OUT / 'baseline' / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(backups[path])
    setup_elapsed = time.monotonic() - setup
    non_test = max(non_test, setup_elapsed)
    require(setup_elapsed <= 45, 'Setup exceeded 45-second cap')
    env = dict(os.environ, NODE_ENV='development', NODE_OPTIONS='--max-old-space-size=768', AGENT_TABS_SOURCE_ROOT=str(ROOT), ONBOARDING_DOM_DEPS=str(ROOT / binding['isolated_prefix']))
    argv = ['timeout', '--signal=TERM', '--kill-after=5s', '115s', 'nice', '-n', '19', 'node', '--test', '--test-concurrency=1', '--test-reporter=tap', str(BASE / 'agentTabLabel.dom.test.mjs')]
    (OUT / 'literal-input.json').write_text(json.dumps({'argv': argv, 'environment_overrides': {key: env[key] for key in ['NODE_ENV','NODE_OPTIONS','AGENT_TABS_SOURCE_ROOT','ONBOARDING_DOM_DEPS']}, 'fixture_sha256': sha(BASE / 'agentTabLabel.dom.test.mjs'), 'inspector_sha256': sha(BASE / 'inspect_tap.py')}, indent=2) + '\n')
    run('red', argv, expected=1, cap=120, env=env, test_phase=True)
    run('red-inspection', ['python3', '-B', str(BASE / 'inspect_tap.py'), '--phase', 'red', '--exit-code', '1', str(OUT / 'red.stdout')])
    run('candidate-apply-check', ['git', 'apply', '--check', str(BASE / 'product.patch')])
    run('candidate-apply', ['git', 'apply', str(BASE / 'product.patch')])
    run('candidate-guard', ['python3', '-B', str(guard), '--phase', 'candidate'])
    require(remaining() >= 180, 'Less than 180 seconds remain before GREEN')
    run('green', argv, expected=0, cap=120, env=env, test_phase=True)
    run('green-inspection', ['python3', '-B', str(BASE / 'inspect_tap.py'), '--phase', 'green', '--exit-code', '0', str(OUT / 'green.stdout')])
    run('final-candidate-guard', ['python3', '-B', str(guard), '--phase', 'candidate'])
    run('diff-check', ['git', 'diff', '--check'])
    require(non_test <= 60, 'Shared non-test cap exceeded')
    qualified_green = True
    status = 'VALID_RED_TO_GREEN'
except Exception as exc:
    error = str(exc)
finally:
    cleanup_start = time.monotonic()
    restore = []
    for pid in list(active):
        try:
            os.killpg(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    active.clear()
    if not qualified_green:
        binding = json.loads((BASE / 'binding.json').read_text())
        for path, original in backups.items():
            current = ROOT / path
            if sha(current) == binding['candidate_sources'][path]:
                current.write_bytes(original)
                restore.append({'path': path, 'state': 'own candidate restored to baseline'})
            elif current.read_bytes() == original:
                restore.append({'path': path, 'state': 'baseline unchanged'})
            else:
                restore.append({'path': path, 'state': 'not overwritten: unknown concurrent bytes'})
    protected = {path: sha(ROOT / path) == expected for path, expected in json.loads((BASE / 'binding.json').read_text())['protected'].items()}
    receipt = {'author': 'Conductor Rebuild', 'token': TOKEN, 'status': status, 'error': error, 'actual_start': START['utc'], 'terminal_release': now(), 'elapsed_s': time.monotonic() - START_MONO, 'shared_non_test_s': non_test, 'cleanup_s': time.monotonic() - cleanup_start, 'main': main, 'baseline_head': head, 'qualified_green': qualified_green, 'restoration': restore, 'protected_unchanged': protected, 'ownjobs': sorted(active), 'servers': [], 'support': [], 'support_disposition': 'retained own isolated prefix unchanged; no support process started', 'RSS': 'not sampled; peak RSS unverified', 'phases': records, 'verification_gaps': ['publication wrapper local NOT_RUN', 'typecheck/build NOT_RUN locally', 'browser/native/provider/package NOT_RUN']}
    (OUT / 'terminal-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2), flush=True)
    if not qualified_green:
        raise SystemExit(1)
