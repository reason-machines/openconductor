#!/usr/bin/env python3
"""Verify retained inert reference bytes and the frozen ordinary-copy regression pair."""
import argparse
import gzip
import hashlib
import json
import re
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--reference-renderer', type=Path)
p.add_argument('--product-root', type=Path, default=Path.cwd())
p.add_argument('--green', action='store_true')
args = p.parse_args()
here = Path(__file__).resolve().parent
m = json.loads((here / 'qualification.json').read_text())
checks = []
def require(condition, label):
    if not condition:
        raise AssertionError(label)
    checks.append(label)
def sha(data):
    return hashlib.sha256(data).hexdigest()
def receipt(file):
    path = here / file
    return path.read_bytes() if path.exists() else gzip.decompress((here / (file + '.gz')).read_bytes())

if args.reference_renderer:
    source = args.reference_renderer.read_bytes()
    require(len(source) == m['reference_asset']['bytes'], 'complete original asset length')
    require(sha(source) == m['reference_asset']['sha256'], 'complete original asset SHA256')
else:
    source = None
for span in m['spans']:
    data = (here / span['file']).read_bytes()
    require(sha(data) == span['sha256'], 'retained span hash: ' + span['name'])
    if source is not None:
        a, b = span['utf8_half_open']
        require(data == source[a:b], 'exact original byte range: ' + span['name'])
ref = {s['name']: (here / s['file']).read_text() for s in m['spans']}
for name, text in [
    ('lSa', 't.config.kind==="interactive"?p.jsx(eSa'),
    ('eSa', 'terminalKey:n.surfaceId'), ('eSa', '=w9e(P)'),
    ('w9e', 'dno({container:ve'), ('w9e', 'terminalKey:i'),
    ('dno', 'await uno('), ('uno', 'd=cno('), ('cno', 'const c=lno('),
    ('lno', 'a.open(d)'), ('lno', 'a.getSelection()'), ('lno', 't9s(_)'),
    ('lno', 'addEventListener("copy",m)'), ('W5e', 'removeEventListener("copy",n.copyHandler)'),
    ('W5e', 'n.terminal.dispose()'), ('uVn', 'n.wrapper.remove()'),
]:
    require(text in ref[name], name + ': ' + text)
require('split(`\n`)' in ref['t9s'] and 'replace(/[ \\t]+$/u,"")' in ref['t9s'], 'per-line spaces/tab trim, not whole-selection trim')
require('removeEventListener' not in ref['uVn'], 'warm detach retains copy handler')
base = (here / 'baseline-session.ts.txt').read_bytes()
require(sha(base) == m['baseline_session_sha256'], 'baseline session hash')
blob = subprocess.check_output(['git', 'show', m['main_checked'] + ':src/features/terminal/session.ts'], cwd=args.product_root)
require(blob == base, 'baseline equals immutable fresh-main blob')
frozen = here / ('ordinaryCopy.fixture.ts' if (here / 'ordinaryCopy.fixture.ts').exists() else 'frozen-ordinaryCopy.v1.ts.txt')
v1 = frozen.read_bytes()
require(sha(v1) == m['fixture_sha256'], 'original v1 frozen fixture hash')
v2_path = here / ('ordinaryCopy.fixture-v2.ts' if (here / 'ordinaryCopy.fixture-v2.ts').exists() else 'frozen-ordinaryCopy.v2.ts.txt')
v2 = v2_path.read_bytes()
require(v1.replace(b'Object.hasOwn(boundaries, key)', b'Object.prototype.hasOwnProperty.call(boundaries, key)') == v2, 'only ES2021 loader transport changed')
require(v1[v1.index(b'test("ordinary copy'): ] == v2[v2.index(b'test("ordinary copy'): ], 'every test body and assertion unchanged')
require((args.product_root / 'src/features/terminal/ordinaryCopy.test.ts').read_bytes() == v2, 'delivered fixture equals frozen v2')
for file in ['red.tap', 'red-v2.tap']:
    tap = receipt(file).decode()
    require('# pass 5\n' in tap and '# fail 6\n' in tap and '# skipped 0\n' in tap, file + ': expected counts')
    require([int(n) for n in re.findall(r'^not ok (\d+) -', tap, re.M)] == [1,2,3,4,9,11], file + ': only intended cases failed')
    require(tap.count("code: 'ERR_ASSERTION'") == 6, file + ': six assertion failures, no loader/setup failures')
    require(not any(s in tap for s in ['ERR_MODULE_NOT_FOUND','ReferenceError','SyntaxError','TypeError']), file + ': no fixture failures')
require(sha(receipt('red.tap')) == m['red']['sha256'], 'original RED receipt hash')
if args.green:
    tap = receipt('green.tap').decode()
    require('# pass 11\n' in tap and '# fail 0\n' in tap and '# skipped 0\n' in tap, 'GREEN all eleven cases')
    patch = (here / 'copy.patch').resolve()
    subprocess.run(['git', 'apply', '--reverse', '--check', str(patch)], cwd=args.product_root, check=True, capture_output=True)
    require(True, 'exact product patch applies in reverse')
print(json.dumps({'author': 'Conductor Rebuild', 'passed': len(checks), 'checks': checks}, indent=2))
