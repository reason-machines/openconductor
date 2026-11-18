"""INERT until separate serialized SAME1F grouped-close RED admission. No installs/cleanup."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import resource
import shutil
import signal
import subprocess
import sys
import time

ROOT = Path.cwd()
HERE = ROOT / 'evidence/terminal/center-panel-close-history'
STATE = ROOT / '.oc-tmp/center-close-history-1f'
sha = lambda data: hashlib.sha256(data).hexdigest()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')
GIB = 2 ** 30


def members(pgid):
    rows = []
    for path in Path('/proc').glob('[0-9]*/stat'):
        try:
            fields = path.read_text().rsplit(')', 1)[1].split()
            if int(fields[2]) == pgid and fields[0] != 'Z':
                rows.append({'pid': int(path.parent.name), 'rss_bytes': int(fields[21]) * os.sysconf('SC_PAGE_SIZE')})
        except (OSError, ValueError, IndexError):
            pass
    return rows


def own_runtimes():
    rows = []
    for path in Path('/proc').glob('[0-9]*/comm'):
        try:
            if path.read_text().strip() in {'node', 'nodejs', 'npm', 'bun', 'cargo', 'rustc', 'vite', 'esbuild'} and (path.parent / 'cwd').resolve() == ROOT:
                rows.append(int(path.parent.name))
        except OSError:
            pass
    return rows


def main():
    admission = os.environ.get('SAME1F_GROUPED_CLOSE_RED_ADMISSION')
    assert admission, 'separate serialized RED admission missing'
    request_raw = (HERE / 'red-request.json').read_bytes()
    request = json.loads(request_raw)
    assert request['phase'] == 'GROUPED_CENTER_CLOSE_ORIGINAL_RED_ONLY'
    assert sha(Path(__file__).read_bytes()) == request['supervisor_sha256']
    assert set(os.sched_getaffinity(0)) == {0} and os.getpriority(os.PRIO_PROCESS, 0) >= 10
    output = STATE / 'runtime-red'
    assert not os.path.lexists(output), 'no overwrite/retry'
    output.mkdir()
    started = time.monotonic()
    child = None
    interrupted = []
    result = {'author': 'Conductor Rebuild', 'admission': admission, 'phase': request['phase'], 'actual_start_utc': now(), 'request_sha256': sha(request_raw), 'node_started': False, 'command': request['command']}
    def on_signal(signum, _frame):
        interrupted.append(signum)
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, on_signal)
    def verify():
        for pin in request['pins']:
            path = ROOT / pin['path']
            assert not path.is_symlink() and path.is_file(), pin['path']
            data = path.read_bytes()
            assert len(data) == pin['bytes'] and sha(data) == pin['sha256'], pin['path']
        return len(request['pins'])
    try:
        result['preflight_pins_passed'] = verify()
        result['own_runtime_before'] = own_runtimes()
        assert not result['own_runtime_before'], 'own runtime already active'
        result['minimum_free_bytes'] = shutil.disk_usage(ROOT).free
        assert result['minimum_free_bytes'] >= 4 * GIB, 'free disk below 4GiB'
        for path in request['product_paths']:
            assert (ROOT / path).read_bytes() == (STATE / 'baseline' / path).read_bytes(), 'product changed before original RED: ' + path
        # Fixed paths only: no cache stat, recursion, inventory or inode normalization.
        lock = json.loads((ROOT / 'package-lock.json').read_bytes())['packages']
        installed = json.loads((ROOT / 'node_modules/.package-lock.json').read_bytes())['packages']
        identities = []
        for name, expected in request['expected_packages'].items():
            key = 'node_modules/' + name
            manifest = ROOT / key / 'package.json'
            actual = json.loads(manifest.read_bytes())
            assert actual['version'] == lock[key]['version'] == installed[key]['version'] == expected
            for field in ('resolved', 'integrity'):
                assert lock[key][field] == installed[key][field], name + ':' + field
            identities.append({'name': name, 'version': expected, 'lock_resolution_and_sri_match': True})
        result['current_dependency_identities'] = identities
        result['dependency_identity_scope'] = 'Current fixed manifests/locks only; not historical byte-preservation proof or authorization to repair failed restore.'
        env = dict(os.environ, UV_THREADPOOL_SIZE='1', NODE_OPTIONS='--max-old-space-size=768', OC_GROUPED_CLOSE_SOURCE_ROOT=str(STATE / 'baseline'), OC_GROUPED_CLOSE_DEPENDENCY_ROOT=str(ROOT))
        def limits():
            resource.setrlimit(resource.RLIMIT_FSIZE, (1024 ** 2, 1024 ** 2))
        result['peak_sampled_group_rss_bytes'] = 0
        result['child_start_utc'] = now()
        with (output / 'stdout.tap').open('xb') as stdout, (output / 'stderr.txt').open('xb') as stderr:
            child = subprocess.Popen(request['command'], cwd=ROOT, env=env, stdout=stdout, stderr=stderr, start_new_session=True, preexec_fn=limits)
            result['node_started'] = True
            result['owned_pgid'] = child.pid
            while True:
                rows = members(child.pid)
                rss = sum(row['rss_bytes'] for row in rows)
                result['peak_sampled_group_rss_bytes'] = max(result['peak_sampled_group_rss_bytes'], rss)
                free = shutil.disk_usage(ROOT).free
                result['minimum_free_bytes'] = min(result['minimum_free_bytes'], free)
                size = sum((output / name).stat().st_size for name in ('stdout.tap', 'stderr.txt'))
                if interrupted or rss > 2 * GIB or free < 4 * GIB or size > 1024 ** 2 or time.monotonic() - started > 65:
                    raise RuntimeError('signal/resource/output/65s phase guard')
                if child.poll() is not None:
                    result['child_exit'] = child.returncode
                    break
                time.sleep(0.1)
        result['child_end_utc'] = now()
    except Exception as error:
        result['setup_or_guard_error'] = f'{type(error).__name__}: {error}'
    finally:
        if child is not None:
            for sig in (signal.SIGTERM, signal.SIGKILL):
                if not members(child.pid):
                    break
                try:
                    os.killpg(child.pid, sig)
                except ProcessLookupError:
                    pass
                try:
                    child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    pass
            if child.poll() is None:
                child.wait(timeout=2)
        result['survivors'] = [] if child is None else members(child.pid)
        result['own_runtime_after'] = own_runtimes()
        try:
            result['postflight_pins_passed'] = verify()
        except Exception as error:
            result['postflight_error'] = str(error)
        result['actual_release_utc'] = now()
        result['elapsed_seconds'] = round(time.monotonic() - started, 3)
        result['limits'] = {'foreground_s': 80, 'phase_s': 65, 'reap_s': 6, 'cpu': 0, 'nice': 10, 'uv_threads': 1, 'heap_MiB_per_Node': 768, 'sampled_group_rss_bytes': 2 * GIB, 'free_floor_bytes': 4 * GIB, 'output_bytes': 1024 ** 2, 'sample_s': 0.1, 'sampled_not_kernel_quota': True}
        result['outputs'] = [{'path': str(path.relative_to(ROOT)), 'bytes': len(path.read_bytes()), 'sha256': sha(path.read_bytes())} for path in output.iterdir() if path.is_file()]
        result['classification'] = 'NO_RUN' if not result['node_started'] else 'UNCLASSIFIED_READ_RAW_TAP'
        result['cache_touched'] = False
        result['cleanup_or_install_attempted'] = False
        (output / 'receipt.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result, indent=2))
    return 2 if result.get('setup_or_guard_error') or result.get('postflight_error') or result['survivors'] or result['own_runtime_after'] else result.get('child_exit', 2)


if __name__ == '__main__':
    sys.exit(main())
