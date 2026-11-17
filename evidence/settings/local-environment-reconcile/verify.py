"""Verify inert original bindings, frozen proof and exact source boundaries."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess

root = Path.cwd()
here = Path(__file__).resolve().parent
sha = lambda b: hashlib.sha256(b).hexdigest()
p = json.loads((here / 'reference.json').read_text())
spans = {}
for item in p['spans']:
    data = item['source'].encode()
    assert len(data) == item['bytes'] == item['end'] - item['start'], item['label']
    assert sha(data) == item['sha256'], item['label']
    spans[item['label']] = item['source']
checks = {
    'settings-env-map': ['scope:e,context:s', 'envVarsByContext[e]', 'r[o.key]=o.value'],
    'settings-env-save': ['INSERT INTO env_vars', 'ON CONFLICT(key, scope, context)'],
    'settings-env-delete': ['DELETE FROM env_vars WHERE key = ? AND scope = ? AND context = ?'],
    'settings-provider-env': ['await ng(i,{scope:"shared",context:e,workspaceContext:r})'],
    'env-serialization': ['Object.entries(t)', '.sort(', 'return e.join('],
    'local-settings-env': ['env:await XN(', 'ng(e,{scope:"shared",context:c,workspaceContext:n})', 'claudeEnvVars:Cd(_)'],
    'per-agent-env': ['await Mv(', 'agentType:"claude",envVars:Cd(k)'],
    'per-turn-options': ['await qxt(', 'Ohe({', 'agentParams:o,showThinking:_==="true",...p'],
    'send-each-turn': ['fn:()=>q_({session:e,workspace:c})', 'await this.agentSidecarService.executeSession(A)'],
    'execute-session': ['vs.query({id:s,agentType:n,message:r,prompt:i,options:{...o'],
    'local-config-key': ['B.claudeEnvVars ?? V?.envVars', 'claudeEnvVars: P ?? null', 'configKey:', 'agentConfig: Q'],
    'host-reconciliation': ['A.configKey === D', 'cy7(A.sessionStore) || V?.(G) === true', 'await A.host.stopAll()', 'A?.sessionStore ?? aQ4()'],
    'local-host-caller': ['await zd5(', 'await Od5(', 'agentConfig: { ...D'],
    'query-host-caller': ['U11.ensureWorkspace({ workspaceDir: L, options: V })'],
    'settings-editor-save': ['await _Z(zo,{key:v,scope:n,context:i,value:x,target:r})', 'await Ale(zo,'],
}
for label, tokens in checks.items():
    for token in tokens:
        assert token in spans[label], (label, token)
c = json.loads((here / 'checks.json').read_text())
assert c['fixture_sha256'] == sha((here / 'probe-template.rs').read_bytes()) == '8e663e6df3a40c96f7854fdf6705434f26b593ab941f265e43bb7ce16f4fd0fc'
assert c['driver_sha256'] == sha((here / 'run-probe.py').read_bytes()) == '87ce51b757f5c2a43a77525d4e0ced37b114add4d74abd9ec1f2b2fb5e15a79e'
for item in c['logs'].values():
    data = (root / item['path']).read_bytes()
    assert sha(data) == item['gzip_sha256']
    raw = gzip.decompress(data)
    assert len(raw) == item['raw_bytes'] and sha(raw) == item['raw_sha256']
assert b'test result: FAILED. 6 passed; 6 failed;' in gzip.decompress((here / 'logs/red.log.gz').read_bytes())
assert b'test result: ok. 14 passed; 0 failed;' in gzip.decompress((here / 'logs/green.log.gz').read_bytes())
for name in ['probe-template.rs', 'run-probe.py', 'chrome-successor-template.rs', 'run-chrome-successor.py']:
    path = 'evidence/settings/linked-directories-reconcile/' + name
    assert (root / path).read_bytes() == subprocess.check_output(['git', 'show', p['baseline'] + ':' + path])
for path in ['src-tauri/src/settings/effective.rs', 'src-tauri/src/settings/stored_env.rs',
             'src-tauri/src/settings/launch.rs', 'src-tauri/src/local_plan_mode.rs',
             'src-tauri/src/claude_chat/runner_tests.rs', 'src-tauri/src/agent/env.rs',
             'src-tauri/src/agent/secret.rs', 'src-tauri/src/claude_chat/interact.rs']:
    assert (root / path).read_bytes() == subprocess.check_output(['git', 'show', p['baseline'] + ':' + path]), path
commands = (root / 'src-tauri/src/claude_chat/commands.rs').read_text()
runner = (root / 'src-tauri/src/claude_chat/runner.rs').read_text()
assert commands.count('crate::settings::effective::local_env_for_dir(cwd)') == 1
assert 'options.local_env = cwd.as_deref().map(|cwd| {' in commands
assert '#[serde(skip)]\n    pub local_env:' in runner
assert 'crate::agent::SecretString::new(value)' in commands
assert 'live.directories == directories && live.options == *options' in runner
preparation = runner[runner.index('    fn ensure_live('):]
assert preparation.index('if !st.waiting.is_empty()') < preparation.index('session.kill()')
assert preparation.index('launch.env.set_secret(key, value.clone())') < preparation.index('let mut session = ClaudeSession::spawn(&launch)')
for label in ['model', 'effort', 'permission_mode', 'chrome_enabled']:
    assert f'options.{label}' in runner
print(f'PASS: {len(p["spans"])} exact inert spans/caller joins; frozen fixture+driver; 7 lossless logs; inherited fixtures and 8 production controls; once-per-turn/redacted/skipped/key/busy/pre-spawn contracts. Not runtime acceptance.')
