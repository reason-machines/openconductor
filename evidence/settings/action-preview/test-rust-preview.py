#!/usr/bin/env python3
"""Test the exact production preview command body with the real pure Rust builders.

No Cargo, Tauri app, file/settings reads, git, provider or native runtime is launched.
Only the tauri attribute is outside this standalone compilation; IPC macro wiring
and app behavior remain separate acceptance requirements.
"""
from pathlib import Path
import subprocess
import tempfile
import hashlib

root = Path(__file__).resolve().parents[3]
commands = (root / 'src-tauri/src/pr/commands.rs').read_text()
start = commands.index('pub fn pr_action_prompt_preview(')
end = commands.index('\n}\n', start) + 2
body = commands[start:end]
assert commands[start-len('#[tauri::command]\n'):start] == '#[tauri::command]\n'
assert (root / 'src-tauri/src/lib.rs').read_text().count('pr::commands::pr_action_prompt_preview,') == 1
assert 'std::' not in body and 'crate::settings' not in body and 'Command' not in body
prompt = root / 'src-tauri/src/pr/prompt.rs'
tests = r'''
#[test]
fn create_preview_uses_actual_builder_and_never_resolves_a_repo() {
    for custom in ["", " \n ", "  Synthetic Create PR draft.\nSecond line.  "] {
        let actual = commands::pr_action_prompt_preview("create_pr".into(), custom.into()).unwrap();
        let expected = prompt::create_pr_prompt(&prompt::CreatePrRequest {
            branch: "${YOUR_BRANCH}", remote: "origin", target_branch: "${TARGET_BRANCH}",
            title: Some("${PR_TITLE}"), description: Some("${PR_DESCRIPTION}"),
            custom_instructions: Some(custom), ..Default::default()
        });
        assert_eq!(actual, expected);
        assert!(actual.contains("${YOUR_BRANCH}"));
        assert!(actual.contains("${TARGET_BRANCH}"));
        assert!(actual.contains("${PR_TITLE}"));
        assert!(actual.contains("${PR_DESCRIPTION}"));
        assert_eq!(actual.contains("## User preferences"), !custom.trim().is_empty());
        if !custom.trim().is_empty() { assert!(actual.ends_with(custom.trim())); }
    }
}
#[test]
fn conflict_preview_uses_actual_rebase_builder() {
    for custom in ["", " \n ", "  Synthetic conflict draft.\nKeep this.  "] {
        let actual = commands::pr_action_prompt_preview("resolve_merge_conflicts".into(), custom.into()).unwrap();
        assert_eq!(actual, prompt::resolve_merge_conflicts_prompt(&prompt::ResolveConflictsRequest {
            target_branch: "${TARGET_BRANCH}", use_rebase: true, custom_instructions: Some(custom)
        }));
        assert!(actual.contains("Rebase"));
        assert!(actual.contains("${TARGET_BRANCH}"));
        assert_eq!(actual.contains("## Repository instructions"), !custom.trim().is_empty());
        if !custom.trim().is_empty() { assert!(actual.ends_with(custom.trim())); }
    }
}
#[test]
fn native_preview_refuses_all_other_kinds() {
    for kind in ["general", "code_review", "rename_branch", "fix_errors", "", "unknown"] {
        assert_eq!(commands::pr_action_prompt_preview(kind.into(), "synthetic".into()), Err("Unsupported prompt preview kind".into()));
    }
}
'''
with tempfile.TemporaryDirectory(prefix='oc-preview49-') as tmp:
    harness = Path(tmp) / 'preview.rs'
    # The only production transformation is omission of the Tauri attribute.
    harness.write_text(f'#![allow(dead_code)]\n#[path = "{prompt}"] mod prompt;\nmod commands {{\nuse super::prompt::{{create_pr_prompt, resolve_merge_conflicts_prompt, ResolveConflictsRequest}};\n{body}\n}}\n{tests}')
    binary = Path(tmp) / 'preview-tests'
    subprocess.run(['rustc', '--edition=2021', '--test', '-D', 'warnings', str(harness), '-o', str(binary)], check=True)
    subprocess.run([str(binary), '--test-threads=1'], check=True)
print('PASS exact command body SHA-256', hashlib.sha256(body.encode()).hexdigest())
print('PASS one actual IPC registration; Tauri macro/runtime not compiled or exercised')
