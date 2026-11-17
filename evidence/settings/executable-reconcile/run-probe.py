"""Compile actual executable resolution wiring + ensure_live preparation; never spawn.

The existing agent_launch::resolve function runs against fake custom/bundled/system
inputs. Session IO is counter-only; the actual pre-spawn prefix returns a launch DTO.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--source-ref')
args = parser.parse_args()
root = Path.cwd()
fixtures = Path(__file__).resolve().parent
work = root / '.oc-tmp/executable-harness' / (args.source_ref or 'current')
work.mkdir(parents=True, exist_ok=True)

def read(name):
    if args.source_ref:
        return subprocess.check_output(['git', 'show', f'{args.source_ref}:{name}'], text=True)
    return (root / name).read_text()

def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()

runner = read('src-tauri/src/claude_chat/runner.rs')
commands = read('src-tauri/src/claude_chat/commands.rs')
resolver = read('src-tauri/src/agent_launch.rs')
secret = read('src-tauri/src/agent/secret.rs')
secret = secret[secret.index('#[derive(Clone, PartialEq, Eq)]'):secret.index('\n#[derive(Debug, Clone, PartialEq, Eq)]')]
options = runner[runner.index('#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize)]'):runner.index('\nstruct Live {')]
a = runner.index('    fn ensure_live(')
b = runner.index('        let mut session = ClaudeSession::spawn(&launch)', a)
prefix = runner[a:b]
assert prefix.count('Result<(), String>') == 1
assert prefix.count('return Ok(());') == 1
probe = prefix.replace('Result<(), String>', 'Result<Option<ClaudeLaunch>, String>').replace('return Ok(());', 'return Ok(None);')
probe += '        Ok(Some(launch))\n    }\n'
resolve = resolver[resolver.index('pub fn resolve('):resolver.index('\n/// `PATH` from')]
# Use the actual baseline late-resolution statements, not an assumed fallback.
late = '                    let exe = crate::agent_launch::launch(&settings_app, Agent::Claude)?;'
assert commands.count(late) <= 1
launcher_resolve = late if late in commands else ''
launcher_apply = '                    launch.executable = exe;' if late in commands else ''
# A successor captures the resolved path once inside the existing blocking turn.
marker = '        options.executable_path = match crate::agent_launch::launch(&app, Agent::Claude) {'
assert commands.count(marker) <= 1
turn_capture = ''
if marker in commands:
    i = commands.index(marker)
    j = commands.index('\n        };', i) + len('\n        };')
    turn_capture = commands[i:j]
fixture = fixtures / 'probe-template.rs'
text = fixture.read_text()
for name, value in {'SECRET_STRING': secret, 'OPTIONS': options, 'ENSURE_LIVE_PREFIX': probe,
                    'RESOLVE': resolve, 'COMMAND_CAPTURE': turn_capture,
                    'LAUNCHER_RESOLVE': launcher_resolve, 'LAUNCHER_APPLY': launcher_apply}.items():
    marker = f'/* {name} */'
    assert text.count(marker) == 1
    text = text.replace(marker, value)
(work / 'src').mkdir(exist_ok=True)
(work / 'src/lib.rs').write_text(text)
(work / 'Cargo.toml').write_text('''[package]
name = "settings-executable-pure-probe"
version = "0.0.0"
edition = "2021"
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
[workspace]
''')
manifest = {'source_ref': args.source_ref or subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
            'runner_sha256': sha(runner), 'commands_sha256': sha(commands),
            'resolver_sha256': sha(resolver), 'fixture_sha256': sha(fixture.read_text()),
            'prefix_sha256': sha(prefix), 'turn_capture_sha256': sha(turn_capture),
            'launcher_resolve_sha256': sha(launcher_resolve), 'launcher_apply_sha256': sha(launcher_apply),
            'transforms': ['Result<(), String> -> Result<Option<ClaudeLaunch>, String>',
                           'early Ok(()) -> Ok(None)', 'stop before spawn; return prepared launch'],
            'adapters': ['actual pure resolver with synthetic paths only', 'counter-only session kill/wait',
                         'launch/state/mapper DTOs', 'fake agent_launch::launch and AppHandle']}
(work / 'source.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2), flush=True)
result = subprocess.run(['cargo', 'test', '--offline', '--manifest-path', str(work / 'Cargo.toml'), '--lib', '--', '--nocapture', '--test-threads=1'])
sys.exit(result.returncode)
