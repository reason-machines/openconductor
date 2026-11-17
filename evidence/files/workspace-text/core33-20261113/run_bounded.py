import datetime
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path('.oc-tmp/core33-validation-20261113T0122')
TOKEN = 'ACC_DE6_CORE33_CANDIDATE_20261113T0122'
START = datetime.datetime.fromisoformat('2026-11-13T01:27:58+00:00').timestamp()
COMMANDS = {
    'setup': (['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], 300, 2048, 1024),
    'rust': (['cargo', 'test', '--manifest-path', 'src-tauri/Cargo.toml', 'workspace_file::tests'], 1800, 3072, None),
    'node': (['node', '--experimental-strip-types', '--test', '--test-concurrency=1', 'src/features/files/readText.test.ts', 'src/features/files/WorkspaceFileView.test.ts', 'src/features/files/readMarkdown.test.ts', 'src/features/files/filePreviewWiring.test.ts', 'src/features/diff/editorContents.test.ts', 'src/features/diff/EditInViewer.test.ts', 'src/features/diff/copyFile.test.ts', 'src/features/diff/wholeFileRefresh.test.ts'], 120, 2048, 1024),
    'typecheck': (['npm', 'run', 'typecheck'], 180, 2048, 1536),
}

def stat(pid):
    try:
        text = Path(f'/proc/{pid}/stat').read_text()
        fields = text[text.rfind(')') + 2:].split()
        return {'pid': pid, 'start': fields[19], 'state': fields[0], 'rss': int(fields[21]) * os.sysconf('SC_PAGE_SIZE')}
    except (OSError, ValueError, IndexError):
        return None

def descendants(pid):
    result = []
    queue = [pid]
    seen = set()
    while queue:
        item = queue.pop()
        if item in seen:
            continue
        seen.add(item)
        row = stat(item)
        if row:
            result.append(row)
        try:
            queue.extend(map(int, Path(f'/proc/{item}/task/{item}/children').read_text().split()))
        except OSError:
            pass
    return result

stage = sys.argv[1]
argv, limit, rss_mb, heap = COMMANDS[stage]
if time.time() + limit + 65 > START + 2700:
    raise SystemExit('STOP: insufficient inclusive allocation remaining for stage and cleanup')
env = os.environ.copy()
env['CARGO_BUILD_JOBS'] = '1'
env['RUST_TEST_THREADS'] = '1'
if heap:
    env['NODE_OPTIONS'] = f'--max-old-space-size={heap}'
actual = ['nice', '-n', '19'] + argv
started = time.time()
peak = 0
known = {}
reason = None
with (ROOT / f'{stage}.stdout').open('wb') as stdout, (ROOT / f'{stage}.stderr').open('wb') as stderr:
    process = subprocess.Popen(actual, stdout=stdout, stderr=stderr, env=env, start_new_session=True)
    initial = stat(process.pid)
    def stop():
        current = stat(process.pid)
        if current and initial and current['start'] == initial['start']:
            os.killpg(process.pid, signal.SIGTERM)
    try:
        while process.poll() is None:
            rows = descendants(process.pid)
            known.update({row['pid']: row['start'] for row in rows})
            peak = max(peak, sum(row['rss'] for row in rows))
            if peak > rss_mb * 1024 * 1024:
                reason = 'RSS_BUDGET_STOP'
            elif time.time() - started > limit:
                reason = 'WALL_BOUND_STOP'
            if reason:
                stop()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    current = stat(process.pid)
                    if current and initial and current['start'] == initial['start']:
                        os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=2)
                break
            time.sleep(0.25)
    except BaseException:
        stop()
        process.wait(timeout=5)
        raise
remaining = []
for pid, identity in known.items():
    row = stat(pid)
    if row and row['start'] == identity and row['state'] != 'Z':
        remaining.append(row)
result = {
    'grant': TOKEN, 'stage': stage, 'argv': actual,
    'environment_additions': {'CARGO_BUILD_JOBS': '1', 'RUST_TEST_THREADS': '1', **({'NODE_OPTIONS': env['NODE_OPTIONS']} if heap else {})},
    'start_utc': datetime.datetime.fromtimestamp(started, datetime.timezone.utc).isoformat(),
    'elapsed_seconds': time.time() - started, 'exit': process.returncode,
    'stop_reason': reason, 'wall_bound_seconds': limit, 'kill_grace_seconds': 5,
    'rss_tree_peak_sampled_bytes': peak, 'rss_budget_bytes': rss_mb * 1024 * 1024,
    'accounting': 'PARTIAL: sampled owned live /proc descendants at 250ms; no private cgroup memory controller exposed; not exact peak or proof of private capacity',
    'remaining_owned_runtime': remaining, 'baseline': 'NOT_DEFINED/NOT_AUTHORED',
    'log_sha256': {f'{stage}.{ext}': hashlib.sha256((ROOT / f'{stage}.{ext}').read_bytes()).hexdigest() for ext in ('stdout', 'stderr')},
}
(ROOT / f'{stage}.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2), flush=True)
for ext in ('stdout', 'stderr'):
    lines = (ROOT / f'{stage}.{ext}').read_text(errors='replace').splitlines()
    print(f'\n{stage}.{ext} LAST LINES\n' + '\n'.join(lines[-30:]))
