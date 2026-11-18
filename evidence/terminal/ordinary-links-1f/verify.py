from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
META = json.loads((ROOT / 'qualification.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('--renderer', type=Path)
parser.add_argument('--index', type=Path)
parser.add_argument('--green', action='store_true')
args = parser.parse_args()
checks = 0

def check(condition, message):
    global checks
    assert condition, message
    checks += 1

def digest(data):
    return hashlib.sha256(data).hexdigest()

assets = {}
for name, item in META['assets'].items():
    path = getattr(args, name)
    if path is None:
        continue
    data = path.read_bytes()
    check(len(data) == item['bytes'], f'{name} asset size')
    check(digest(data) == item['sha256'], f'{name} asset identity')
    assets[name] = data
spans = {}
for span in META['spans']:
    data = (ROOT / span['file']).read_bytes()
    start, end = span['utf8_half_open']
    key = span.get('asset', span.get('artifact', 'renderer'))
    check(end - start == len(data), f"{span['name']} exact-parent range length")
    if key in assets:
        check(data == assets[key][start:end], f"{span['name']} exact-parent bytes")
    check(digest(data) == span['sha256'], f"{span['name']} hash")
    check(len(data) == span['bytes'], f"{span['name']} length")
    spans[span['name']] = data.decode()
for name, tokens in {
    'lSa': ['t.config.kind===\"interactive\"?p.jsx(eSa'],
    'eSa': ['}=w9e(P)'],
    'w9e': ['dno({container:ve'],
    'dno': ['await uno('],
    'uno': ['cno('],
    'cno': ['lno({'],
    'lno': ['linkHandler:{activate:(g,_)=>{g.metaKey&&ano(_).fireAndForget()}', 'allowNonHttpProtocols:!1'],
    'ano': ['await Gyr(`Open this terminal link?', 'cancelLabel:\"Cancel\"', 'kind:\"warning\"', 'okLabel:\"Open\"', 'title:\"Open link?\"', '&&await vs(t)'],
    'Rue': ['it(\"plugin:opener|open_url\",{url:t,with:e})'],
    'wXt': ['it(\"plugin:dialog|confirm\"', 'okButtonLabel:s?.okLabel?.toString()', 'cancelButtonLabel:s?.cancelLabel?.toString()'],
    'renderer-dG-vs': ['dG as vs'],
    'index-Rue-dG': ['Rue as dG'],
    'renderer-g9-Gyr': ['g9 as Gyr'],
    'index-wXt-g9': ['wXt as g9'],
}.items():
    for token in tokens:
        check(token in spans[name], f'{name} owns {token}')
check(digest((ROOT / 'baseline-session.ts.txt').read_bytes()) == META['baseline_session_sha256'], 'baseline session identity')
check('linkHandler:' not in (ROOT / 'baseline-session.ts.txt').read_text(), 'unchanged main lacks custom encoded-link handler')
fixture = (REPO / 'src/features/terminal/ordinaryLinks.test.ts').read_bytes()
check(digest(fixture) == META['fixture_sha256'], 'frozen fixture hash')
check(fixture == (ROOT / 'frozen-ordinaryLinks.ts.txt').read_bytes(), 'fixture equals frozen bytes')
tap = (ROOT / 'before.tap').read_text()
check(re.search(r'^# tests 12$', tap, re.M) is not None, '12 baseline cases')
check(re.search(r'^# pass 4$', tap, re.M) is not None, '4 baseline controls pass')
check(re.search(r'^# fail 8$', tap, re.M) is not None, '8 intended assertion failures')
check([int(x) for x in re.findall(r'^not ok (\d+) ', tap, re.M)] == [1, 2, 4, 5, 7, 8, 9, 10], 'exact intended RED cases')
check(tap.count("code: 'ERR_ASSERTION'") == 8, 'no module, syntax, or harness failures')
fresh = (ROOT / 'fresh-main-red.tap').read_text()
check(re.search(r'^# pass 4$', fresh, re.M) is not None, 'fresh main 4 baseline passes')
check(re.search(r'^# fail 8$', fresh, re.M) is not None, 'fresh main 8 intended failures')
check(fresh.count("code: 'ERR_ASSERTION'") == 8, 'fresh main assertion-only RED')
if args.green:
    for name, total in [('green.tap', 12), ('adjacent.tap', 196), ('script-output.tap', 10)]:
        receipt = (ROOT / name).read_text()
        check(re.search(rf'^# tests {total}$', receipt, re.M) is not None, f'{name} case count')
        check(re.search(rf'^# pass {total}$', receipt, re.M) is not None, f'{name} passes')
        check(re.search(r'^# fail 0$', receipt, re.M) is not None, f'{name} no failures')
    integration = json.loads((ROOT / 'integration.json').read_text())
    for name in integration['legacy_loader_files']:
        relative = f'src/features/terminal/{name}'
        baseline = subprocess.check_output(['git', 'show', f'{integration["main_checked"]}:{relative}'], cwd=REPO)
        updated = (REPO / relative).read_bytes()
        archived = (ROOT / 'baseline' / f'{name}.txt').read_bytes()
        check(archived == baseline, f'{name} archived original identity')
        check(digest(archived) == integration['legacy_loader_baseline_sha256'][name], f'{name} archived original hash')
        additions = (
            '    "@tauri-apps/plugin-dialog": { confirm: () => { throw new Error("No native dialog in terminal regression"); } },\n'
            '    "src/backend": { openUrl: () => { throw new Error("No browser in terminal regression"); } },\n'
        ).encode()
        check(updated.count(additions) == 1 and updated.replace(additions, b'', 1) == baseline, f'{name} boundary-only: assertions unchanged')
    baseline_script = subprocess.check_output(['git', 'show', f'{integration["main_checked"]}:src/components/ScriptOutput.tsx'], cwd=REPO)
    check((REPO / 'src/components/ScriptOutput.tsx').read_bytes() == baseline_script, 'ScriptOutput unchanged')
print(f'PASS {checks} source/fixture/receipt checks across {len(META["spans"])} original spans; full assets checked: {", ".join(assets) or "none (retained span hashes only)"}')
