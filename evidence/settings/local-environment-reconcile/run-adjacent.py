"""Run unchanged linked-directory and Chrome assertions with additive DTO support.

The archived files are not edited. Only their launch DTO gets an empty Env field,
and a copied actual SecretString definition supplies the newly referenced type.
No test assertion, policy, snapshot assignment, or source prefix is changed.
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
start = runner.index('    fn ensure_live(')
end = runner.index('        let mut session = ClaudeSession::spawn(&launch)', start)
prefix = runner[start:end]
assert prefix.count('Result<(), String>') == prefix.count('return Ok(());') == 1
probe = prefix.replace('Result<(), String>', 'Result<Option<ClaudeLaunch>, String>').replace('return Ok(());', 'return Ok(None);') + '        Ok(Some(launch))\n    }\n'
snapshot = re.search(r'    options\.chrome_enabled = Some\(.*?\);\n', commands, re.S).group(0)
extra = '''mod agent { use std::fmt; SECRET }
#[derive(Debug, Default)]
pub struct Env;
impl Env { fn set_secret(&mut self, _: &str, _: agent::SecretString) {} }
'''.replace('SECRET', secret)
records = []
meta = json.loads((root / 'evidence/settings/linked-directories-reconcile/reference.json').read_text())
for label, name, expected in [
    ('linked-directories', 'probe-template.rs', meta['frozen_fixture_sha256']),
    ('chrome', 'chrome-successor-template.rs', meta['chrome_successor_fixture_sha256']),
]:
    source = root / 'evidence/settings/linked-directories-reconcile' / name
    original = source.read_text()
    actual = hashlib.sha256(source.read_bytes()).hexdigest()
    assert actual == expected
    text = original
    field = '    pub add_dirs: Vec<PathBuf>, pub resume: Option<String>,'
    assert text.count(field) == 1
    text = text.replace(field, field + ' pub env: Env,')
    init = '], resume,'
    assert text.count(init) == 1
    text = text.replace(init, init + ' env: Env::default(),')
    assert text[text.index('#[test]'):] == original[original.index('#[test]'):], 'Archived assertions must not change'
    text = extra + text.replace('//!', '//', 2)
    for key, value in {'OPTIONS': options, 'ENSURE_LIVE_PREFIX': probe, 'CHROME_SNAPSHOT': snapshot}.items():
        text = text.replace(f'/* {key} */', value)
    work = root / '.oc-tmp/local-environment-adjacent' / label
    (work / 'src').mkdir(parents=True, exist_ok=True)
    (work / 'src/lib.rs').write_text(text)
    (work / 'Cargo.toml').write_text('''[package]
name = "settings-env-adjacent-LABEL"
version = "0.0.0"
edition = "2021"
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
[workspace]
'''.replace('LABEL', label))
    record = {'fixture': str(source.relative_to(root)), 'sha256': actual,
              'assertions_identical': True, 'dto_delta': ['add empty Env field and initializer', 'supply copied actual SecretString and inert Env setter'],
              'runner_sha256': hashlib.sha256(runner.encode()).hexdigest()}
    (work / 'source.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record), flush=True)
    result = subprocess.run(['cargo', 'test', '--offline', '--manifest-path', str(work / 'Cargo.toml'), '--lib', '--', '--nocapture', '--test-threads=1'])
    if result.returncode: sys.exit(result.returncode)
    records.append(record)
print(json.dumps({'passed': records}, indent=2))
