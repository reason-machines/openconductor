#!/usr/bin/env python3
"""Verify retained source, baseline, frozen regression and the exact treatment."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
sha = lambda raw: hashlib.sha256(raw).hexdigest()
manifest = json.loads((OUT / 'source.json').read_text())
assets_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.rea-work/dlg-pr-title-cancel-focus-retained'
assets = {key: (assets_dir / name).read_bytes() for key, name in [
    ('renderer', 'renderApp-D_fmY7hW.js'), ('index', 'index-BGEQ8YjU.js'),
]}
assert {key: sha(raw) for key, raw in assets.items()} == manifest['asset_sha256']
for record in manifest['spans']:
    start, end = record['utf8_half_open']
    raw = assets[record['asset']][start:end]
    assert sha(raw) == record['sha256'], record['name']
    assert raw == (OUT / record['file']).read_bytes(), record['file']

component = 'src/components/QuickOpenDialog.tsx'
replacements = [
    ('import { fuzzyFilterFiles } from "../backend";',
     'import { fuzzyFilterFiles } from "../backend";\nimport { useKeybindingOverrides } from "../keybindings/KeybindingsProvider";\nimport { effectiveShortcuts } from "../keybindings/overrides";\nimport { matchesEvent } from "../keybindings/shortcut";'),
    ('export function QuickOpenDialog({ repoId, workspacePath, onClose, onOpen }: Props) {\n  const [query, setQuery] = useState("");',
     'export function QuickOpenDialog({ repoId, workspacePath, onClose, onOpen }: Props) {\n  const { overrides } = useKeybindingOverrides();\n  const [query, setQuery] = useState("");'),
    ('  function onKeyDown(e: KeyboardEvent) {\n    const k = quickOpenKey(e);',
     '  function onKeyDown(e: KeyboardEvent) {\n    if (effectiveShortcuts("dialog.primaryAction", overrides).some((key) => matchesEvent(key, e.nativeEvent))) {\n      e.preventDefault();\n      e.stopPropagation();\n      pick(rows[selected], "diff");\n      return;\n    }\n    const k = quickOpenKey(e);'),
    ('    else if (k.kind === "open") pick(rows[selected], k.mode);',
     '    else if (k.kind === "open") pick(rows[selected], "file");'),
]
for record in manifest['current_sources']:
    path = record['path']
    original = (OUT / 'baseline' / path).read_bytes()
    assert sha(original) == record['sha256'], path
    assert original == subprocess.check_output(['git', 'show', f"{manifest['main_checked']}:{path}"], cwd=ROOT), path
    expected = original.decode()
    if path == component:
        for before, after in replacements:
            assert expected.count(before) == 1, before
            expected = expected.replace(before, after)
    assert (ROOT / path).read_text() == expected, path
fixture = (ROOT / 'src/components/quickOpenPrimaryOverride.test.ts').read_bytes()
assert fixture == (OUT / 'frozen/quickOpenPrimaryOverride.test.ts.txt').read_bytes()
assert sha(fixture) == (OUT / 'fixture.sha256').read_text().split()[0]
for name, passes, failures in [('baseline.tap', 4, 8), ('treatment.tap', 12, 0), ('adjacent-baseline.tap', 28, 0), ('adjacent-treatment.tap', 28, 0)]:
    log = (OUT / name).read_text()
    for line in [f'# pass {passes}', f'# fail {failures}', '# cancelled 0', '# skipped 0']:
        assert line in log.splitlines(), (name, line)
result = {
    'result': 'PASS', 'main_checked': manifest['main_checked'],
    'assets': len(assets), 'source_bindings': len(manifest['spans']),
    'current_source_pins': len(manifest['current_sources']),
    'product_replacements': len(replacements), 'legacy_test_edits': 0,
    'frozen12_sha256': sha(fixture), 'baseline': '4 pass / 8 intended failures',
    'treatment': '12 pass', 'adjacent_before_and_after': '28 pass',
    'limits': 'Source/mounted callback evidence only; no original, native or packaged runtime claimed',
}
print(json.dumps(result, indent=2))
