"""Compile actual command environment wiring + ensure_live preparation, never spawn.

DTOs replace process/session IO. Effective settings are synthetic thread-local maps;
no provider, app, shell, DB or vendor JS is run. The only policy adaptation is to
return the prepared launch immediately before ClaudeSession::spawn.
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
work = root / '.oc-tmp/local-environment-harness' / (a.source_ref or 'current')
work.mkdir(parents=True, exist_ok=True)

def read(name):
    if a.source_ref:
        return subprocess.check_output(['git', 'show', f'{a.source_ref}:{name}'], text=True)
    return (root / name).read_text()

def digest(s):
    return hashlib.sha256(s.encode()).hexdigest()

runner = read('src-tauri/src/claude_chat/runner.rs')
commands = read('src-tauri/src/claude_chat/commands.rs')
secret = read('src-tauri/src/agent/secret.rs')
secret = secret[secret.index('#[derive(Clone, PartialEq, Eq)]'):secret.index('\n#[derive(Debug, Clone, PartialEq, Eq)]')]
options = runner[runner.index('#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize)]'):runner.index('\nstruct Live {')]
start = runner.index('    fn ensure_live(')
end = runner.index('        let mut session = ClaudeSession::spawn(&launch)', start)
prefix = runner[start:end]
assert prefix.count('Result<(), String>') == 1
assert prefix.count('return Ok(());') == 1
probe = prefix.replace('Result<(), String>', 'Result<Option<ClaudeLaunch>, String>').replace('return Ok(());', 'return Ok(None);')
probe += '        Ok(Some(launch))\n    }\n'
turn_start = commands.index('    let cwd = state.cwds.lock().unwrap().get(&chat_id).cloned();')
turn_start = commands.index('\n', turn_start) + 1
turn_end = commands.index('    // Stop also covers', turn_start)
turn_env = commands[turn_start:turn_end]
# Preserve the baseline launch-only env application, if present. This explicitly
# avoids making baseline first/dead launches fail merely because a DTO omitted it.
needle = '                    for (k, v) in crate::settings::effective::local_env_for_dir(cwd) {'
assert commands.count(needle) <= 1
launcher_env = ''
if needle in commands:
    i = commands.index(needle)
    j = commands.index('\n                    }', i) + len('\n                    }')
    launcher_env = commands[i:j]
fixture = fixtures / 'probe-template.rs'
text = fixture.read_text()
for key, value in {'SECRET_STRING': secret, 'OPTIONS': options, 'ENSURE_LIVE_PREFIX': probe,
                   'COMMAND_TURN_ENV': turn_env, 'LAUNCHER_ENV': launcher_env}.items():
    marker = f'/* {key} */'
    assert text.count(marker) == 1
    text = text.replace(marker, value)
(work / 'src').mkdir(exist_ok=True)
(work / 'src/lib.rs').write_text(text)
(work / 'Cargo.toml').write_text('''[package]
name = "settings-local-environment-pure-probe"
version = "0.0.0"
edition = "2021"
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
[workspace]
''')
manifest = {
    'source_ref': a.source_ref or subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'runner_sha256': digest(runner), 'commands_sha256': digest(commands),
    'fixture_sha256': hashlib.sha256(fixture.read_bytes()).hexdigest(),
    'prefix_sha256': digest(prefix), 'turn_env_sha256': digest(turn_env),
    'launcher_env_sha256': digest(launcher_env), 'secret_string_sha256': digest(secret),
    'transforms': ['Result<(), String> -> Result<Option<ClaudeLaunch>, String>',
                   'early Ok(()) -> Ok(None)', 'stop before spawn; return prepared launch'],
    'adapters': ['launch DTO and env setters', 'live state/mapper DTOs',
                 'counter-only session kill/wait', 'synthetic effective-env loader'],
}
(work / 'source.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2), flush=True)
r = subprocess.run(['cargo', 'test', '--offline', '--manifest-path', str(work / 'Cargo.toml'), '--lib', '--', '--nocapture', '--test-threads=1'])
sys.exit(r.returncode)
