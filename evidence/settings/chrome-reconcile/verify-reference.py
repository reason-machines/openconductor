"""Validate inert literal pins and bounded production changes, never vendor JS."""
from pathlib import Path
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent
p = json.loads((root / 'reference.json').read_text())
assert p['bundle_bytes'] == 13025924
assert p['bundle_sha256'] == 'f72df80a11d76bacb7ed7e2a322b420e6250b4a2c7781272877b8c5cf985e6ab'
old = Path(p['inherited_container_binding']['file'])
assert hashlib.sha256(old.read_bytes()).hexdigest() == p['inherited_container_binding']['sha256']
inherited = json.loads(old.read_text())
spans = {}
for s in p['spans']:
    b = s['source'].encode()
    assert len(b) == s['bytes'] == s['end'] - s['start']
    assert hashlib.sha256(b).hexdigest() == s['sha256']
    spans[s['label']] = s['source']
assert spans['policy'].startswith('Ln4 = {') and spans['policy'].endswith(' };')
assert 'chromeEnabled: { kind: "recreate" }' in spans['policy']
assert 'case "recreate":\n      return true;' in spans['helpers']
assert 'B.appliedConfig[D]' in spans['helpers']
assert 'B.chromeEnabled ? { extraArgs: { chrome: null } }' in spans['launch']
parents = {s['label']: s for s in inherited['spans']}
for label in p['inherited_span_labels']:
    s = parents[label]
    assert hashlib.sha256(s['source'].encode()).hexdigest() == s['sha256']
assert 'chromeEnabled: G' in parents['query-to-config']['source']
assert 'config: Q' in parents['query-handler']['source']
assert 'return CB5({ policy: Ln4' in parents['runner-reconcile']['source']
assert 'M = await j(A)' in parents['live-reconciliation']['source']
assert 'canRecreate: !M.inProgress' in parents['runner-message']['source']
fixture = root / 'probe-template.rs'
assert hashlib.sha256(fixture.read_bytes()).hexdigest() == 'f3c262c066bbb5dd717ccb6d10b4e04767130148908cf900e5eb5dfc1a148f9b'
runner = Path('src-tauri/src/claude_chat/runner.rs').read_text()
commands = Path('src-tauri/src/claude_chat/commands.rs').read_text()
assert '#[serde(skip)]\n    pub chrome_enabled: Option<bool>' in runner
assert 'options.chrome_enabled = Some(crate::app_prefs::commands::load(&db.0).await?.chrome_mode_enabled);' in commands
assert runner.index('if let Some(chrome) = options.chrome_enabled { launch.chrome = chrome; }') < runner.index('let mut session = ClaudeSession::spawn(&launch)')
# These controls are exact unchanged source, not claims of non-Claude execution.
for name in ['src-tauri/src/local_plan_mode.rs', 'src-tauri/src/settings/launch.rs',
             'src-tauri/src/claude_chat/interact.rs', 'src-tauri/src/agent/claude_stream.rs',
             'src-tauri/src/codex_chat.rs', 'src-tauri/src/app_prefs/commands.rs']:
    assert Path(name).read_bytes() == subprocess.check_output(['git', 'show', p['baseline'] + ':' + name]), name
print('PASS: 3 new exact source spans, 8 inherited caller/schema pins, frozen fixture, server-only snapshot/spawn wiring and 6 unchanged production controls. Static evidence only.')
