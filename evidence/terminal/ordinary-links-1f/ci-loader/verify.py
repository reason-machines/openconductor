"""Verify the narrow import-boundary correction without executing native APIs."""
from hashlib import sha256
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
BASELINE_SHA = 'a1bd44547ea40a93560b257e630ed169c810b7a8b115099859c73062595b4832'
FROZEN_SHA = '50cf0952aafe318cd48681bf66afccced2fa41a4a606593b5314ce88b5ca4fcc'
TARGET = 'evidence/resource-terminal-labels/regression.cjs'
ADDED = (
    "    '@tauri-apps/plugin-dialog': { confirm: unexpected },\n"
    "    'src/backend': { openUrl: unexpected },\n"
).encode()
checks = 0


def check(condition, description):
    global checks
    assert condition, description
    checks += 1


baseline = (ROOT / 'baseline-resource-labels.cjs.txt').read_bytes()
updated = (REPO / TARGET).read_bytes()
check(sha256(baseline).hexdigest() == BASELINE_SHA, 'archived baseline SHA-256')
check(baseline == subprocess.check_output(['git', 'show', f'331db83b3b6d5c4a29cdd83542eb6ebd7aedc3b6:{TARGET}'], cwd=REPO), 'archive equals failing hosted head')
check(updated.count(ADDED) == 1, 'exactly two announced throwing boundary entries')
check(updated.replace(ADDED, b'', 1) == baseline, 'all original assertions, invocations, expectations and source bytes unchanged')
check(b"const unexpected = () => { throw new Error(" in baseline, 'both edges reuse the existing throwing sentinel')
frozen = (REPO / 'src/features/terminal/ordinaryLinks.test.ts').read_bytes()
check(sha256(frozen).hexdigest() == FROZEN_SHA, 'encoded-link twelve-case fixture unchanged')
check(frozen == (ROOT.parent / 'frozen-ordinaryLinks.ts.txt').read_bytes(), 'fixture equals retained original')
for name, total, passed, failed in [('before.tap', 5, 0, 5), ('green.tap', 5, 5, 0), ('encoded-green.tap', 12, 12, 0)]:
    text = (ROOT / name).read_text()
    for field, value in [('tests', total), ('pass', passed), ('fail', failed)]:
        check(re.search(rf'^# {field} {value}$', text, re.M) is not None, f'{name}: {field}={value}')
red = (ROOT / 'before.tap').read_text()
check(red.count("error: '@tauri-apps/plugin-dialog'") == 5, 'all five baseline failures are the same import rejection')
check(red.count("code: 'ERR_ASSERTION'") == 5, 'all five reproduce the fixed loader allowlist assertion')
print(f'PASS {checks} CI-loader checks; two import-boundary entries only; no product or oracle changes')
