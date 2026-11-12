import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
manifest = json.loads((HERE / 'manifest.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('--asset', type=Path)
args = parser.parse_args()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*argv, env=None):
    return subprocess.check_output(['git', *argv], cwd=ROOT, env=env)


for span in manifest['spans']:
    data = (HERE / span['path']).read_bytes()
    assert digest(data) == span['sha256'], span['symbol']
    assert len(data) == span['end_utf8_byte'] - span['start_utf8_byte'], span['symbol']

if args.asset:
    raw = args.asset.read_bytes()
    assert digest(raw) == manifest['asset']['sha256']
    assert len(raw) == manifest['asset']['bytes']
    for span in manifest['spans']:
        assert raw[span['start_utf8_byte']:span['end_utf8_byte']] == (HERE / span['path']).read_bytes()

refs = {span['symbol']: (HERE / span['path']).read_text() for span in manifest['spans']}
for name, snippets in {
    'P9': ['I==="icon"', 'p.jsx(Tm,{align:"end",children:p.jsx(cFn,', 'p.jsxs(h2,', '_t=xd(_vs)', 'p.jsx(E1,{role:"menu",className:Ct,onKeyDown:_t'],
    'h2-Sg': ['p.jsx(oF,{...a,open:h,onOpenChange:m,actionsRef:g,modal:v,children:n})', 'p.jsx(Ede,'],
    'Tm': ['p.jsx(m2,{ref:z,className:J,finalFocus:te,onKeyDown:Z,...g})', 'de.preventBaseUIHandler()', 'm?.(de)'],
    'm2': ['{store:u}=f5()', 'v=u.useState("popupProps")', 'props:[v,'],
    'menu-context': ['$.useContext(dMt)'],
    'oF': ['loopFocus:d=!0', 'SLt(xe,{enabled:!X,listRef:D.context.itemDomElements', 'r_(CZ,', 'Ze.floating,ze.floating,je.floating', 'JSe(D,{', 'popupProps:Ue', 'p.jsxs(dMt.Provider,'],
    'JSe': ['t.useSyncedValues(e)'],
    'SLt': ['z=c8t(F)', 'Ue.which===229', 'Ue.key==="Home"&&(Z_(Ue),J.current=Ve,se(Ue))', 'Ue.key==="End"&&(Z_(Ue),J.current=He,se(Ue))', 'Ve=Gze(n,x),He=d8t(n,x)', 'qze(it,{sync:de.current,preventScroll:!0})', 'dH(n.current,i)||(J.current=i,ke()', 'Le(Ue)'],
    'combobox-guard': ['getAttribute("role")==="combobox"'],
    'Ede': ['nativeButton:c=!0', 'Es("button",'],
    'consume-event': ['t.preventDefault(),t.stopPropagation()'],
    'cFn': ['p.jsxs(Yc,', 'o.itemLabel'],
    'Yc': ['p.jsx(Pu,'],
    'Pu': ['wD({guess:!0,label:a})', 'ref:[O,n,g.ref]'],
    'register-item': ['w&&a(w,{metadata:i??null,index:o??null,label:n,textRef:r})'],
    'collect-items': ['n.current[P.index]=P.element'],
    'item-order': ['i.sort((o,a)=>h0i(o.element,a.element))'],
    'first-last-item': ['function Gze(', 'function d8t(', 'Ice(t,o,i)'],
    'disabled-item': ['r.hasAttribute("disabled")', 'r.getAttribute("aria-disabled")==="true"'],
    'focus-item': ['t?.focus({preventScroll:n})'],
    'split-arrows': ['t.key!=="ArrowDown"&&t.key!=="ArrowUp"'],
}.items():
    for snippet in snippets:
        assert snippet in refs[name], (name, snippet)

baseline = git('show', f"{manifest['main_checked']}:{manifest['baseline']['path']}")
assert digest(baseline) == manifest['baseline']['sha256']
current = git('rev-parse', 'origin/main').decode().strip()
assert git('show', f"{current}:{manifest['baseline']['path']}") == baseline, 'Current-main hunk changed. Reconcile before staging.'
sealed = (HERE / manifest['candidate']['path']).read_bytes()
assert digest(sealed) == manifest['candidate']['compressed_sha256']
patch = gzip.decompress(sealed)
assert digest(patch) == manifest['candidate']['sha256']
fixture = (HERE / manifest['fixture']['path']).read_bytes()
assert digest(fixture) == manifest['fixture']['sha256']
with tempfile.TemporaryDirectory(prefix='oc-icon-menu-source-') as temporary:
    env = dict(os.environ, GIT_INDEX_FILE=str(Path(temporary) / 'index'))
    patch_path = Path(temporary) / 'candidate.diff'
    patch_path.write_bytes(patch)
    git('read-tree', manifest['main_checked'], env=env)
    git('apply', '--cached', '--check', str(patch_path), env=env)
    git('apply', '--cached', str(patch_path), env=env)
    changed = git('diff', '--cached', '--name-only', manifest['main_checked'], env=env).decode().splitlines()
    assert changed == [manifest['baseline']['path']], changed
    candidate = git('show', f":{manifest['baseline']['path']}", env=env)
    assert digest(candidate) == manifest['candidate']['result_sha256']
    before_escape = baseline.split(b'    if (e.key === "Escape") {', 1)
    after_escape = candidate.split(b'    if (e.key === "Escape") {', 1)
    assert before_escape[0] == after_escape[0]
    assert before_escape[1].split(b'      return;\n    }', 1)[0] == after_escape[1].split(b'      return;\n    }', 1)[0]
    assert baseline.split(b'  const mainLabel =', 1)[1] == candidate.split(b'  const mainLabel =', 1)[1]
print(json.dumps({'source_checks': 'PASS', 'main_checked': current, 'reference_spans': len(manifest['spans']), 'patch_application': 'TEMPORARY_INDEX_ONLY', 'product_tests': 'NOT_RUN', 'browser_native': 'NOT_RUN'}))
