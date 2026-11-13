import datetime, hashlib, json, os, pathlib, re, subprocess, time

ROOT = pathlib.Path.cwd()
OUT = pathlib.Path(__file__).resolve().parent
START = time.monotonic()
START_WALL = datetime.datetime.now(datetime.timezone.utc)
DEADLINE = time.time() + 1800
CANDIDATE = 'eb463ce9ce4cd1d6e316582057d4a77b290a0060'
OLD_BASE = 'b35aeedc5ff71381e2f740367233462b500810c9'
TEST = ROOT / 'src/components/homeSidebarHint.test.ts'
HOME = ROOT / 'src/components/HomeScreen.tsx'
LOCK = ROOT / 'package-lock.json'
sha = lambda data: hashlib.sha256(data).hexdigest()
read_git = lambda rev, path: subprocess.check_output(['git', 'show', f'{rev}:{path}'])
receipt = {'grant': 'ACC_271_HOME_TOOLTIP10_FIXTURE_V2_20261113T0300', 'actual_start': START_WALL.isoformat(), 'inclusive_budget_seconds': 1800, 'phases': [], 'status': 'RUNNING'}
candidate_home = read_git(CANDIDATE, 'src/components/HomeScreen.tsx')
lock_hash = sha(LOCK.read_bytes())
test_hash = sha(TEST.read_bytes())

