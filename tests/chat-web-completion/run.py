#!/usr/bin/env python3
"""Run the frozen real-Rust-producer -> mounted frontend regression.

This compiles a serde/json-only probe with one Cargo job. It never runs a
provider or Tauri app. On shared compute, obtain the heavy-check slot first.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--node-deps', type=Path, help='existing node_modules; defaults to this checkout')
p.add_argument('--target-dir', type=Path, help='private Cargo target directory')
p.add_argument('--output', type=Path, required=True, help='directory for complete logs and actual payloads')
a = p.parse_args()
here = Path(__file__).resolve().parent
root = here.parents[1]
freeze = json.loads((here / 'freeze.json').read_text())
for name, digest in freeze['files'].items():
    assert hashlib.sha256((here / name).read_bytes()).hexdigest() == digest, name
node_deps = (a.node_deps or root / 'node_modules').resolve()
assert (node_deps / 'typescript/package.json').is_file(), 'existing TypeScript dependencies required'
assert (node_deps / 'react-test-renderer/package.json').is_file(), 'existing React test dependencies required'
a.output.mkdir(parents=True, exist_ok=True)
(root / '.ara-state/tmp').mkdir(parents=True, exist_ok=True)
output = a.output.resolve()
modules = ['secret', 'env', 'codex_cli', 'codex_rpc', 'codex_consent', 'codex_events', 'codex_wire']
manifest = {}
for name in modules:
    path = root / f'src-tauri/src/agent/{name}.rs'
    manifest[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
(output / 'rust-source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
with tempfile.TemporaryDirectory(prefix='web-completion-', dir=root / '.ara-state/tmp') as temp:
    work = Path(temp)
    (work / 'src').mkdir()
    (work / 'src/agent').symlink_to(root / 'src-tauri/src/agent', target_is_directory=True)
    shutil.copyfile(here / 'probe.rs', work / 'src/main.rs')
    (work / 'Cargo.toml').write_text('[package]\nname="codex-web-completion-probe"\nversion="0.0.0"\nedition="2021"\npublish=false\n[dependencies]\nserde={version="1",features=["derive"]}\nserde_json="1"\n[workspace]\n')
    target = (a.target_dir or root / '.ara-state/tmp/web-completion-target').resolve()
    env = {**os.environ, 'CARGO_TARGET_DIR': str(target), 'CARGO_BUILD_JOBS': '1'}
    with (output / 'compile.log').open('wb') as log:
        build = subprocess.run(['cargo', 'build', '--offline', '--jobs', '1', '--manifest-path', str(work / 'Cargo.toml')], env=env, stdout=log, stderr=subprocess.STDOUT, timeout=240)
    assert build.returncode == 0, f'probe compile failed: {output / "compile.log"}'
    probe = target / 'debug/codex-web-completion-probe'
    serialized = subprocess.run([probe], input=(here / 'cases.json').read_bytes(), capture_output=True, check=True, timeout=30)
    (output / 'payloads.json').write_bytes(serialized.stdout)
    scene = work / 'scene'
    scene.mkdir()
    (scene / 'node_modules').symlink_to(node_deps, target_is_directory=True)
    (scene / 'package.json').write_text('{"type":"module"}\n')
    for name in ['codex.ts', 'reducer.ts', 'view.ts', 'conductorTools.ts', 'toolIconData.ts', 'thinkingChip.ts', 'ToolRows.tsx']:
        (scene / name).symlink_to(root / 'src/features/chat' / name)
    shutil.copyfile(here / 'fixture.test.ts', scene / 'fixture.test.ts')
    shutil.copyfile(here / 'cases.json', scene / 'webSearchCompletion.inputs.json')
    env = {**os.environ, 'WEB_COMPLETION_PROBE': str(probe)}
    with (output / 'mounted.tap').open('wb') as log:
        check = subprocess.run(['node', '--test', str(scene / 'fixture.test.ts')], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=90)
    print((output / 'mounted.tap').read_text())
    raise SystemExit(check.returncode)
