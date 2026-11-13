import datetime, hashlib, json, os, re, signal, subprocess, time
from pathlib import Path

TOKEN = 'ACC_1F_STOP1217_CI2_20261113T0250'
OUT = Path('.oc-tmp/task-stop-1f/ci-followup') / TOKEN
OUT.mkdir(parents=True, exist_ok=False)
start = time.monotonic()
receipt = {'token': TOKEN, 'actual_start': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'bound_seconds': 900, 'phases': [], 'owned_groups': []}
children = []
expected = {
 'package.json': 'ae9c95902b3d7bab8a600f35e693637286b58235868b2203370c7667add3e9ac',
 'package-lock.json': '0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a',
 'src/components/ScriptsPanel.tsx': '092f31ca358a04510d9fd77e56dd0a6b65eed9e883d11d9208639ef13f9444f5',
 'src/scripts/runActionErrorContext.test.ts': '604e459b1186bad03190014a970473a564341fa9f18414d9d33253fd4cea30cb',
 'src/scripts/runCompletion.test.ts': '0beacef84397ad22e65d674fc56ebdc446a34a600faac165a357ca8ea2601fee',
 'src/scripts/runTaskMenu.test.ts': '46b95bf14fa8486bfa8537ef07c9b8fcc5322b39b8f246756efc26a3f5fba01e',
}

def verify():
    actual = {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in expected}
    assert actual == expected, actual
    return actual

def run(name, argv, heap, bound):
    assert time.monotonic() - start + bound + 60 < 900, 'insufficient remaining bound'
    env = os.environ.copy()
    env['NODE_OPTIONS'] = '--max-old-space-size=' + str(heap)
    before = time.monotonic()
    with (OUT / (name + '.stdout')).open('w') as stdout, (OUT / (name + '.stderr')).open('w') as stderr:
        proc = subprocess.Popen(argv, stdout=stdout, stderr=stderr, env=env, start_new_session=True)
        children.append(proc.pid)
        receipt['owned_groups'].append(proc.pid)
        try:
            code = proc.wait(timeout=bound)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
            code = 124
    phase = {'name': name, 'argv': argv, 'node_options': env['NODE_OPTIONS'], 'exit_code': code, 'seconds': round(time.monotonic()-before, 3)}
    receipt['phases'].append(phase)
    print(json.dumps(phase), flush=True)
    assert code == 0, name + ' failed; no retry'
    return (OUT / (name + '.stdout')).read_text()

try:
    receipt['source_hashes_before'] = verify()
    pairs = [
      ('runCompletion.test.ts', 'actual Run panel displays a busy Dev admitted after the picked Test finishes and Stop keeps the pick', 'actual Run panel stops only the displayed busy Dev and keeps the picked Test', '["run_script_start", "test"], ["run_script_stop", null],', '["run_script_start", "test"], ["run_script_stop", "dev"],'),
      ('runTaskMenu.test.ts', 'actual primary Run and Stop retain their existing script commands', 'actual primary Run retains its command and Stop targets the displayed task', '{ name: "run_script_stop", args: { workspaceId: workspace.id, scriptId: null } },', '{ name: "run_script_stop", args: { workspaceId: workspace.id, scriptId: "dev" } },'),
    ]
    for file, old, new, before, after in pairs:
        original = (OUT.parent / ('original-' + file)).read_text()
        assert original.count(old) == original.count(before) == 1
        assert Path('src/scripts', file).read_text() == original.replace(old, new).replace(before, after)
    assert time.monotonic() - start < 20
    receipt['source_qualification_seconds'] = round(time.monotonic() - start, 3)
    (OUT / 'start.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('ACTUALSTART ' + receipt['actual_start'] + ' ' + TOKEN, flush=True)
    if not Path('node_modules').is_dir():
        run('setup', ['nice', '-n', '19', 'timeout', '--signal=TERM', '--kill-after=5s', '600s', 'npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], 1024, 605)
    verify()
    output = run('five-files', ['nice', '-n', '19', 'timeout', '--signal=TERM', '--kill-after=5s', '60s', 'node', '--test', '--test-concurrency=1', '--test-reporter=tap', 'src/scripts/runCompletion.test.ts', 'src/scripts/runTaskMenu.test.ts', 'src/scripts/runActionErrorContext.test.ts', 'src/scripts/runSelectionHistory.test.ts', 'src/scripts/runTab.test.ts'], 512, 65)
    counts = {key: int(re.search(r'^# ' + key + r' (\d+)\s*$', output, re.M).group(1)) for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']}
    receipt['counts'] = counts
    assert counts == {'tests': 41, 'pass': 41, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}, counts
    run('tsc', ['nice', '-n', '19', 'timeout', '--signal=TERM', '--kill-after=5s', '120s', 'node', 'node_modules/typescript/bin/tsc', '--noEmit'], 2048, 125)
    receipt['source_hashes_after'] = verify()
    receipt['result'] = 'passed'
except BaseException as error:
    receipt['result'] = 'stopped'
    receipt['error'] = str(error)
finally:
    alive = []
    for pid in children:
        try:
            os.killpg(pid, 0)
        except ProcessLookupError:
            continue
        os.killpg(pid, signal.SIGTERM)
        time.sleep(0.1)
        try:
            os.killpg(pid, 0)
            os.killpg(pid, signal.SIGKILL)
        except ProcessLookupError:
            continue
        try:
            os.killpg(pid, 0)
            alive.append(pid)
        except ProcessLookupError:
            pass
    receipt['ownjobs'] = alive
    receipt['inclusive_seconds'] = round(time.monotonic() - start, 3)
    receipt['released_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    receipt['released'] = not alive
    (OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('RELEASE ' + json.dumps(receipt), flush=True)
raise SystemExit(0 if receipt['result'] == 'passed' and receipt['released'] else 1)
