"""Verify retained inert source/caller bindings and preservation; never run vendor JS."""
from pathlib import Path
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent
p = json.loads((root / 'reference.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
parents = []
for record in p['inherited']:
    data = Path(record['path']).read_bytes()
    assert sha(data) == record['sha256'], record['path']
    parents.append(json.loads(data))
auto, chrome = parents
assert auto['bundle_sha256'] == chrome['bundle_sha256'] == p['bundle_sha256']
assert auto['binary_sha256'] == chrome['inherited_container_binding']['binary_sha256']
spans = {}
for parent in parents:
    for span in parent['spans']:
        data = span['source'].encode()
        assert len(data) == span['bytes'] == span['end'] - span['start']
        assert sha(data) == span['sha256'], span['label']
        spans[span['label']] = span['source']
assert 'additionalDirectories: { kind: "recreate" }' in spans['policy']
assert 'JSON.stringify(U ?? []) === JSON.stringify(B ?? [])' in spans['helpers']
assert 'case "recreate":\n      return true;' in spans['helpers']
assert '!WB5(G[D], B.appliedConfig[D])' in spans['helpers']
assert 'additionalDirectories: O.array(O.string()).optional()' in spans['query-options-schema']
assert 'additionalDirectories: B.additionalDirectories' in spans['query-to-config']
assert 'additionalDirectories: V.additionalDirectories' in spans['query-handler']
assert 'config: Q' in spans['query-handler']
assert 'return CB5({ policy: Ln4' in spans['runner-reconcile']
assert 'M = await j(A)' in spans['live-reconciliation']
assert 'else\n      N = L' in spans['live-reconciliation']
assert 'this.resumeForRestart(' in spans['runner-reconcile']
assert 'this.startGenerator(U, G, { resume: L' in spans['runner-reconcile']
assert 'canRecreate: !M.inProgress' in spans['runner-message']
assert 'additionalDirectories: B.additionalDirectories ?? []' in spans['launch']

local = {}
for span in p['local_spans']:
    data = Path(span['path']).read_bytes()[span['start']:span['end']]
    assert len(data) == span['bytes'] and data == span['source'].encode()
    assert sha(data) == span['sha256']
    local[span['label']] = span['source']
assert 'workspace_links::resolve(&db.0, &id)' in local['local-directory-resolution']
assert 'expected != cwd' in local['local-directory-resolution']
assert '!path.is_absolute()' in local['local-directory-resolution']
assert '&directories,\n                &options,' in local['local-dispatch']
assert 'args.extend(["--add-dir".into(), dir.display().to_string()])' in local['local-launch-directory-args']

assert sha((root / 'probe-template.rs').read_bytes()) == p['frozen_fixture_sha256']
assert p['frozen_fixture_sha256'] == '2442793b8b979b8633779f6407776c7dd4d7406e6df5c38a6f75fd2f159b10a4'
assert sha((root / 'run-probe.py').read_bytes()) == p['frozen_driver_sha256']
archived = Path('evidence/settings/chrome-reconcile/probe-template.rs').read_bytes()
assert sha(archived) == p['archived_chrome_fixture_sha256']
expected = archived.decode().replace(
    'fn chrome_preserves_existing_plan_fast_model_effort_and_directory_guards()',
    'fn chrome_preserves_plan_fast_model_effort_and_reconciles_directories()',
).replace(
    '    assert!(runner(true).ensure_live("chat", &mut linked, &["/other".into()], &opts(false)).is_err());\n'
    '    assert_eq!(session.lock().unwrap().kills, 0);',
    '    let launch = runner(true).ensure_live("chat", &mut linked, &["/other".into()], &opts(false)).unwrap().unwrap();\n'
    '    assert!(!launch.chrome);\n'
    '    assert_eq!(launch.add_dirs, vec![PathBuf::from("/other")]);\n'
    '    assert_eq!(launch.resume.as_deref(), Some("observed"));\n'
    '    assert_eq!(session.lock().unwrap().kills, 1);',
)
assert (root / 'chrome-successor-template.rs').read_text() == expected
assert sha(expected.encode()) == p['chrome_successor_fixture_sha256']

for control in p['unchanged_production']:
    data = Path(control['path']).read_bytes()
    assert sha(data) == control['sha256'], control['path']
    assert data == subprocess.check_output(['git', 'show', p['baseline'] + ':' + control['path']])
runner_path = 'src-tauri/src/claude_chat/runner.rs'
runner = Path(runner_path).read_text()
baseline = subprocess.check_output(['git', 'show', p['baseline'] + ':' + runner_path], text=True)
old = '''                if live.directories != directories {
                    return Err("Linked directories changed. Start a new Claude Code chat to apply them; live-session directory changes are not supported yet.".into());
                }
                if live.options == *options {'''
new = '                if live.directories == directories && live.options == *options {'
assert baseline.count(old) == 1
expected_runner = baseline.replace(old, new).replace(
    'before changing model, effort, Fast, Plan or Chrome mode.',
    'before changing linked directories, model, effort, Fast, Plan or Chrome mode.',
)
assert runner == expected_runner, 'No runner change outside the leased reuse/busy boundary'
assert runner.index('launch.add_dirs = directories.to_vec();') < runner.index('let mut session = ClaudeSession::spawn(&launch)')
print('PASS: retained policy/query/recreate/resume/SDK joins, 3 exact local caller/argv spans, frozen fixture+driver, explicit Chrome successor delta, 8 unchanged production controls, exact bounded runner diff. Static/pure evidence only.')
