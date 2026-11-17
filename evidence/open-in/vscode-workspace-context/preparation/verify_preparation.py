import hashlib
import json
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent
fixture = json.loads((root / 'cases.json').read_text())
rust = (root / 'vscode_workspace_context_ipc.rs.txt').read_text()
frontend = (root / 'vscodeWorkspaceContext.test.ts.txt').read_text()
source = json.loads((root.parent / 'receipt.json').read_text())
ids = [case['id'] for case in fixture['cases']]
expected_red = ['workspace_file', 'literal_path', 'completed_nonzero_fallback', 'fallback_error']
checks = {
    'unique_ten_cases': len(ids) == len(set(ids)) == 10,
    'four_expected_red_six_controls': ids[:4] == expected_red and len(ids[4:]) == 6,
    'source_only_qualification_passed': not source['failed'] and len(source['checks']) == 48,
    'source_not_claimed_behavior': source['behavioral_RED_GREEN'] == 'NOT_RUN',
    'rust_drives_real_tauri_ipc': 'get_ipc_response(&webview, InvokeRequest' in rust and 'generate_handler![super::commands::open_in_app]' in rust,
    'rust_child_isolates_path': '.env("PATH", &bin)' in rust and 'std::env::current_exe()' in rust,
    'child_exit_modes_separate': 'OC_CODE_EXIT' in rust and 'OC_OPEN_EXIT' in rust,
    'calls_capture_arguments_and_order': "printf '%s\\\\000' '{name}'" in rust and 'std::mem::take(&mut call)' in rust,
    'frontend_loads_real_three_modules': all(path in frontend for path in ['../openIn/apps.ts', './FilePathChip.tsx', './FileDiffView.tsx']),
    'frontend_mounts_real_header': 'React.createElement(FileDiffView' in frontend and 'renderer.root.findByProps' in frontend,
    'shared_case_bytes': 'vscode-workspace-context/cases.json' in rust and 'vscode-workspace-context/cases.json' in frontend,
    'new_files_have_no_nuls': all(b'\0' not in (root / name).read_bytes() for name in ['cases.json', 'vscode_workspace_context_ipc.rs.txt', 'vscodeWorkspaceContext.test.ts.txt']),
    'no_tracked_repo_changes': not subprocess.check_output(['git', 'diff', 'HEAD', '--name-only']).strip(),
}
for case in fixture['cases']:
    checks['rust_case:' + case['id']] = bool(re.search(r'fn ' + case['id'] + r'\(\)', rust))
    checks['case_payload:' + case['id']] = isinstance(case['ok'], bool) and case['exists'] in ['file', 'directory', 'missing']
for index in [0, 1]:
    case = fixture['cases'][index]
    checks['exact_cli_shape:' + case['id']] = case['calls'] == [['code', fixture['workspace'], '--goto', fixture['workspace'] + '/' + case['relative']]]
for index in [2, 3]:
    case = fixture['cases'][index]
    checks['nonzero_only_fallback:' + case['id']] = case['codeExit'] != 0 and case['calls'] == [['code', fixture['workspace'], '--goto', fixture['workspace'] + '/' + case['relative']], ['open', '-a', 'Visual Studio Code', fixture['workspace'] + '/' + case['relative']]]
for path, checksum in source['frozen'].items():
    checks['frozen:' + path] = hashlib.sha256(Path(path).read_bytes()).hexdigest() == checksum
result = {
    'owner': 'Conductor Rebuild',
    'state': 'PREPARATION_ONLY_NOT_COMPILED_OR_EXECUTED',
    'delivery_priority': '#1100 then #1109 repair consumption and all exact-head workflows before merge',
    'source_checked_git_visible_main': source['main_checked'],
    'current_delivery_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'lease': 'Rust cfg(test) registration, new Rust IPC fixture and evidence only, after actual #1100 main merge and fresh rebind. Frontend draft has no publication lease yet.',
    'normalization_limit': 'Future runtime comparison replaces only generated temp workspace prefix with the shared literal fixture root; no argv order, file suffix, command, context or outcome is normalized.',
    'checks': checks,
    'passed': sum(checks.values()),
    'failed': [key for key, value in checks.items() if not value],
    'files': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in ['cases.json', 'vscode_workspace_context_ipc.rs.txt', 'vscodeWorkspaceContext.test.ts.txt']},
    'runtime': {'local_node': 'NOT_RUN', 'local_rust': 'NOT_RUN', 'native': 'NOT_RUN', 'hosted_vscode_baseline': 'NOT_RUN'},
}
(root / 'preparation-receipt.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['state', 'passed', 'failed']}))
assert not result['failed']
