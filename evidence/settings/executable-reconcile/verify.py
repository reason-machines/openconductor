"""Verify retained-source joins, immutable regressions, narrow scope and raw logs."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess

root = Path.cwd()
here = Path(__file__).resolve().parent
sha = lambda b: hashlib.sha256(b).hexdigest()
reference = json.loads((here / 'reference.json').read_text())
baseline = reference['baseline']
assert baseline == '93b9d53ce02970967a831b0ac93ecdbf17bdea31'
assert len(reference['spans']) == 23
for span in reference['spans']:
    data = span['source'].encode()
    assert len(data) == span['bytes'] == span['end'] - span['start'], span['label']
    assert sha(data) == span['sha256'], span['label']
spans = {s['label']: s['source'] for s in reference['spans']}
for label, literals in {
    'claude-executable-row': ['settingKey:"claude_executable_path"', 'onSave:a.update'],
    'executable-row': ['a(z.target.value)', 'onClick:()=>a("")'],
    'executable-setting-hook': ['o9r(D).fireAndForget()'],
    'setting-save-import': ['pR as o9r'],
    'export-binding': ['n6t as pR'],
    'n6t': ['VN({key:"claude_executable_path",path:t})'],
    'VN': ['ee.deleteSetting(t)', 'ee.updateSetting(t,s'],
    'local-settings-env': ['key:"claude_executable_path"', 'claudeExecutablePath:o&&l||void 0'],
    'per-turn-options': ['Ohe({host:e.host', '...p'],
    'send-each-turn': ['q_({session:e,workspace:c})', 'this.agentSidecarService.executeSession(A)'],
    'execute-session': ['vs.query({id:s,agentType:n'],
    'query-host-caller': ['U11.ensureWorkspace({ workspaceDir: L, options: V })'],
    'local-config-key': ['claudeExecutablePath: G(B.claudeExecutablePath ?? V?.executablePath)', 'claudeExecutablePath: Q.claudeExecutablePath'],
    'executable-resolver': ['U11?.trim()', 'return U11.trim()'],
    'host-reconciliation': ['A.configKey === D', 'session work in progress', 'A.host.stopAll()', 'A?.sessionStore'],
    'local-host-caller': ['resolveClaudeExecutablePath: Bh7', 'new rU6({ workspaceDir: U11, agentConfig: { ...D'],
    'host-constructor': ['agentRunnerFactory = gQ4({ ...G'],
    'agent-factory': ['new En4({ claudeExecutablePath: U11.claudeExecutablePath'],
    'runner-constructor': ['this.claudeExecutablePath = U'],
    'launch-options': ['rc3({ claudeExecutablePath: this.claudeExecutablePath'],
    'start-generator-launch-prefix': ['this.getClaudeLaunchOptions(', 'pathToClaudeCodeExecutable: W.claudeExecutablePath', 'this.queryFn({ prompt: H, options: b })'],
}.items():
    for literal in literals:
        assert literal in spans[label], (label, literal)
for file, expected in {
    'probe-template.rs': '90a3328dec58d2e9933f6f64aaebc47906a7b314310261cd5245339a2a4bce8f',
    'run-probe.py': '66bb754a69f2fcaa070e7719c2b077511295f231658b48b0ebc963a9421ac048',
}.items():
    assert sha((here / file).read_bytes()) == expected, file
paths = ['src-tauri/src/claude_chat/commands.rs', 'src-tauri/src/claude_chat/runner.rs']
commands, runner = [(root / p).read_text() for p in paths]
assert commands.count('crate::agent_launch::launch(') == 1
assert commands.index('spawn_blocking(move || {') < commands.index('options.executable_path = match')
assert 'runner.abandon_prompt(&chat_id);\n                return Err(error);' in commands
assert '.map_err(|e| e.to_string())??;' in commands
assert '#[serde(skip)]\n    pub executable_path: Option<PathBuf>' in runner
assert 'if let Some(path) = &options.executable_path { launch.executable = path.clone(); }' in runner
assert 'live.options == *options' in runner
for p in ['src-tauri/src/agent_launch.rs', 'src-tauri/src/settings/launch.rs', 'src-tauri/src/claude_chat/runner_tests.rs',
          'evidence/settings/local-environment-reconcile/probe-template.rs',
          'evidence/settings/linked-directories-reconcile/probe-template.rs',
          'evidence/settings/linked-directories-reconcile/chrome-successor-template.rs']:
    assert (root / p).read_bytes() == subprocess.check_output(['git', 'show', f'{baseline}:{p}']), p
checks = json.loads((here / 'checks.json').read_text())
scope_base = checks.get('fresh_main_readback', baseline)
changed = subprocess.check_output(['git', 'diff', '--name-only', scope_base], text=True).splitlines()
assert all(p in paths or p.startswith('evidence/settings/executable-reconcile/') for p in changed), changed
for log in checks['logs']:
    data = gzip.decompress((here / log['path']).read_bytes())
    assert sha(data) == log['raw_sha256'] and len(data) == log['raw_bytes']
print(json.dumps({'passed': True, 'retained_spans': 23, 'frozen_inputs': 2,
                  'lossless_logs': len(checks['logs']), 'scope': 'two backend files plus new evidence only',
                  'full_tauri_provider_native_package': 'NOT_RUN/unverified'}, indent=2))
