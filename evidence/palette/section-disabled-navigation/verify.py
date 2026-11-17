"""Verify inert retained source, frozen mounted fixture and pre-fix main bytes."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
manifest = json.loads((HERE / "source.json").read_text())
sha = lambda raw: hashlib.sha256(raw).hexdigest()
parent = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else None
if parent is not None:
    assert len(parent) == manifest["reference"]["bytes"]
    assert sha(parent) == manifest["reference"]["sha256"]
for record in manifest["reference"]["records"]:
    raw = (HERE / record["path"]).read_bytes()
    start, end = record["range"]
    assert len(raw) == record["bytes"] == end - start, record["path"]
    assert sha(raw) == record["sha256"], record["path"]
    if parent is not None:
        assert raw == parent[start:end], record["path"]
fixture = manifest["fixture"]
assert sha((ROOT / fixture["path"]).read_bytes()) == fixture["sha256"]
for record in manifest["baseline"]:
    raw = subprocess.check_output(["git", "show", f'{manifest["main"]}:{record["path"]}'], cwd=ROOT)
    assert sha(raw) == record["sha256"]
section = (HERE / "../active-descendant/section-Jba.txt").read_text()
item = (HERE / "../active-descendant/item-M5s.txt").read_text()
wrapper = (HERE / "../active-descendant/item-wrapper.txt").read_text()
root = (HERE / "../group-navigation/command-root-Xyi.txt").read_text()
caller = (HERE / "../group-navigation/m_a.txt").read_text()
selector = (HERE / "../group-navigation/_Bn.txt").read_text()
assert 'p.jsx(Jba,{localWorkspaceId:d,sectionKey:hn,onBack:x5})' in caller
assert 'p.jsxs($o,{value:z.id,keywords:[z.name],disabled:z.id===m' in section
assert 'p.jsxs(KV,{loop:!0,filter:wUi' in section
assert 'p.jsx(P6.Item,{ref:e,className:o,...r})' in wrapper
assert '"aria-disabled":!!w' in item and 'onPointerMove:w||c.getDisablePointerSelection()?void 0:x' in item
assert 'c.item(r,a?.id)' in item and 'onClick:w?void 0:v' in item
assert ':not([aria-disabled="true"])' in selector
assert 'ce.querySelectorAll(_Bn)' in root and 'let ae=K()[ce]' in root
assert 'let de=G(),ue=K(),pe=ue.findIndex' in root
assert 'function H(){let ce=K().find' in root
red = gzip.decompress((HERE / "red.tap.gz").read_bytes()).decode()
assert '# tests 21\n' in red and '# pass 12\n' in red and '# fail 9\n' in red
assert red.count("code: 'ERR_ASSERTION'") == 9
print(f'PASS: {len(manifest["reference"]["records"])} exact source records, parent equality={parent is not None}; full disabled navigation join; frozen mounted fixture; main baseline; 9 assertion RED/12 controls')
