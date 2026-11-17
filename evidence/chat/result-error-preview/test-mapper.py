#!/usr/bin/env python3
"""Compile only source-linked pure parser/mapper/wire tests. No provider or runner.

Provider and CLI data declarations are copied verbatim from current source into
an ignored, disposable Cargo crate. All mapping/serialization implementations
and tests are included directly by path; no counterpart behavior is re-created.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / '.ara-state/tmp/result-error-mapper'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'src').mkdir(exist_ok=True)
records = []


def excerpt(relative, start, end):
    source = (ROOT / relative).read_text()
    a = source.index(start)
    b = source.index(end, a)
    text = source[a:b]
    records.append({'path': relative, 'start': a, 'end': b,
                    'sha256': hashlib.sha256(text.encode()).hexdigest()})
    return text


provider = 'use serde_json::Value; use super::updates::AgentEvent; use super::cli::RunningModel;\n'
provider += excerpt('src-tauri/src/reason_acp/provider.rs',
                    '#[derive(Debug, Clone, PartialEq)]\npub enum ProviderEvent',
                    '/// A permission request waiting for the app')
provider += excerpt('src-tauri/src/reason_acp/provider.rs',
                    '#[derive(Debug, Clone, PartialEq)]\npub enum TurnEnd',
                    'pub type Sink')
provider += excerpt('src-tauri/src/reason_acp/provider.rs',
                    '#[derive(Debug, Clone, PartialEq)]\npub struct SessionInfo',
                    '#[derive(Default)]\nstruct Chat')
(OUT / 'src/provider.rs').write_text(provider)
cli = excerpt('src-tauri/src/reason_acp/cli.rs',
              '#[derive(Debug, Clone, PartialEq, Eq)]\npub struct RunningModel',
              '/// Reads `model` and `reasoning_effort`')
(OUT / 'src/cli.rs').write_text(cli)
mode = 'use serde::{Serialize, Deserialize}; use std::{fmt, str::FromStr};\n' + excerpt(
    'src-tauri/src/agent/claude_cli.rs',
    '#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]',
    '/// Everything needed to start one Claude Code process')
(OUT / 'src/claude_cli.rs').write_text(mode)


def module(name, relative):
    path = ROOT / relative
    data = path.read_bytes()
    records.append({'path': relative, 'sha256': hashlib.sha256(data).hexdigest()})
    return f'#[path = {json.dumps(str(path))}] pub mod {name};\n'


source = '#![allow(dead_code)]\n'
source += 'pub mod agent {\n' + module('claude_cli', str((OUT / 'src/claude_cli.rs').relative_to(ROOT)))
source += module('claude_stream', 'src-tauri/src/agent/claude_stream.rs') + '}\n'
source += 'pub mod reason_acp {\n'
source += module('cli', str((OUT / 'src/cli.rs').relative_to(ROOT)))
source += module('provider', str((OUT / 'src/provider.rs').relative_to(ROOT)))
source += module('updates', 'src-tauri/src/reason_acp/updates.rs')
source += module('wire', 'src-tauri/src/reason_acp/wire.rs') + '}\n'
source += 'pub mod claude_chat {\n' + module('map', 'src-tauri/src/claude_chat/map.rs')
source += module('map_tests', 'src-tauri/src/claude_chat/map_tests.rs') + '}\n'
assert not re.search(r'mod (runner|rpc|commands|interact);', source)
(OUT / 'src/lib.rs').write_text(source)
(OUT / 'source-manifest.json').write_text(json.dumps(records, indent=2) + '\n')
(OUT / 'Cargo.toml').write_text('''[package]
name = "result-error-pure-tests"
version = "0.0.0"
edition = "2021"
publish = false
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
[workspace]
''')
subprocess.run(['cargo', 'test', '--offline', '--manifest-path', str(OUT / 'Cargo.toml'),
                '--lib', '--', '--nocapture'], check=True, cwd=ROOT)
