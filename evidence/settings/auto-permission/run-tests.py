"""Pure Rust policy/protocol tests; no CLI, provider, app, database or browser launch.

Compile actual agent/model/launch/interact sources. Copy the per-turn assignment
and runner decision verbatim into small adapters. The database Plan/Default enum
and five provider DTOs are adapters (DTO declarations are copied verbatim).
This is not a full Tauri/SQLite/runner integration test.

Run from the repository root. --source-ref checks the same frozen fixtures
against a Git tree, without replacing the checkout or executing that tree.
"""
from pathlib import Path
import argparse
import json
import re
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--source-ref')
parser.add_argument('--filter', default='regression')
args = parser.parse_args()
root = Path.cwd()
fixtures = Path(__file__).resolve().parent
work = root / '.oc-tmp' / 'auto-permission-unit' / (args.source_ref or 'current')
source = root
if args.source_ref:
    source = work / 'source'
    paths = ['src-tauri/src/agent', 'src-tauri/src/test_exe.rs', 'src-tauri/src/settings/model.rs',
             'src-tauri/src/settings/launch.rs', 'src-tauri/src/settings/launch_tests.rs', 'src-tauri/src/local_plan_mode.rs',
             'src-tauri/src/claude_chat', 'src-tauri/src/reason_acp/provider.rs',
             'src-tauri/resources/conductor-skill/.claude-plugin/plugin.json',
             'src-tauri/resources/conductor-skill/skills/conductor/SKILL.md',
             'tests/fixtures/codex-mcp-status.py']
    names = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', args.source_ref, '--', *paths], text=True).splitlines()
    for name in names:
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(subprocess.check_output(['git', 'show', f'{args.source_ref}:{name}']))
commands = (source / 'src-tauri/src/claude_chat/commands.rs').read_text()
assignment = re.search(r'    options\.permission_mode = Some\(.*?\n    \)\);', commands, re.S).group(0)
plan = (source / 'src-tauri/src/local_plan_mode.rs').read_text()
helper = re.search(r'pub fn claude_permission\(.*?\n}\n', plan, re.S).group(0)
runner = (source / 'src-tauri/src/claude_chat/runner.rs').read_text()
reply_line = re.search(r'        let decision = interact::decision(?:_with_plan_mode)?\(.*?\?;', runner, re.S).group(0)
provider = (source / 'src-tauri/src/reason_acp/provider.rs').read_text()
dtos = provider[provider.index('/// One request the agent waits on,'):provider.index('/// A permission request waiting for the app')]
launch_tests = (source / 'src-tauri/src/settings/launch_tests.rs').read_text()
launch_case = re.search(r'#\[test\]\nfn claude_auto_permission_obeys_plan_and_approval_precedence\(\).*?\n}', launch_tests, re.S)
launch_case = launch_case.group(0) if launch_case else ''
flag = re.search(r"fn flag<'a>.*?\n}", launch_tests, re.S).group(0)
q = lambda name: json.dumps(str(source / name))
harness = work / 'harness'
(harness / 'src').mkdir(parents=True, exist_ok=True)
(harness / 'src/lib.rs').write_text(f'''#[path = {q('src-tauri/src/agent/mod.rs')}]
pub mod agent;
pub mod settings {{
    #[path = {q('src-tauri/src/settings/model.rs')}] mod model;
    pub use model::*;
    #[path = {q('src-tauri/src/settings/launch.rs')}] pub mod launch;
}}
mod local_plan_mode {{
    #[derive(Clone, Copy)] pub enum PermissionMode {{ Default, Plan }}
    {helper}
}}
fn per_turn_policy(settings: &settings::Settings, plan: bool) -> agent::PermissionMode {{
    use local_plan_mode::PermissionMode;
    let mode = if plan {{ PermissionMode::Plan }} else {{ PermissionMode::Default }};
    struct Options {{ permission_mode: Option<agent::PermissionMode> }}
    let mut options = Options {{ permission_mode: None }};
{assignment}
    options.permission_mode.unwrap()
}}
mod reason_acp {{ pub mod provider {{ use serde_json::Value; {dtos} }} }}
#[path = {q('src-tauri/src/claude_chat/interact.rs')}] mod interact;
#[path = {q('src-tauri/src/claude_chat/interact_tests.rs')}] mod interact_tests;
fn reply_decision(tool: &str, input: &serde_json::Value, answer: &interact::Answer, post_plan_mode: Option<agent::PermissionMode>) -> Result<agent::claude_stream::PermissionDecision, String> {{
{reply_line}
    Ok(decision)
}}
mod launch_policy_case {{
    use std::path::Path;
    use crate::agent::{{MemorySecretStore, PermissionMode}};
    use crate::settings::{{Settings, launch::{{self, Purpose}}}};
    {flag}
    {launch_case}
}}
#[path = {json.dumps(str(fixtures / 'regression.rs'))}] mod regression;
#[path = {json.dumps(str(fixtures / 'protocol-regression.rs'))}] mod protocol_regression;
''')
(harness / 'Cargo.toml').write_text('''[package]
name = "settings-auto-permission-unit"
version = "0.0.0"
edition = "2021"
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"
oc-scripts = { path = SCRIPTS_PATH }
# Match the app graph's std feature unification for rustix-openpty.
[target.'cfg(unix)'.dependencies]
rustix = { version = "1", features = ["std"] }
[target.'cfg(target_os = "macos")'.dependencies]
security-framework = "3"
[workspace]
'''.replace('SCRIPTS_PATH', json.dumps(str(root / 'crates/scripts'))))
result = subprocess.run(['cargo', 'test', '--manifest-path', str(harness / 'Cargo.toml'), '--lib', args.filter, '--', '--nocapture'])
sys.exit(result.returncode)
