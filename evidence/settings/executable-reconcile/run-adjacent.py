"""Compile unchanged environment/directory/Chrome fixtures with one added DTO field.

No archived fixture or assertion changes. New fields only make the current actual
pre-spawn prefix typecheck; all these older callers leave the executable unspecified.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

root = Path.cwd()
runner = (root / 'src-tauri/src/claude_chat/runner.rs').read_text()
commands = (root / 'src-tauri/src/claude_chat/commands.rs').read_text()
secret = (root / 'src-tauri/src/agent/secret.rs').read_text()
secret = secret[secret.index('#[derive(Clone, PartialEq, Eq)]'):secret.index('\n#[derive(Debug, Clone, PartialEq, Eq)]')]
options = runner[runner.index('#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize)]'):runner.index('\nstruct Live {')]
a = runner.index('    fn ensure_live(')
b = runner.index('        let mut session = ClaudeSession::spawn(&launch)', a)
prefix = runner[a:b]
assert prefix.count('Result<(), String>') == prefix.count('return Ok(());') == 1
probe = prefix.replace('Result<(), String>', 'Result<Option<ClaudeLaunch>, String>').replace('return Ok(());', 'return Ok(None);') + '        Ok(Some(launch))\n    }\n'
snapshot = re.search(r'    options\.chrome_enabled = Some\(.*?\);\n', commands, re.S).group(0)
i = commands.index('    let cwd = state.cwds.lock().unwrap().get(&chat_id).cloned();')
i = commands.index('\n', i) + 1
turn_env = commands[i:commands.index('    // Stop also covers', i)]
meta = json.loads((root / 'evidence/settings/linked-directories-reconcile/reference.json').read_text())
fixtures = [
    ('environment', 'local-environment-reconcile/probe-template.rs', '8e663e6df3a40c96f7854fdf6705434f26b593ab941f265e43bb7ce16f4fd0fc'),
    ('directories', 'linked-directories-reconcile/probe-template.rs', meta['frozen_fixture_sha256']),
    ('chrome', 'linked-directories-reconcile/chrome-successor-template.rs', meta['chrome_successor_fixture_sha256']),
]
for label, file, expected in fixtures:
    path = root / 'evidence/settings' / file
    original = path.read_text()
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    assert actual == expected
    text = original
    assert text.count('pub chrome: bool') == 1
    text = text.replace('pub chrome: bool', 'pub executable: PathBuf, pub chrome: bool')
    init = 'chrome: stale_chrome,' if label == 'chrome' else 'chrome: false,'
    assert text.count(init) == 1
    text = text.replace(init, 'executable: "/synthetic/legacy".into(), ' + init)
    if label != 'environment':
        field = '    pub add_dirs: Vec<PathBuf>, pub resume: Option<String>,'
        text = text.replace(field, field + ' pub env: Env,')
        assert text.count('], resume,') == 1
        text = text.replace('], resume,', '], resume, env: Env::default(),')
        extra = '''mod agent { use std::fmt; SECRET }
#[derive(Debug, Default)] pub struct Env;
impl Env { fn set_secret(&mut self, _: &str, _: agent::SecretString) {} }
'''.replace('SECRET', secret)
        text = extra + text.replace('//!', '//', 2)
    assert text[text.index('#[test]'):] == original[original.index('#[test]'):], 'All archived assertions must stay identical'
    for name, value in {'SECRET_STRING': secret, 'OPTIONS': options, 'ENSURE_LIVE_PREFIX': probe,
                        'COMMAND_TURN_ENV': turn_env, 'LAUNCHER_ENV': '', 'CHROME_SNAPSHOT': snapshot}.items():
        text = text.replace(f'/* {name} */', value)
    work = root / '.oc-tmp/executable-adjacent' / label
    (work / 'src').mkdir(parents=True, exist_ok=True)
    (work / 'src/lib.rs').write_text(text)
    (work / 'Cargo.toml').write_text('''[package]
name = "settings-executable-adjacent-LABEL"
version = "0.0.0"
edition = "2021"
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
[workspace]
'''.replace('LABEL', label))
    record = {'fixture': str(path.relative_to(root)), 'sha256': actual, 'assertions_identical': True,
              'dto_delta': ['empty executable field and initializer', 'existing empty Env and copied SecretString for directory/Chrome fixtures'],
              'runner_sha256': hashlib.sha256(runner.encode()).hexdigest()}
    (work / 'source.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record), flush=True)
    result = subprocess.run(['cargo', 'test', '--offline', '--manifest-path', str(work / 'Cargo.toml'), '--lib', '--', '--nocapture', '--test-threads=1'])
    if result.returncode: sys.exit(result.returncode)
