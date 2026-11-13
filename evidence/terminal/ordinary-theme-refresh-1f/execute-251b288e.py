from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys

OUT = Path('.oc-tmp/ordinary-theme-refresh-proof/syntax-repair-v2')
ROOT = Path.cwd().resolve()
RECEIPT = OUT / 'ordinary-theme-refresh-1f-v2-grant.json'
CONTRACT = json.loads((OUT / 'candidate.json').read_text())
PREFLIGHT = json.loads((OUT / 'preflight-b9d3668c.json').read_text())

def now():
    return datetime.now(timezone.utc).isoformat()

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()

def optional(path):
    try:
        return Path(path).read_text().strip()
    except OSError as error:
        return {'unavailable': type(error).__name__}

def psi(path):
    raw = optional(path)
    if not isinstance(raw, str):
        return raw
    return {parts[0]: {key: int(value) if key == 'total' else float(value) for key, value in (pair.split('=') for pair in parts[1:])} for parts in (line.split() for line in raw.splitlines())}

def snapshot():
    membership = optional('/proc/self/cgroup')
    cgroot = Path('/sys/fs/cgroup')
    if isinstance(membership, str):
        unified = next((line.split(':', 2)[2] for line in membership.splitlines() if line.startswith('0::')), None)
        if unified and unified != '/' and (cgroot / unified.lstrip('/')).is_dir():
            cgroot = cgroot / unified.lstrip('/')
    ancestors = set()
    pid = os.getpid()
    while pid > 1 and pid not in ancestors:
        ancestors.add(pid)
        try:
            pid = int(next(row.split()[1] for row in Path(f'/proc/{pid}/status').read_text().splitlines() if row.startswith('PPid:')))
        except (OSError, StopIteration, ValueError):
            break
    own = []
    infrastructure = []
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit() or int(entry.name) in ancestors:
            continue
        try:
            cwd = (entry / 'cwd').resolve(strict=True)
            if cwd != ROOT and ROOT not in cwd.parents:
                continue
            job = {'pid': int(entry.name), 'name': (entry / 'comm').read_text().strip()}
            (infrastructure if job['name'] in {'bwrap', 'socat'} else own).append(job)
        except (OSError, RuntimeError):
            continue
    memory = {}
    for row in Path('/proc/meminfo').read_text().splitlines():
        key, value = row.split(':', 1)
        if key in {'MemTotal', 'MemAvailable', 'MemFree', 'SwapTotal', 'SwapFree'}:
            memory[key + '_KiB'] = int(value.strip().split()[0])
    usage = shutil.disk_usage(Path.home())
    names = ['memory.max', 'memory.high', 'memory.current', 'memory.swap.max', 'memory.swap.current', 'memory.events', 'memory.events.local', 'cpu.max', 'cpu.stat', 'cpuset.cpus.effective', 'pids.max', 'pids.current', 'io.max']
    return {'at_utc': now(), 'memory_psi': psi('/proc/pressure/memory'), 'cgroup_memory_psi': psi(cgroot / 'memory.pressure'), 'cgroup_membership': membership, 'cgroup_path': str(cgroot), 'cgroup_limits': {name: optional(cgroot / name) for name in names}, 'memory': memory, 'disk_home_free_bytes': usage.free, 'own_jobs': own, 'infrastructure': infrastructure}

def pins():
    paths = list(PREFLIGHT['sources']) + list(PREFLIGHT['adjacent_hashes']) + ['src/features/terminal/ordinaryThemeRefresh.test.ts']
    result = {path: sha(path) for path in paths}
    result['original_fixture'] = sha(OUT / 'ordinaryThemeRefresh.original-f1a6c42f.test.ts.txt')
    return result

def save(receipt):
    RECEIPT.write_text(json.dumps(receipt, indent=2) + '\n')

