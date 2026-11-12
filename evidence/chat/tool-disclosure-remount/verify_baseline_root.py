"""Verify archived source bytes without executing JavaScript or native code."""
import gzip
import hashlib
import json
import pathlib
import posixpath
import re
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parents[3]
FIXTURE = REPO / 'tests/chat-disclosure'
sha = lambda data: hashlib.sha256(data).hexdigest()
policy = json.loads((FIXTURE / 'static-import-closure.json').read_text())


def historical(path):
    return subprocess.check_output(['git', 'show', policy['main'] + ':' + path], cwd=REPO)


entries = set(subprocess.check_output(
    ['git', 'ls-tree', '-r', '--name-only', policy['main'], '--', 'src'], cwd=REPO, text=True,
).splitlines())
import_paths = []
for path in policy['sources']:
    for name in re.findall(r'''(?:from\s*|import\s*)["'](\.[^"']+)["']''', historical(path).decode('utf8')):
        import_paths.append(posixpath.normpath(posixpath.join(posixpath.dirname(path), name)))
resolver_files = {}
for key in [*policy['decorative_tsx'], *policy['overrides'], *import_paths]:
    path = next(path for path in [key, key + '.ts', key + '.tsx', key + '/index.ts'] if path in entries)
    if path not in policy['sources']:
        resolver_files[path] = sha(historical(path))
resolver = {'main': policy['main'], 'resolver_files': resolver_files}
files = {**policy['sources'], **resolver_files}
sources = {path: historical(path).decode('utf8') for path in files}
for path, pin in files.items():
    assert sources[path].encode('utf8') == historical(path), path
    assert sha(sources[path].encode('utf8')) == pin, path
payload = json.dumps({'main': policy['main'], 'sources': sources}, sort_keys=True,
                     separators=(',', ':'), ensure_ascii=False).encode('utf8')
if '--write-snapshot' in sys.argv:
    (FIXTURE / 'baseline-sources.json.gz').write_bytes(gzip.compress(payload, mtime=0))
    (FIXTURE / 'baseline-resolver-files.json').write_text(json.dumps(resolver, sort_keys=True, indent=2) + '\n')
archive = (FIXTURE / 'baseline-sources.json.gz').read_bytes()
assert gzip.decompress(archive) == payload
assert json.loads((FIXTURE / 'baseline-resolver-files.json').read_text()) == resolver
freeze = json.loads((FIXTURE / 'fixture-freeze.json').read_text())
assert freeze['baseline_main'] == policy['main']
for path, pin in freeze['files'].items():
    assert sha((FIXTURE / path).read_bytes()) == pin, path

live_drift = [path for path, pin in policy['sources'].items()
              if sha((REPO / path).read_bytes()) != pin]
old_preflight_drift = [path for path in live_drift if path != 'src/features/chat/Transcript.tsx']
with tempfile.TemporaryDirectory(prefix='disclosure-static-root-') as directory:
    root = pathlib.Path(directory)
    for path, text in sources.items():
        assert path.startswith('src/') and '..' not in pathlib.PurePosixPath(path).parts
        destination = root / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(text.encode('utf8'))
    for path, pin in files.items():
        assert sha((root / path).read_bytes()) == pin, path
    assert not (root / '.git').exists() and not (root / 'node_modules').exists()

print(json.dumps({
    'result': 'PASS', 'checked_main': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(),
    'historical_main': policy['main'], 'original_pins': len(policy['sources']),
    'resolver_leaves': len(resolver_files), 'archived_files': len(sources),
    'archive_sha256': sha(archive), 'frozen_fixture_files': len(freeze['files']),
    'old_mixed_root_preflight_drift': old_preflight_drift,
    'isolated_baseline_source_preflight': 'PASS',
    'javascript_and_behavior': 'NOT_RUN',
}, indent=2))
