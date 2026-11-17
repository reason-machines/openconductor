from pathlib import Path
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
args = argparse.ArgumentParser()
args.add_argument('--baseline', action='store_true')
opts = args.parse_args()
manifest = json.loads((ROOT / 'source.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
for span in manifest['reference']['spans']:
    raw = (ROOT / span['path']).read_bytes()
    assert sha(raw) == span['sha256'], span['path']
    lo, hi = span['utf8_half_open']
    assert len(raw) == hi - lo, span['path']
for entry in manifest['current']:
    raw = (ROOT / entry['snapshot']).read_bytes()
    assert sha(raw) == entry['sha256'], entry['snapshot']
    if opts.baseline:
        assert sha((REPO / entry['path']).read_bytes()) == entry['sha256'], entry['path']
expected, path = (ROOT / 'fixture.sha256').read_text().split()
assert sha((REPO / path).read_bytes()) == expected, path
cmdk = (ROOT / 'Xyi-root.txt').read_text()
assert 'ce.nativeEvent.isComposing||ce.keyCode===229' in cmdk
assert 'if(!(ce.defaultPrevented||de))switch(ce.key)' in cmdk
assert 'case"Enter":{ce.preventDefault();let ue=G();' in cmdk
assert 'P6=Object.assign(Xyi,' in (ROOT / 'P6-alias.txt').read_text()
assert 'p.jsx(P6,' in (ROOT / 'KV-wrapper.txt').read_text()
assert 'p.jsx(Y5s,' in (ROOT / 'qZ-dialog.txt').read_text()
assert 'p.jsx(KV,' in (ROOT / 'Y5s-content.txt').read_text()
assert 'p.jsx(qZ,{id:Tk,commandProps:{filter:wUi}' in (ROOT / 'h_a-palette-caller.txt').read_text()
print(json.dumps({'static_integrity': 'PASS', 'baseline_product_unchanged': opts.baseline, 'fixture_sha256': expected, 'behavior': 'NOT_RUN'}))