if __name__ == '__main__':
    phase = sys.argv[1]
    if phase == 'red':
        assert not RECEIPT.exists(), 'This grant has already been started; do not replay'
        receipt = {'author': 'Conductor Rebuild', 'grant_message': '251b288e-971f-46fd-946d-c5443d5426b6', 'row': 'a9d4335e', 'computer_id': '00637189-5c55-416e-b457-ed7419fb739a', 'started_at': now(), 'head': git('rev-parse', 'HEAD'), 'branch': git('branch', '--show-current'), 'containing_main': PREFLIGHT['current_main'], 'pre_pins': pins(), 'phases': {}, 'scope': 'ordinary terminal theme syntax-v2 only; no OSC8 or Spotlight execution'}
        reasons = []
        if receipt['head'] != PREFLIGHT['head'] or receipt['branch'] != CONTRACT['branch']:
            reasons.append('source HEAD/branch drift')
        if git('diff', '--name-only') or git('diff', '--cached', '--name-only'):
            reasons.append('tracked worktree/index drift')
        for path, expected in PREFLIGHT['sources'].items():
            if receipt['pre_pins'][path] != expected['sha256']:
                reasons.append('source pin drift: ' + path)
        for path, expected in PREFLIGHT['adjacent_hashes'].items():
            if receipt['pre_pins'][path] != expected:
                reasons.append('neighbor drift: ' + path)
        if receipt['pre_pins']['src/features/terminal/ordinaryThemeRefresh.test.ts'] != CONTRACT['candidate_fixture_sha256'] or receipt['pre_pins']['original_fixture'] != CONTRACT['original_fixture_sha256']:
            reasons.append('frozen fixture drift')
        for name, expected in PREFLIGHT['dependencies'].items():
            if sha(Path('node_modules') / name / 'package.json') != expected['manifest_sha256']:
                reasons.append('installed dependency manifest drift: ' + name)
        receipt['immediate_snapshot'] = snapshot()
        s = receipt['immediate_snapshot']
        if not {'some', 'full'} <= s['memory_psi'].keys() or not {'some', 'full'} <= s['cgroup_memory_psi'].keys():
            reasons.append('required PSI metrics unreadable')
        else:
            if s['memory_psi']['full']['avg10'] >= 1 or s['memory_psi']['full']['avg60'] >= 2:
                reasons.append('host memory full PSI threshold exceeded')
            if any(s['cgroup_memory_psi'][kind][avg] > 0 for kind in ['some', 'full'] for avg in ['avg10', 'avg60', 'avg300']):
                reasons.append('own cgroup pressure')
        if s['own_jobs']:
            reasons.append('other own runtime job')
        if reasons:
            receipt['stop_reasons'] = reasons
            receipt['release_at'] = now()
            receipt['release_snapshot'] = s
            receipt['state'] = 'STOPPED_BEFORE_NODE_RELEASED'
            save(receipt)
            print(json.dumps(receipt, indent=2))
            sys.exit(2)
        save(receipt)
    else:
        receipt = json.loads(RECEIPT.read_text())
        assert 'release_at' not in receipt, 'Grant released; no replay'
        assert phase not in receipt['phases'], 'Phase already ran; no retry'
        assert receipt['pre_pins']['src/features/terminal/ordinaryThemeRefresh.test.ts'] == sha('src/features/terminal/ordinaryThemeRefresh.test.ts')
        assert receipt['pre_pins']['package-lock.json'] == sha('package-lock.json')
    if phase == 'release':
        receipt['release_snapshot'] = snapshot()
        receipt['post_pins'] = pins()
        receipt['release_at'] = now()
        receipt['state'] = sys.argv[2]
        save(receipt)
        print(json.dumps(receipt, indent=2))
        sys.exit(0)
    assert phase in {'red', 'green', 'adjacent'}
    command = CONTRACT['requested_commands']['adjacent' if phase == 'adjacent' else 'baseline_and_identical_green']
    record = {'command': command, 'started_at': now(), 'head': git('rev-parse', 'HEAD'), 'pins': pins()}
    receipt['phases'][phase] = record
    save(receipt)
    output = OUT / (phase + '-251b288e.tap')
    with output.open('wb') as handle:
        completed = subprocess.run(shlex.split(command), stdout=handle, stderr=subprocess.STDOUT)
    record.update({'ended_at': now(), 'exit_code': completed.returncode, 'output': str(output), 'output_sha256': sha(output)})
    text = output.read_text()
    record['summary'] = {name: int(value) for name, value in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', text, re.M)}
    record['not_ok'] = re.findall(r'^not ok \d+ - (.+)$', text, re.M)
    record['ok'] = re.findall(r'^ok \d+ - (.+)$', text, re.M)
    record['resource_or_timeout_warning'] = bool(re.search(r'heap out of memory|out of memory|OOM|timed out|resourcewarning', text, re.I)) or completed.returncode in {124, 137, -9}
    save(receipt)
    print(json.dumps({'phase': phase, **record}, indent=2))
