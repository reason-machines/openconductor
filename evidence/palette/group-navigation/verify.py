from pathlib import Path
import argparse
import hashlib
import gzip
import json
import re

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--baseline', action='store_true')
args = parser.parse_args()
sha = lambda raw: hashlib.sha256(raw).hexdigest()
source = json.loads((ROOT / 'source.json').read_text())
manifest = json.loads((ROOT / 'retained-manifest.json').read_text())
for span in manifest['spans']:
    raw = (ROOT / span['file']).read_bytes()
    lo, hi = span['utf8_half_open']
    assert len(raw) == span['bytes'] == hi - lo, span['file']
    assert sha(raw) == span['sha256'], span['file']
for span in source['reference']['wrapper_spans']:
    raw = (ROOT / span['path']).read_bytes()
    lo, hi = span['utf8_half_open']
    assert len(raw) == hi - lo and sha(raw) == span['sha256'], span['path']
for entry in source['current']:
    raw = (ROOT / entry['snapshot']).read_bytes()
    assert sha(raw) == entry['sha256'], entry['snapshot']
    if args.baseline:
        assert (REPO / entry['path']).read_bytes() == raw, entry['path']
expected, path = (ROOT / 'fixture.sha256').read_text().split()
assert sha((REPO / path).read_bytes()) == expected, path

# Inert source assertions only: never evaluate original Conductor JavaScript.
x = (ROOT / 'command-root-Xyi.txt').read_text()
assert 'ce.metaKey?te():ce.altKey?J(1):Q(1)' in x
assert 'ce.metaKey?X(0):ce.altKey?J(-1):Q(-1)' in x
assert 'function J(ce){let ae=G(),de=ae?.closest(Eve),ue;for(;de&&!ue;)de=ce>0?V5s(de,Eve):W5s(de,Eve),ue=de?.querySelector(_Bn);ue?P.setState("value",ue.getAttribute(bae)):Q(ce)}' in x
assert 'ce.nativeEvent.isComposing||ce.keyCode===229' in x
assert 'Eve=\'[cmdk-group=""]\'' in (ROOT / 'Eve.txt').read_text()
assert 'qyi=\'[cmdk-item=""]\'' in (ROOT / 'qyi.txt').read_text()
assert '_Bn=`${qyi}:not([aria-disabled="true"])`' in (ROOT / '_Bn.txt').read_text()
assert 'nextElementSibling' in (ROOT / 'V5s.txt').read_text()
assert 'previousElementSibling' in (ROOT / 'W5s.txt').read_text()
assert 'P6=Object.assign(Xyi,' in (ROOT / 'command-component-P6.txt').read_text()
assert 'Input:B5s' in (ROOT / 'command-component-P6.txt').read_text()
assert 'p.jsx(P6.Input,{ref:e,className:u,...r})' in (ROOT / 'Home-command-input-kI.txt').read_text()
assert '$.createElement(D6.input,{ref:e,...i,' in (ROOT / 'command-input-B5s.txt').read_text()
ma = (ROOT / 'm_a.txt').read_bytes()
consumer = source['reference']['input_consumer']
lo, hi = consumer['relative_utf8_half_open']
assert sha(ma[lo:hi]) == consumer['sha256']
assert b'p.jsx(kI,{' in ma[lo:hi] and b'onKeyDown' not in ma
assert 'p.jsx(P6,' in (ROOT / '../ime-composition/KV-wrapper.txt').read_text()
assert 'p.jsx(Y5s,' in (ROOT / '../ime-composition/qZ-dialog.txt').read_text()
assert 'p.jsx(KV,{loop:!0,' in (ROOT / '../ime-composition/Y5s-content.txt').read_text()
assert 'p.jsx(qZ,{id:Tk,commandProps:{filter:wUi}' in (ROOT / '../ime-composition/h_a-palette-caller.txt').read_text()
for receipt in json.loads((ROOT / 'red-log-identities.json').read_text()):
    raw = gzip.decompress((ROOT / receipt['path']).read_bytes())
    assert sha(raw) == receipt['uncompressed_sha256'] and len(raw) == receipt['uncompressed_bytes']
red = gzip.decompress((ROOT / 'red.tap.gz').read_bytes()).decode()
assert (ROOT / 'red.exit').read_text().strip() == '1'
assert re.findall(r'^not ok \d+ - (.+)$', red, re.M) == re.findall(r'^# Subtest: (Option\+.+)$', red, re.M)
assert len(re.findall(r"code: 'ERR_ASSERTION'", red)) == 18
assert '# tests 36' in red and '# pass 18' in red and '# fail 18' in red
assert len(re.findall(r'^ok \d+ - control:', red, re.M)) == 18
if not args.baseline:
    for file, count in [('green.tap', 36), ('section-controls.tap', 14), ('binding-controls.tap', 5), ('available-adjacent.tap', 183), ('recomposed-green.tap', 36), ('recomposed-section-controls.tap', 14), ('recomposed-binding-controls.tap', 5), ('recomposed-adjacent.tap', 183)]:
        output = (ROOT / file).read_text()
        for key, value in [('tests', count), ('pass', count), ('fail', 0), ('cancelled', 0), ('skipped', 0), ('todo', 0)]:
            assert re.search(rf'^# {key} {value}$', output, re.M), (file, key)
    baseline_component = (ROOT / 'main-CommandPalette.tsx').read_text()
    current_component = (REPO / 'src/palette/CommandPalette.tsx').read_text()
    def section_branch(component):
        start = component.index('    if (inSectionMode && moveToSection) {', component.index('  function onKeyDown('))
        return component[start:component.index('    if (cmd === "close") onClose();', start)]
    assert section_branch(baseline_component) == section_branch(current_component)
print(json.dumps({'integrity': 'PASS', 'raw_spans': 12, 'wrapper_spans': 6, 'source_chain': 'PASS', 'fixture_sha256': expected, 'baseline_unchanged': args.baseline, 'red': '18 expected assertion failures / 18 controls pass', 'green': 'NOT_CHECKED' if args.baseline else '36/36 + 14/14 section + 5/5 bindings + 183/183 available adjacent', 'browser_native_package': 'NOT_RUN'}))
