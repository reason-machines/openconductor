"""Compile only a pure prefix of real Rust reuse/launch preparation.

No vendor JS evaluation, provider process, Tauri app or database. Session kill/wait
are counters. The production prefix stops immediately BEFORE ClaudeSession::spawn.
The command's Chrome snapshot assignment, when present, uses an immediate fake
preference reader. Missing wiring in a baseline is an empty assignment (not a
replacement policy). Assertions and adapters are identical for RED and GREEN.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import sys

p = argparse.ArgumentParser()
p.add_argument('--source-ref')
a = p.parse_args()
root = Path.cwd()
fixtures = Path(__file__).resolve().parent
work = root / '.oc-tmp/chrome-reconcile' / (a.source_ref or 'current')
work.mkdir(parents=True, exist_ok=True)

def read(name):
    if a.source_ref:
        return subprocess.check_output(['git', 'show', f'{a.source_ref}:{name}'], text=True)
    return (root / name).read_text()

runner = read('src-tauri/src/claude_chat/runner.rs')
commands = read('src-tauri/src/claude_chat/commands.rs')
options = runner[runner.index('#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize)]'):runner.index('\nstruct Live {')]
start = runner.index('    fn ensure_live(')
end = runner.index('        let mut session = ClaudeSession::spawn(&launch)', start)
prefix = runner[start:end]
assert prefix.count('Result<(), String>') == 1
assert prefix.count('return Ok(());') == 1
probe = prefix.replace('Result<(), String>', 'Result<Option<ClaudeLaunch>, String>').replace('return Ok(());', 'return Ok(None);')
probe += '        Ok(Some(launch))\n    }\n'
match = re.search(r'    options\.chrome_enabled = Some\(.*?\);\n', commands, re.S)
snapshot = match.group(0) if match else ''
if snapshot:
    assert 'crate::app_prefs::commands::load(&db.0).await?.chrome_mode_enabled' in snapshot
text = (fixtures / 'probe-template.rs').read_text().replace('/* OPTIONS */', options).replace('/* ENSURE_LIVE_PREFIX */', probe).replace('/* CHROME_SNAPSHOT */', snapshot)
(work / 'src').mkdir(exist_ok=True)
(work / 'src/lib.rs').write_text(text)
(work / 'Cargo.toml').write_text('''[package]
name = "settings-chrome-pure-probe"
version = "0.0.0"
edition = "2021"
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
[workspace]
''')
manifest = {
    'source_ref': a.source_ref or subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'runner_sha256': hashlib.sha256(runner.encode()).hexdigest(),
    'commands_sha256': hashlib.sha256(commands.encode()).hexdigest(),
    'fixture_sha256': hashlib.sha256((fixtures / 'probe-template.rs').read_bytes()).hexdigest(),
    'prefix_sha256': hashlib.sha256(prefix.encode()).hexdigest(),
    'snapshot_assignment': snapshot,
    'transforms': ['Result<(), String> -> Result<Option<ClaudeLaunch>, String>', 'early Ok(()) -> Ok(None)', 'stop before spawn; return prepared launch'],
    'adapters': ['PermissionMode DTO', 'ClaudeLaunch DTO', 'live state/mapper DTOs', 'counter-only session kill/wait', 'immediate async bool preference reader', 'launcher closure'],
}
(work / 'source.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2), flush=True)
r = subprocess.run(['cargo', 'test', '--offline', '--manifest-path', str(work / 'Cargo.toml'), '--lib', '--', '--nocapture', '--test-threads=1'])
sys.exit(r.returncode)
