import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]


def sha(data):
    return hashlib.sha256(data).hexdigest()


source = json.loads((ROOT / 'source.json').read_text())
baseline = json.loads((ROOT / 'hosted-baseline.json').read_text())
checks = {}
expected_failed = set(baseline['intended_failed_cases'])
for platform, result in baseline['observed'].items():
    rows = result['case_lines']
    failed = {row['text'].split('::')[-1].split(' ... ')[0] for row in rows if row['text'].endswith(' ... FAILED')}
    passed = [row for row in rows if row['text'].endswith(' ... ok') and '::ipc_child ' not in row['text']]
    checks[f'actual-intended-RED:{platform}'] = failed == expected_failed and len(failed) == 4
    checks[f'actual-six-controls:{platform}'] = len(passed) == 6
checks['baseline-head-and-fixture'] = baseline['baseline_head'] == 'b21dcb9fc2046da3480f1576d535c203cb6d9f7f' and baseline['fixture_sha256'] == source['fixture_sha256']
fixture = REPO / 'src-tauri/src/open_in/deleted_finder_ipc.rs'
checks['frozen-ten-cases'] = sha(fixture.read_bytes()) == source['fixture_sha256']
checks['frozen-copy'] = fixture.read_bytes() == (ROOT / 'fixture-v1.rs.txt').read_bytes()
for path, digest in source['preserved_fixtures'].items():
    checks[f'preserved:{path}'] = sha((REPO / path).read_bytes()) == digest
migration = REPO / 'evidence/open-in/vscode-workspace-context/fixture-migration-v2'
checks['historical-frontend-control-preserved'] = (migration / 'filePathChipAlacritty.v1.test.ts.txt').read_bytes() == subprocess.check_output(['git', 'show', 'bb717dad2e1c4cbcbdba3d29d607a76a069f7f85:src/features/diff/filePathChipAlacritty.test.ts'], cwd=REPO)
subprocess.run(['python3', str(migration / 'verify.py')], check=True)
checks['installed-V2-only-VSCode-expectation-changed'] = True
for name, digest, app_id in [
    ('kaleidoscope_tests.rs', '4f3db0f8e7a8ce17854325bde5552fe3b02d25f10ad591ab21307af147ff0dcd', 'kaleidoscope'),
    ('wezterm_folder_tests.rs', '9a32644acd074bdf8f4e638c9709cb9064d57df0769fec39bd228876f761682f', 'wezterm'),
]:
    before = (ROOT / 'direct-call-baselines' / f'{name}.txt').read_bytes()
    checks[f'direct-call-prior-bytes:{name}'] = sha(before) == digest
    old = f'open_in_app("{app_id}".to_string(), dir_string)'.encode()
    new = f'open_in_app("{app_id}".to_string(), dir_string, None)'.encode()
    checks[f'direct-call-only-optional-argument:{name}'] = before.count(old) == 1 and (REPO / 'src-tauri/src/open_in' / name).read_bytes() == before.replace(old, new)
commands = (REPO / 'src-tauri/src/open_in/commands.rs').read_text()
apps = (REPO / 'src/features/openIn/apps.ts').read_text()
chip = (REPO / 'src/features/diff/FilePathChip.tsx').read_text()
view = (REPO / 'src/features/diff/FileDiffView.tsx').read_text()
checks['optional-explicit-context'] = 'file_context: Option<FileContext>' in commands and '#[serde(rename_all = "camelCase")]' in commands
checks['missing-Finder-only-boundary'] = 'else if app.id == "finder"' in commands and '.and_then(|context| deleted_finder_parent(target, context))' in commands
checks['absolute-target-guard-remains'] = 'if !target.is_absolute()' in commands
checks['existing-target-path-unchanged'] = 'if is_file || target.is_dir() {\n        target.to_path_buf()' in commands
checks['workspace-relative-component-validation'] = 'target.strip_prefix(root).ok()?' in commands and 'matches!(part, Component::Normal(_))' in commands
checks['absent-path-required'] = 'matches!(target.symlink_metadata(), Err(error) if error.kind() == std::io::ErrorKind::NotFound)' in commands
checks['symlink-traversal-rejected'] = 'metadata.file_type().is_symlink() => return None' in commands
checks['exact-immediate-parent-no-launch-ancestor-search'] = 'target.parent().map(Path::to_path_buf)' in commands and 'dir.ancestors()' not in commands
checks['deleted-header-caller-wired'] = 'deleted={file.status === "deleted"}' in view
checks['deleted-Finder-retains-context'] = 'deleted && appId === "finder" && worktree' in chip
checks['optional-context-forwarded-without-changing-other-payloads'] = '...(fileContext ? { fileContext } : {})' in apps
checks['frontend-integration-cases-present'] = (REPO / 'src/features/diff/deletedFinderContext.test.ts').is_file()
checks['safety-cases-present'] = 'fn fallback_stays_inside_an_existing_absolute_workspace()' in commands and 'fn fallback_refuses_symlinked_parents_and_broken_leaf_links()' in commands
failed = [name for name, passed in checks.items() if not passed]
print(json.dumps({'checks': len(checks), 'passed': sum(checks.values()), 'failed': failed, 'fixture_behavior': 'HOSTED_RED_OBSERVED', 'candidate_behavior': 'NOT_RUN', 'native_runtime': 'NOT_RUN'}))
if failed:
    raise SystemExit(1)
