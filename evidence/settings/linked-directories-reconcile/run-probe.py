"""Compile actual ensure_live preparation only. Never spawn a CLI or app.

The only mechanical changes are an outcome return type, early reuse return, and
stopping before ClaudeSession::spawn to expose the prepared launch. DTOs and
kill/wait counters are inert adapters, not a replacement reconciliation policy.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

p = argparse.ArgumentParser()
p.add_argument('--source-ref')
a = p.parse_args()
root = Path.cwd()
fixtures = Path(__file__).resolve().parent
work = root / '.oc-tmp/linked-directories-harness' / (a.source_ref or 'current')
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
fixture = fixtures / 'probe-template.rs'
text = fixture.read_text().replace('/* OPTIONS */', options).replace('/* ENSURE_LIVE_PREFIX */', probe)
(work / 'src').mkdir(exist_ok=True)
(work / 'src/lib.rs').write_text(text)
(work / 'Cargo.toml').write_text('''[package]
name = "settings-linked-directories-pure-probe"
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
    'fixture_sha256': hashlib.sha256(fixture.read_bytes()).hexdigest(),
    'prefix_sha256': hashlib.sha256(prefix.encode()).hexdigest(),
    'transforms': ['Result<(), String> -> Result<Option<ClaudeLaunch>, String>', 'early Ok(()) -> Ok(None)', 'stop before spawn; return prepared launch'],
    'adapters': ['PermissionMode and launch DTOs', 'live state/mapper DTOs', 'counter-only session kill/wait', 'launcher closure'],
}
(work / 'source.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2), flush=True)
r = subprocess.run(['cargo', 'test', '--offline', '--manifest-path', str(work / 'Cargo.toml'), '--lib', '--', '--nocapture', '--test-threads=1'])
sys.exit(r.returncode)