def save():
    (OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')

def phase(name, seconds, heap, argv):
    assert time.time() + seconds + 5 < DEADLINE, f'INSUFFICIENT_INCLUSIVE_BUDGET:{name}'
    command = ['nice', '-n19', 'timeout', '--signal=TERM', '--kill-after=5s', f'{seconds}s', *argv]
    env = os.environ.copy()
    env['NODE_OPTIONS'] = f'--max-old-space-size={heap}'
    entry = {'phase': name, 'argv': command, 'NODE_OPTIONS': env['NODE_OPTIONS'], 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    then = time.monotonic()
    with (OUT / f'{name}.stdout.txt').open('w') as stdout, (OUT / f'{name}.stderr.txt').open('w') as stderr:
        result = subprocess.run(command, env=env, stdout=stdout, stderr=stderr)
    entry.update(exit_code=result.returncode, duration_seconds=round(time.monotonic()-then, 3), ended_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), stdout=f'{name}.stdout.txt', stderr=f'{name}.stderr.txt')
    receipt['phases'].append(entry)
    save()
    print(json.dumps(entry), flush=True)
    output = (OUT / entry['stdout']).read_text()
    errors = (OUT / entry['stderr']).read_text()
    print(output[-18000:], flush=True)
    print(errors[-3000:], flush=True)
    return result.returncode, output, errors

try:
    assert subprocess.check_output(['git', 'branch', '--show-current'], text=True).strip() == 'reason/openconductor-sol-home-s-27102e36'
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == CANDIDATE
    assert not subprocess.check_output(['git', 'diff', '--name-only'], text=True).strip()
    assert not subprocess.check_output(['git', 'diff', '--cached', '--name-only'], text=True).strip()
    base = subprocess.check_output(['git', 'rev-parse', 'origin/main'], text=True).strip()
    receipt['base'] = base
    assert base == 'e6836acf258d6b526b5fb1a6d057aa8ee017dc2e'
    changed = subprocess.check_output(['git', 'diff', '--name-only', OLD_BASE, base], text=True).splitlines()
    assert changed == ['.github/workflows/ci.yml', 'src-tauri/src/agent/codex_mcp_status_tests.rs'], f'UNRELATED_SOURCE_CHANGE_STOP:{changed}'
    assert test_hash == 'd1c833003f89e3ff475f12ccdb3f72387387c7b418cf12b786b2115bf44859ce'
    assert HOME.read_bytes() == candidate_home
    assert read_git(base, 'src/components/HomeScreen.tsx') == read_git(OLD_BASE, 'src/components/HomeScreen.tsx')
    assert LOCK.read_bytes() == read_git(base, 'package-lock.json')
    scope = subprocess.check_output(['git', 'diff', '--name-only', OLD_BASE, CANDIDATE], text=True).splitlines()
    assert all(p.startswith('evidence/home-toggle-tooltip/') or p in ['src/components/HomeScreen.tsx', 'src/components/homeSidebarHint.test.ts'] for p in scope)
    subprocess.run(['git', 'branch', 'preserved/same271-tooltip-eb463ce9c-v2', CANDIDATE], check=True)
    result = subprocess.run(['git', '-c', 'gc.auto=0', 'rebase', 'origin/main'], text=True, capture_output=True)
    (OUT / 'source-rebase.stdout.txt').write_text(result.stdout)
    (OUT / 'source-rebase.stderr.txt').write_text(result.stderr)
    assert result.returncode == 0, 'REBASE_SETUP_FAILED_STOP'
    assert HOME.read_bytes() == candidate_home and sha(TEST.read_bytes()) == test_hash
    assert time.monotonic() - START < 60, 'SOURCE_QUALIFICATION_BUDGET_STOP'
    receipt.update(source_changes_since_old_base=changed, standalone_scope=scope, candidate_before=CANDIDATE, candidate_after_rebase=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), source_duration_seconds=round(time.monotonic()-START,3), test_sha256=test_hash, lock_sha256=lock_hash)
    HOME.write_bytes(read_git(base, 'src/components/HomeScreen.tsx'))
    assert subprocess.check_output(['git', 'diff', '--name-only'], text=True).splitlines() == ['src/components/HomeScreen.tsx']
    save()
    if not (ROOT / 'node_modules').is_dir():
        code, _, _ = phase('npm-ci', 600, 1024, ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'])
        assert code == 0, 'DEPENDENCY_SETUP_FAILED_STOP'
    else:
        receipt['dependency_setup'] = 'NOT_RUN_OWN_UNCHANGED_LOCK_DEPENDENCIES_PRESENT'
    code, output, errors = phase('red', 90, 768, ['node', '--test', '--test-concurrency=1', 'src/components/homeSidebarHint.test.ts'])
    expected = [
        'Home sidebar toggle retains its default hint and click action',
        'mounted Home sidebar hint follows persisted primary and additional shortcuts after hydration',
        'mounted Home sidebar hint follows live provider changes and reset without parent rerender',
        'Home sidebar hint replaces defaults with a single saved shortcut',
        'Home sidebar hint keeps defaults when the persisted setting is malformed',
        'Home sidebar toggle has no competing native title',
        'Home sidebar tooltip dismisses on pointer leave',
        'Home sidebar tooltip dismisses on Escape',
    ]
    actual = re.findall(r'^not ok \d+ - (.+)$', output, re.M)
    assert code == 1 and actual == expected, f'UNEXPECTED_RED_FAILURES_STOP:{actual}'
    assert re.search(r'^# tests 10$', output, re.M) and re.search(r'^# pass 2$', output, re.M) and re.search(r'^# fail 8$', output, re.M), 'INCOMPLETE_RED_STOP'
    assert not re.search(r'TypeError|ReferenceError|SyntaxError|Cannot find module|MODULE_NOT_FOUND', output+errors), 'RED_SETUP_FAILURE_STOP'
    assert output.count('hover must render the app tooltip') == 7, 'UNEXPECTED_RED_CAUSE_STOP'
    receipt['red_classification'] = '8 expected assertion failures: seven missing app tooltip; one retained native title. Two controls pass.'
    HOME.write_bytes(candidate_home)
    assert sha(TEST.read_bytes()) == test_hash
    code, output, _ = phase('green', 90, 768, ['node', '--test', '--test-concurrency=1', 'src/components/homeSidebarHint.test.ts'])
    assert code == 0 and re.search(r'^# tests 10$', output, re.M) and re.search(r'^# pass 10$', output, re.M) and re.search(r'^# fail 0$', output, re.M), 'GREEN_FAILED_OR_INCOMPLETE_STOP'
    code, output, _ = phase('adjacent', 120, 768, ['node', '--test', '--test-concurrency=1', 'src/components/tooltipPlacement.test.ts', 'src/keybindings/overrides.test.ts', 'src/components/allWorkspacesSidebarHint.test.ts'])
    assert code == 0 and re.search(r'^# fail 0$', output, re.M), 'ADJACENT_FAILED_STOP'
    code, _, _ = phase('typecheck', 180, 1536, ['npm', 'run', 'typecheck'])
    assert code == 0, 'TYPECHECK_FAILED_STOP'
    code, _, _ = phase('build', 480, 1536, ['npm', 'run', 'build'])
    assert code == 0, 'BUILD_FAILED_STOP'
    assert sha(TEST.read_bytes()) == test_hash and sha(LOCK.read_bytes()) == lock_hash
    receipt['status'] = 'PASS'
except BaseException as error:
    receipt['status'] = 'STOPPED'
    receipt['stop_reason'] = str(error)
    print('TERMINAL_STOP', repr(error), flush=True)
finally:
    HOME.write_bytes(candidate_home)
    receipt['candidate_restored'] = HOME.read_bytes() == candidate_home
    receipt['test_unchanged'] = sha(TEST.read_bytes()) == test_hash
    receipt['lock_unchanged'] = sha(LOCK.read_bytes()) == lock_hash
    receipt['driver_duration_seconds'] = round(time.monotonic()-START, 3)
    receipt['ended_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    process_check = subprocess.check_output(['ps', '-eo', 'pid,ppid,comm,args'], text=True)
    (OUT / 'owned-process-check.txt').write_text(process_check)
    receipt['owned_process_check'] = 'owned-process-check.txt'
    save()
    print(json.dumps(receipt, indent=2), flush=True)

raise SystemExit(0 if receipt['status'] == 'PASS' else 1)
