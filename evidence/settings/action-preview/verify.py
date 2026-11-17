#!/usr/bin/env python3
"""Verify original asset/span identities, the frozen RED and narrow delivery scope."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

root = Path(__file__).parent
ref = json.loads((root / 'reference.json').read_text())
checks = []
def check(name, ok):
    if not ok:
        raise AssertionError(name)
    checks.append(name)
def sha(b):
    return hashlib.sha256(b).hexdigest()
def blob(commit, path):
    return subprocess.check_output(['git', 'show', commit + ':' + path])
base = '9f676a74b9763eacfced2489b01a81163900bed9'
assets = {}
for name, spec in ref['assets'].items():
    data = Path(spec['path']).read_bytes()
    check('whole original ' + name, len(data) == spec['bytes'] and sha(data) == spec['sha256'])
    assets[name] = data
for span in ref['spans']:
    start, end = span['utf8_half_open']
    data = assets[span['asset']][start:end]
    check('retained span ' + span['label'], len(data) == span['bytes'] and sha(data) == span['sha256'] and data == span['text'].encode())
for spec in ref['production']:
    check('fresh-main owner ' + spec['path'], sha(blob(base, spec['path'])) == spec['sha256'])
frozen = (root / 'frozen/preview.test.cjs').read_bytes()
check('frozen original fixture', sha(frozen) == '4ea0b334018ef8b5e8d1677978bb42261c507a509e47069d5716aff6a5d7c85b')
check('complete frozen component equals fresh main', (root / 'frozen/PromptRows.tsx.txt').read_bytes() == blob(base, 'src/settings/rows/PromptRows.tsx'))
marker = b'for (let i = 0; i < kinds.length; i++) {'
mounted = (root / 'mounted.cjs').read_bytes()
check('all frozen test bodies and assertions byte-identical', frozen[frozen.index(marker):] == mounted[mounted.index(marker):])
red = (root / 'red-current.tap').read_text()
for count in ['tests 7', 'pass 2', 'fail 5', 'skipped 0', 'cancelled 0']:
    check('decisive baseline ' + count, re.search(r'^# ' + count + '$', red, re.M) is not None)
check('all five failures are intended assertions', red.count("code: 'ERR_ASSERTION'") == 5 and red.count('exposes one Preview button') == 5)
check('no harness failure in RED', not any(x in red for x in ['SyntaxError', 'ReferenceError', 'Cannot find module', 'Unexpected Preview fixture dependency']))
for path, count in [('green-controls.tap', 14), ('affected.tap', 54)]:
    log = (root / path).read_text()
    check('passing receipt ' + path, all(re.search(r'^# ' + x + '$', log, re.M) for x in [f'tests {count}', f'pass {count}', 'fail 0', 'skipped 0', 'cancelled 0']))
command = Path('src-tauri/src/pr/commands.rs').read_text()
start = command.index('/// Settings Actions preview:')
end = command.index("/// The repository's PR template", start)
check('existing PR wrappers byte-identical', (command[:start] + command[end:]).encode() == blob(base, 'src-tauri/src/pr/commands.rs'))
lib = Path('src-tauri/src/lib.rs').read_text()
registration = '            pr::commands::pr_action_prompt_preview,\n'
check('only one matching handler registration', lib.count(registration) == 1 and lib.replace(registration, '').encode() == blob(base, 'src-tauri/src/lib.rs'))
css = Path('src/settings/rows/rows.css').read_text()
a = css.index('/* Actions Preview:')
b = css.index('.settings .oc-learn-how', a)
check('all older CSS selectors unchanged', (css[:a] + css[b:]).encode() == blob(base, 'src/settings/rows/rows.css'))
for path in ['src/settings/SettingsView.tsx', 'src/settings/rows/rowModel.ts', 'src/settings/prompts.ts', 'src/lib/persistence/producer.ts', 'src/features/diff/review.ts', 'src/features/pr/checks/fixErrors.ts', 'src-tauri/src/pr/prompt.rs', 'src/features/chat/claudeChat.ts', 'src/features/chat/reasonChat.ts']:
    check('preserved existing owner ' + path, Path(path).read_bytes() == blob(base, path))
allowed = {'src/settings/rows/PromptRows.tsx', 'src/settings/rows/rows.css', 'src/settings/actionPromptPreview.ts', 'src/settings/actionPromptPreview.test.ts', 'src-tauri/src/pr/commands.rs', 'src-tauri/src/lib.rs'}
changed = subprocess.check_output(['git', 'diff', '--name-only', base], text=True).splitlines()
check('exact collision-cleared delivery scope', all(path in allowed or path.startswith('evidence/settings/action-preview/') for path in changed))
subprocess.run(['git', 'diff', '--check', base], check=True)
result = {'author': 'Conductor Rebuild', 'base': base, 'checks': len(checks), 'passed': checks,
          'limits': ['Original JavaScript is never executed.', 'Mounted dialog/Markdown host boundaries and pure Rust IPC outputs are controlled.', 'Native Tauri transport, physical blur/focus/keyboard/pointer, rendered geometry/Markdown and installed/package acceptance remain unverified.']}
(root / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(f'PASS {len(checks)} original/freeze/baseline/scope checks')
