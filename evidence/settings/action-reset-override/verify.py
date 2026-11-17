#!/usr/bin/env python3
"""Verify retained source, fresh baseline identities and unchanged frozen assertions."""
import hashlib
import gzip
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
def sha(data):
    return hashlib.sha256(data).hexdigest()
assets = {}
for name, spec in ref['assets'].items():
    data = Path(spec['path']).read_bytes()
    check('whole original ' + name, len(data) == spec['bytes'] and sha(data) == spec['sha256'])
    assets[name] = data
for spec in ref['spans']:
    start, end = spec['utf8_half_open']
    data = assets[spec['asset']][start:end]
    check('complete literal ' + spec['asset'] + ':' + spec['label'], data == spec['text'].encode() and len(data) == spec['bytes'] and sha(data) == spec['sha256'])
for spec in ref['production']:
    data = subprocess.check_output(['git', 'show', ref['main'] + ':' + spec['path']])
    check('fresh-main owner ' + spec['path'], len(data) == spec['bytes'] and sha(data) == spec['sha256'])
frozen = (root / 'frozen/actionResetOverride.test.ts.txt').read_bytes()
check('frozen baseline fixture', sha(frozen) == ref['frozen_fixture_sha256'])
check('all baseline assertions byte-identical', Path('src/settings/actionResetOverride.test.ts').read_bytes().startswith(frozen))
red = gzip.decompress((root / 'baseline.tap.gz').read_bytes()).decode()
for count in ['tests 16', 'pass 2', 'fail 14', 'cancelled 0', 'skipped 0']:
    check('baseline ' + count, re.search(r'^# ' + count + '$', red, re.M) is not None)
check('14 intended assertion failures', red.count("code: 'ERR_ASSERTION'") == 14)
check('no baseline setup failure', not any(s in red for s in ['SyntaxError', 'ReferenceError', 'Cannot find module', 'Unexpected Actions Reset dependency']))
# Treatment checks add to the locked baseline, never replace its assertions.
for filename, count in [('treatment.tap', 16), ('adjacent.tap.gz', 54), ('adjacent-expanded.tap.gz', 91)]:
    log = gzip.decompress((root / filename).read_bytes()).decode() if filename.endswith('.gz') else (root / filename).read_text()
    check('passing ' + filename, all(re.search(r'^# ' + item + '$', log, re.M) for item in [f'tests {count}', f'pass {count}', 'fail 0', 'cancelled 0', 'skipped 0']))
old_model_test = (root / 'frozen/rowModel.test.ts.txt').read_text()
expected_model_test = old_model_test.replace('remove blanks and skip no-ops', 'preserve blank overrides and skip no-ops').replace('{ key: "prompts.code_review", value: null }', '{ key: "prompts.code_review", value: "" }')
check('only source-disproved old assertion is explicitly corrected', Path('src/settings/rows/rowModel.test.ts').read_text() == expected_model_test)
preview = Path('evidence/settings/action-preview/mounted.cjs').read_bytes()
preview_frozen = Path('evidence/settings/action-preview/frozen/preview.test.cjs').read_bytes()
marker = b'for (let i = 0; i < kinds.length; i++) {'
check('all seven frozen Preview bodies/assertions preserved', preview[preview.index(marker):] == preview_frozen[preview_frozen.index(marker):])
old_preview = subprocess.check_output(['git', 'show', ref['main'] + ':evidence/settings/action-preview/mounted.cjs'])
ports = b"      if (name === '@base-ui/react/menu') return { Menu: { Root: ({ children }) => children, Trigger: ({ children, ...props }) => React.createElement('button', props, children), Portal: () => null } };\n      if (name === '../../components/menu/menuIcons') return { EllipsisIcon: () => null };\n"
check('old Preview harness only gains declared import ports', preview.count(ports) == 1 and preview.replace(ports, b'') == old_preview)
css = Path('src/settings/rows/rows.css').read_text()
start, end = css.index('/* Actions Reset ('), css.index('/* Actions Preview:')
check('unrelated CSS selectors byte-identical', (css[:start] + css[end:]).encode() == subprocess.check_output(['git', 'show', ref['main'] + ':src/settings/rows/rows.css']))
for path in ['src/settings/SettingsView.tsx', 'src/settings/actionPromptPreview.ts', 'src/settings/prompts.ts', 'src/lib/persistence/producer.ts', 'src/settings/repoSettings.ts', 'src/settings/useRepoSettings.ts', 'src/features/diff/review.ts', 'src/features/pr/checks/fixErrors.ts', 'src-tauri/src/pr/prompt.rs', 'src-tauri/src/pr/commands.rs', 'src-tauri/src/lib.rs', 'src/features/chat/claudeChat.ts', 'src/features/chat/reasonChat.ts']:
    check('preserved adjacent owner ' + path, Path(path).read_bytes() == subprocess.check_output(['git', 'show', ref['main'] + ':' + path]))
identities = json.loads((root / 'resolver-probe-identities.json').read_text())
for path, digest in identities['real_config_sources'].items():
    check('Rust probe real production identity ' + path, sha(Path(path).read_bytes()) == digest)
check('Rust probe exact effective assertion bodies identity', sha(Path('crates/scripts/src/config/effective_tests.rs').read_bytes()) == identities['production_tests_sha256'])
check('Rust probe frozen resolver identity', sha((root / 'frozen/effective.rs.txt').read_bytes()) == identities['frozen_effective_sha256'])
rust_tests = Path('crates/scripts/src/config/effective_tests.rs').read_text()
a, b = rust_tests.index('#[test]\nfn prompts_blank_override_'), rust_tests.index('#[test]\nfn git_flags_and_branch_prefix_alias')
check('all prior Rust effective-test bodies preserved', (rust_tests[:a] + rust_tests[b:]).encode() == (root / 'frozen/effective_tests.rs.txt').read_bytes())
log = (root / 'rust-resolver-probe.log').read_text()
check('Rust frozen 18 pass/2 intended failures', log.count('baseline: ') == 20 and log.count('EXPECTED ASSERTION FAILURE') == 2)
check('Rust treatment 20/20 pass', len(re.findall(r'^treatment: .*: PASS$', log, re.M)) == 20)
check('blank source still excluded from normal get()', '.filter(|s| !s.trim().is_empty())' in Path('crates/scripts/src/config/effective.rs').read_text())
allowed = {'src/settings/rows/PromptRows.tsx', 'src/settings/rows/rowModel.ts', 'src/settings/rows/rowModel.test.ts', 'src/settings/rows/rows.css', 'crates/scripts/src/config/effective.rs', 'crates/scripts/src/config/effective_tests.rs', 'evidence/settings/action-preview/mounted.cjs', 'src/settings/actionResetOverride.test.ts'}
changed = subprocess.check_output(['git', 'diff', '--name-only', ref['main']], text=True).splitlines()
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], text=True).splitlines()
check('exact collision-cleared scope including new files', all(path in allowed or path.startswith('evidence/settings/action-reset-override/') for path in changed + untracked))
subprocess.run(['git', 'diff', '--check', ref['main']], check=True)
result = {'author': 'Conductor Rebuild', 'main': ref['main'], 'checks': len(checks), 'passed': checks, 'limits': ref['limits'] + ['Ordinary crate test command failed before compile: cached tempfile absent.', 'Substitute offline probe uses unchanged real config source and all 20 exact effective-test bodies with a std::fs RAII temporary-directory host.']}
(root / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
print('PASS', len(checks), 'retained-source/fresh-baseline/freeze checks')
