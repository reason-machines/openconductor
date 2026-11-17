"""Inert source and fixture audit. Never evaluates retained Conductor source."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--renderer', required=True)
parser.add_argument('--index', required=True)
args = parser.parse_args()
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sha = lambda data: hashlib.sha256(data).hexdigest()
checks = 0

def read(name):
    path = HERE / name
    if path.exists():
        return path.read_bytes()
    return gzip.decompress((HERE / (str(name) + '.gz')).read_bytes())

def original(name):
    path = HERE / name
    return gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()

def check(value, message):
    global checks
    assert value, message
    checks += 1

meta = json.loads((HERE / 'qualification.json').read_text())
assets = {'renderer': Path(args.renderer).read_bytes(), 'index': Path(args.index).read_bytes()}
for asset, data in assets.items():
    check(sha(data) == meta[f'{asset}_sha256'], f'full {asset} hash')
spans = {}
for item in meta['spans']:
    data = (HERE / item['file']).read_bytes()
    a, b = item['utf8_half_open']
    check(data == assets[item['asset']][a:b], f"exact parent span {item['name']}")
    check(sha(data) == item['sha256'], f"span hash {item['name']}")
    spans[item['name']] = data.decode()
for name, expected in {
    'lSa': ['t.config.kind==="interactive"?p.jsx(eSa'],
    'eSa': ['}=w9e(P)'], 'w9e': ['dno({container:ve'], 'dno': ['await uno('],
    'uno': ['cno('], 'cno': ['lno({'],
    'lno': ['a.loadAddon(new WJs((g,_)=>{g.metaKey&&vs(_).fireAndForget()}))', 'g.metaKey&&ano(_).fireAndForget()'],
    'eno': ['this._addonManager=this._register(new Kto)', 'loadAddon(t){this._addonManager.loadAddon(this,t)}', 'registerLinkProvider(t){return this._core.registerLinkProvider(t)}'],
    'Kto': ['loadAddon(e,n)', 'n.activate(e)', 'this._addons[e].instance.dispose()'],
    'WJs': ['activate(e)', 'i=n.urlRegex||HJs', 'registerLinkProvider(new $Js(this._terminal,i,this._handler,n))', 'this._linkProvider?.dispose()'],
    'provider-computation': ['provideLinks(e,n)', 'UJs.computeLink', 'activate:r', 'zJs(m)', 'new URL(t)', 'HJs=/(https?|HTTPS?)', '_getWindowedLineStrings', '_mapStrIdx'],
    'renderer-dG-vs': ['dG as vs'], 'index-Rue-dG': ['Rue as dG'],
    'Rue': ['it("plugin:opener|open_url",{url:t,with:e})'],
    'ano': ['Open this terminal link?', '&&await vs(t)'],
}.items():
    for token in expected:
        check(token in spans[name], f'{name}: {token}')

integration = json.loads((HERE / 'integration.json').read_text())
for name, expected in integration['evidence_hashes'].items():
    check(sha((HERE / name).read_bytes()) == expected, f'evidence hash {name}')
fixture = (ROOT / 'src/features/terminal/ordinaryPlainLinks.test.ts').read_bytes()
check(fixture == (HERE / 'frozen-ordinaryPlainLinks.ts.txt').read_bytes(), 'frozen fixture unchanged')
check(sha(fixture) == 'f05513f25c8bd8bd2ceb137875a305d10a9f60111cf89c8cce9c06fa7aa1a0c2', 'frozen fixture hash')
for name in ['before.tap', 'fresh-main-red.tap']:
    receipt = read(name).decode()
    for marker in ['# tests 10\n', '# pass 3\n', '# fail 7\n']:
        check(marker in receipt, f'{name} {marker.strip()}')
    check(receipt.count("code: 'ERR_ASSERTION'") == 7, f'{name} intended assertion failures only')
    check([line.split(' ')[2] for line in receipt.splitlines() if line.startswith('not ok ')] == ['1','2','3','4','7','8','9'], f'{name} intended cases')
for name, passed in [('green.tap', 10), ('loader-green.tap', 17), ('adjacent.tap', 221)]:
    receipt = read(name).decode()
    check(f'# pass {passed}\n' in receipt and '# fail 0\n' in receipt, f'{name} passing')
loader_red = read('loader-before.tap').decode()
check('# pass 0\n' in loader_red and '# fail 17\n' in loader_red, 'loader RED count')
check(loader_red.count('@xterm/addon-web-links') >= 17, 'loader RED missing new import')
for item in integration['loaders']:
    old = original(item['original'])
    current = (ROOT / item['path']).read_bytes()
    entry = item['entry'].encode()
    check(sha(old) == item['original_sha256'], f"original loader hash {item['path']}")
    check(current.count(entry) == 1, f"one exact new loader entry {item['path']}")
    check(current.replace(entry, b'', 1) == old, f"all original loader/case/assertion/invocation bytes unchanged: {item['path']}")

session = (ROOT / 'src/features/terminal/session.ts').read_bytes()
base_session = (HERE / 'fresh-main-session.ts.txt').read_bytes()
for added in integration['session_additions']:
    check(session.count(added.encode()) == 1, 'exact session addition')
    session = session.replace(added.encode(), b'', 1)
check(session == base_session, 'all other session bytes including encoded handler unchanged')
base_pkg = json.loads((HERE / 'fresh-main-package.json.txt').read_text())
pkg = json.loads((ROOT / 'package.json').read_text())
check(pkg['dependencies'].pop('@xterm/addon-web-links') == '0.12.0', 'pinned official addon')
check(pkg == base_pkg, 'all other package metadata unchanged')
lock = json.loads((ROOT / 'package-lock.json').read_text())
base_lock = json.loads(read('baseline-package-lock.json.txt'))
check(lock['packages']['']['dependencies'].pop('@xterm/addon-web-links') == '0.12.0', 'lock root pin')
check(lock['packages'].pop('node_modules/@xterm/addon-web-links') == integration['addon_lock'], 'exact new addon lock record')
check(lock == base_lock, 'all other lock entries unchanged')
installed = json.loads((ROOT / 'node_modules/@xterm/addon-web-links/package.json').read_text())
check(installed['version'] == '0.12.0' and not installed.get('dependencies'), 'installed version has no runtime dependencies')
for path, expected in integration['installed_hashes'].items():
    check(sha((ROOT / path).read_bytes()) == expected, f'installed API/provider identity {path}')
print(f'PASS {checks} inert checks; 15 exact original spans; frozen 3P/7F to 10/10; loader-only exact reconstruction; encoded handler unchanged')
