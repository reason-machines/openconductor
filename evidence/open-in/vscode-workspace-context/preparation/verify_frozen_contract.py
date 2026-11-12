import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    contract = json.loads((ROOT / 'contract-v1.json').read_text())
    payloads = {name: (ROOT / name).read_bytes() for name in contract['files']}
    checks = {f'sealed:{name}': sha(data) == contract['files'][name] for name, data in payloads.items()}
    cases = json.loads(payloads['cases.json'])
    rust = payloads['vscode_workspace_context_ipc.rs.txt'].decode()
    frontend = payloads['vscodeWorkspaceContext.test.ts.txt'].decode()
    ids = [case['id'] for case in cases['cases']]
    checks['ten_unique_scenarios'] = len(ids) == len(set(ids)) == 10
    checks['fixed_scenario_order'] = ids == contract['rust_expected_red'] + contract['rust_controls']
    checks['macos_registration_only'] = payloads['registration.rs.txt'] == b'#[cfg(all(test, target_os = "macos"))]\nmod vscode_workspace_context_ipc;\n'
    checks['one_child_entry_plus_ten_tests'] = rust.count('#[test]') == 11
    checks['real_tauri_handler_and_ipc'] = 'generate_handler![super::commands::open_in_app]' in rust and 'get_ipc_response(&webview, InvokeRequest' in rust
    checks['isolated_child_environment'] = all(token in rust for token in ['std::env::current_exe()', '.env("PATH", &bin)', '.env("HOME", root.join("home"))'])
    checks['independent_code_and_fallback_exit'] = all(token in rust for token in ['OC_CODE_EXIT', 'OC_OPEN_EXIT', 'open fixture failure'])
    checks['exact_argv_and_outcome_assertions'] = 'assert_eq!(json!(calls), case["calls"]' in rust and 'assert_eq!(response["ok"], case["ok"]' in rust and 'assert_eq!(response["error"], *error' in rust
    checks['empty_arguments_preserved'] = '.filter(|token| !token.is_empty())' not in rust and 'bytes[..bytes.len() - 1].split' in rust
    checks['normalization_is_prefix_only'] = 'token.strip_prefix(workspace.to_str().unwrap())' in rust and '.replace(' not in rust
    checks['shared_cases_in_both_stages'] = all('vscode-workspace-context/cases.json' in source for source in [rust, frontend])
    checks['enabled_actual_header_button'] = all(token in frontend for token in ['React.createElement(FileDiffView', 'assert.equal(button.type, "button")', 'assert.notEqual(button.props.disabled, true)', 'button.props.onClick()'])
    checks['loader_syntax_diagnostics_not_suppressed'] = 'reportDiagnostics: true' in frontend and 'ts.DiagnosticCategory.Error' in frontend
    checks['header_scenarios'] = [case['id'] for case in cases['cases'] if case['header']] == contract['frontend_expected_red'] + contract['frontend_controls']
    checks['no_fixture_nuls'] = all(b'\0' not in raw for raw in payloads.values())
    for case in cases['cases']:
        name = case['id']
        checks[f'rust_case:{name}'] = bool(re.search(r'fn ' + re.escape(name) + r'\(\)', rust))
        checks[f'fixed_typed_outcome:{name}'] = isinstance(case['ok'], bool) and case['exists'] in ['file', 'directory', 'missing']
        if name in contract['rust_expected_red']:
            expected = [['code', cases['workspace'], '--goto', cases['workspace'] + '/' + case['relative']]]
            if case['codeExit'] != 0:
                expected.append(['open', '-a', 'Visual Studio Code', cases['workspace'] + '/' + case['relative']])
            checks[f'explicit_argv:{name}'] = case['calls'] == expected
    source = json.loads((ROOT.parent / 'receipt.json').read_text())
    for name, spec in source['spans'].items():
        raw = (ROOT.parent / 'reference' / (name + '.txt')).read_bytes()
        checks[f'original_span:{name}'] = sha(raw) == spec['sha256'] and len(raw) == spec['bytes']
    for path, checksum in source['frozen'].items():
        checks[f'excluded_frozen:{path}'] = sha((REPO / path).read_bytes()) == checksum
    for source_path in ['src/features/openIn/apps.ts', 'src/features/diff/FilePathChip.tsx', 'src/features/diff/FileDiffView.tsx']:
        live = (REPO / source_path).read_text()
        imports = re.findall(r'^import (?!type\b)[^;]+?from [\"\x27]([^\"\x27]+)[\"\x27];', live, re.M)
        provided = set(re.findall(r'(?:^|[,{}])\s*"([^"\n]+)"\s*:', frontend, re.M)) | {'react', 'react/jsx-runtime'}
        checks[f'loader_import_coverage:{source_path}'] = set(imports) <= provided
    if args.self_test:
        for name, raw in payloads.items():
            checks[f'reject_tamper:{name}'] = sha(raw + b'\n') != contract['files'][name]
    failed = [name for name, passed in checks.items() if not passed]
    receipt = {
        'owner': 'Conductor Rebuild',
        'state': 'FROZEN_PREPARATION_ONLY',
        'contract_sha256': sha((ROOT / 'contract-v1.json').read_bytes()),
        'source_main': source['main_checked'],
        'delivery_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'checks': checks,
        'passed': sum(checks.values()),
        'failed': failed,
        'rust_typecheck_and_behavior': 'NOT_RUN',
        'typescript_typecheck_and_behavior': 'NOT_RUN',
        'hosted_vscode_baseline': 'NOT_RUN',
        'native': 'NOT_RUN',
        'publication': 'AFTER_1100_ACTUAL_MAIN_MERGE_AND_FRESH_REBIND',
    }
    (ROOT / 'frozen-preparation-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({key: receipt[key] for key in ['state', 'passed', 'failed', 'contract_sha256']}))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
