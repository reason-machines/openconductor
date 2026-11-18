#!/usr/bin/env python3
"""Replay the frozen witness on pinned main and the candidate; no app/runtime I/O."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path.cwd()
OUT = ROOT / 'evidence/sidebar-project-filter-numbering/current'
MAIN = '1b2d83e6c2e2b3fa2eb251fc25a56d96401d96f1'
FIXTURE = 'src/sidebar/sidebarProjectFilterNumbering.test.ts'
FIXTURE_SHA = '3116f4291371e127b6b5dc08afa29eb6213c9e834eb400fa47761b430562d217'
OLD_SHA = 'bbea95554e60381830e80fe5980fa63583a7f39db2aa90dcd66d211c6a2e286e'
PRODUCTION = 'src/state/sidebarOrder.ts'
SNAPSHOT = ROOT / '.oc-tmp/sidebar-project-filter-numbering/fresh-main'
OLD = ': state.repos.flatMap((r) =>'
NEW = ': state.repos.filter((repo) => !state.sidebarRepoFilter || repo.id === state.sidebarRepoFilter).flatMap((r) =>'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(*args: str) -> bytes:
    return subprocess.check_output(['git', *args])


def replay(path: Path, name: str, green: bool) -> dict:
    command = ['node', '--experimental-strip-types', '--test', str(path)]
    run = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log = run.stdout
    (OUT / name).write_bytes(log)
    expected = (0, 12, 0) if green else (1, 5, 7)
    assert run.returncode == expected[0], log.decode()
    for key, value in [('tests', 12), ('pass', expected[1]), ('fail', expected[2]), ('skipped', 0), ('cancelled', 0)]:
        assert re.search(fr'^# {key} {value}$'.encode(), log, re.M), log.decode()
    assert len(re.findall(rb"^  code: 'ERR_ASSERTION'$", log, re.M)) == expected[2]
    assert b"code: 'ERR_TEST_FAILURE'" not in log
    assert b'TypeError' not in log and b'ReferenceError' not in log
    return {'command': ' '.join(command).replace(str(ROOT) + '/', ''), 'exit_code': run.returncode,
            'tests': 12, 'passed': expected[1], 'failed': expected[2], 'skipped': 0,
            'harness_errors': 0, 'log': name, 'sha256': sha(log)}


parser = argparse.ArgumentParser()
parser.add_argument('phase', choices=['red', 'green'])
phase = parser.parse_args().phase
fixture = (ROOT / FIXTURE).read_bytes()
assert sha(fixture) == FIXTURE_SHA
prefix = fixture.decode().split('// Consumer replay:')[0].rstrip() + '\n'
for line in ['import { readFileSync } from "node:fs";\n', 'import { createRequire } from "node:module";\n',
             'import { dirname, resolve } from "node:path";\n', 'import { fileURLToPath } from "node:url";\n',
             'import { runInNewContext } from "node:vm";\n', 'import type { Action } from "../state/store.ts";\n']:
    assert prefix.count(line) == 1
    prefix = prefix.replace(line, '')
assert sha(prefix.encode()) == OLD_SHA

# Export only our own pinned repository source; never evaluate vendor code.
SNAPSHOT.mkdir(parents=True, exist_ok=True)
archive = git('archive', MAIN, 'src', 'package.json')
subprocess.run(['tar', '-x', '-C', str(SNAPSHOT)], input=archive, check=True)
(SNAPSHOT / FIXTURE).parent.mkdir(parents=True, exist_ok=True)
(SNAPSHOT / FIXTURE).write_bytes(fixture)
source_names = git('ls-tree', '-r', '--name-only', MAIN, 'src').decode().splitlines()
protected = {}
for name in source_names:
    original = git('show', f'{MAIN}:{name}')
    assert (SNAPSHOT / name).read_bytes() == original, name
    candidate = (ROOT / name).read_bytes()
    if phase == 'green' and name == PRODUCTION:
        assert original.count(OLD.encode()) == 1
        assert candidate == original.replace(OLD.encode(), NEW.encode()), 'production edit exceeds one leased repo-arm filter'
    else:
        assert candidate == original, f'unleased edit: {name}'
    protected[name] = sha(candidate)

baseline = replay(SNAPSHOT / FIXTURE, 'fresh-main-red.tap' if phase == 'red' else 'fresh-main-red-recheck.tap', False)
candidate = replay(ROOT / FIXTURE, f'candidate-{phase}.tap', phase == 'green')
assert sha((ROOT / FIXTURE).read_bytes()) == FIXTURE_SHA
for name, digest in protected.items():
    assert sha((ROOT / name).read_bytes()) == digest, name
    assert (SNAPSHOT / name).read_bytes() == git('show', f'{MAIN}:{name}'), name
# Separate complete source identity from behavior; only this bounded witness runs.
aggregate = sha(json.dumps(protected, sort_keys=True).encode())
result = {'author': 'Conductor Rebuild', 'machine': 'Reason Cloud Linux', 'phase': phase,
          'checked_main': MAIN, 'fixture_sha256': FIXTURE_SHA, 'original_six_sha256': OLD_SHA,
          'baseline': baseline, 'candidate': candidate,
          'source_files_checked': len(protected), 'all_sources_unchanged_during_run': True,
          'protected_source_hash_manifest_sha256': aggregate,
          'allowed_production_delta': [] if phase == 'red' else [PRODUCTION + ': sidebarEntries repo-group filter only'],
          'not_run': ['browser screenshot', 'native persistence', 'OS keyboard delivery', 'provider', 'package', 'runtime', 'release dispatch']}
(OUT / f'implementation-{phase}.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
