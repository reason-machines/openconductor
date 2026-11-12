#!/usr/bin/env python3
"""Verify retained Conductor source, the bounded patch, and frozen test receipts."""
import argparse
import gzip
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--originals', required=True, type=Path)
args = parser.parse_args()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def at_main(path):
    return subprocess.check_output(['git', 'show', f'{source["main_checked"]}:{path}'], cwd=ROOT)


source = json.loads((OUT / 'source.json').read_text())
frozen = json.loads((OUT / 'frozen.json').read_text())
clear = json.loads((ROOT / 'evidence/terminal/clear-redraw-1f/source/reference.json').read_text())
assets = {}
for item in clear['artifacts']:
    data = (args.originals / item['name']).read_bytes()
    assert len(data) == item['bytes'] and sha(data) == item['sha256'], item['name']
    assets[item['artifact']] = data

texts = {}
for span in source['caller_spans_revalidated']:
    name = span.get('symbol', span.get('name'))
    start, end = span['utf8_half_open']
    data = assets[span.get('artifact', span.get('asset', 'renderer'))][start:end]
    retained = (ROOT / 'evidence/terminal/clear-redraw-1f/source' / span['file']) if name == 'eSa' else (ROOT / 'evidence/scripts/output-cursor-1f/reference' / f'{name}.txt')
    assert data == retained.read_bytes() and sha(data) == span['sha256'], name
    texts[name] = data.decode()

joins = {
    'eSa': 'terminalRef:H}=w9e(P)',
    'w9e': 'dno({container:ve',
    'dno': 'm=await uno({',
    'uno': 'd=cno({',
    'cno': 'c=lno({',
    'lno': 'theme:IJe({showCursor:r})',
}
for name, call in joins.items():
    assert call in texts[name], name
for field, suffix in source['color_mapping'].items():
    assert f'{field}:F3("--terminal-{suffix}")' in texts['IJe'], field

for path, expected in source['main_sources'].items():
    data = at_main(path)
    assert len(data) == expected['bytes'] and sha(data) == expected['sha256'], path

path = 'src/features/terminal/session.ts'
baseline = at_main(path).decode()
needle = '      selectionInactiveBackground: withAlpha(cssVar("--accent"), "4d"),\n'
assert baseline.count(needle) == 1
insert = ''.join(f'      {field}: cssVar("--terminal-{suffix}"),\n' for field, suffix in source['color_mapping'].items())
assert (ROOT / path).read_text() == baseline.replace(needle, needle + insert), 'product diff exceeds 16 constructor mappings'

existing = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', source['main_checked'], '--', 'src/features/terminal'], cwd=ROOT, text=True).splitlines()
for path in existing:
    if path != 'src/features/terminal/session.ts':
        assert (ROOT / path).read_bytes() == at_main(path), path
for path in ['src/components/ScriptOutput.tsx', 'src/theme/scriptTerminal.css']:
    assert (ROOT / path).read_bytes() == at_main(path), path

original = (OUT / frozen['original_fixture']).read_bytes()
repaired = (OUT / frozen['repaired_fixture']).read_bytes()
fixture = (ROOT / frozen['fixture']).read_bytes()
data = (ROOT / frozen['data_fixture']).read_bytes()
assert sha(original) == frozen['original_sha256']
assert sha(repaired) == frozen['repaired_sha256']
assert sha(fixture) == frozen['sha256'] and sha(data) == frozen['data_sha256']
assert repaired == original.replace(b'assert.deepEqual(first.screen.options.theme, before);', b'assert.deepEqual({ ...first.screen.options.theme }, before);'), 'fixture repair exceeds cross-context normalization'
extraction = json.loads((OUT / 'data-extraction.json').read_text())
old = repaired.decode()
start = old.index('const palette = [')
end = old.index('function fixture(', start)
block = old[start:end]
expected_data = 'import type { ITheme } from "@xterm/xterm";\n\n' + block.replace('const palette = [', 'export const palette = [', 1) + 'export const fixtureColors = ' + json.dumps(extraction['colors'], indent=2) + ' as const;\n'
expected_fixture = (old[:start] + old[end:]).replace('ITerminalOptions, ITheme', 'ITerminalOptions')
expected_fixture = expected_fixture.replace('const deps = createRequire', 'import { palette, fixtureColors } from "../../theme/terminalAnsiThemeFixture.ts";\n\nconst deps = createRequire', 1)
for key, value in extraction['colors'].items():
    assert json.dumps(value) in old, key
    expected_fixture = expected_fixture.replace(json.dumps(value), f'fixtureColors.{key}')
assert data == expected_data.encode() and fixture == expected_fixture.encode(), 'fixture extraction changed data, inputs, or assertions'

for filename, record in json.loads((OUT / 'logs.json').read_text()).items():
    raw = gzip.decompress((OUT / record['raw_file']).read_bytes())
    display = (OUT / filename).read_bytes()
    assert sha(raw) == record['raw_sha256'] and sha(display) == record['display_sha256']
    normalized = ('\n'.join(line.rstrip() for line in raw.decode().splitlines()).rstrip() + '\n').encode()
    assert display == normalized, filename

for filename, passed, failed in [('red-original.tap', 3, 17), ('red.tap', 4, 16), ('green.tap', 20, 0), ('adjacent.tap', 208, 0), ('red-extracted.tap', 4, 16), ('green-extracted.tap', 20, 0)]:
    log = (OUT / filename).read_text()
    for label, value in [('tests', passed + failed), ('pass', passed), ('fail', failed), ('cancelled', 0), ('skipped', 0)]:
        assert re.search(rf'^# {label} {value}$', log, re.M), (filename, label)
for filename in ['red.tap', 'red-extracted.tap']:
    red = (OUT / filename).read_text()
    assert re.findall(r'^not ok (\d+) - ordinary terminal uses computed ', red, re.M) == [str(i) for i in range(1, 17)]
assert 'check-colors: no colour literals outside src/theme/ and no hue under Neutral' in (OUT / 'colors.txt').read_text()
for path in ['scripts/check-colors.mjs', 'scripts/check-colors.test.mjs']:
    assert (ROOT / path).read_bytes() == at_main(path), path
assert 'tsc --noEmit' in (OUT / 'typecheck.txt').read_text()
print(json.dumps({'main_checked': source['main_checked'], 'original_assets': len(assets), 'full_source_spans': len(texts), 'ansi_fields': len(source['color_mapping']), 'fixture_sha256': sha(fixture), 'exact_product_diff': '16 constructor mappings only', 'existing_terminal_files_unchanged': len(existing) - 1, 'red': {'fail': 16, 'pass': 4}, 'green': {'pass': 20}, 'adjacent': {'pass': 208}, 'runtime_native_visual': 'NOT_RUN'}))
