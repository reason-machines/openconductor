"""Verify inert retained-source and frozen-fixture identity. Never runs vendor JS."""
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
records = manifest["reference"]["records"]
parent = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else None
if parent is not None:
    assert len(parent) == manifest["reference"]["bytes"]
    assert sha(parent) == manifest["reference"]["sha256"]
for record in records:
    raw = (HERE / record["path"]).read_bytes()
    start, end = record["range"]
    assert len(raw) == record["bytes"] == end - start, record["path"]
    assert sha(raw) == record["sha256"], record["path"]
    if parent is not None:
        assert raw == parent[start:end], record["path"]
fixture = manifest["fixture"]
assert sha((ROOT / fixture["path"]).read_bytes()) == fixture["sha256"]
for baseline in manifest["baseline"]:
    raw = subprocess.check_output(["git", "show", f'{manifest["main"]}:{baseline["path"]}'], cwd=ROOT)
    assert sha(raw) == baseline["sha256"]
root = (HERE / "../group-navigation/command-root-Xyi.txt").read_text()
item = (HERE / "item-M5s.txt").read_text()
input_ = (HERE / "../group-navigation/command-input-B5s.txt").read_text()
aliases = (HERE / "../group-navigation/command-component-P6.txt").read_text()
wrapper = (HERE / "item-wrapper.txt").read_text()
assert 'n.current.selectedItemId=(ge=G())==null?void 0:ge.id,P.emit()' in root
assert 'querySelector(`${qyi}[aria-selected="true"]`)' in root
assert 'c.item(r,a?.id)' in item and 'id:r,"cmdk-item":"",role:"option"' in item
assert 'let r=_j()' in item and 'm.setState("value",h.current,!0)' in item
assert 'c=QH(d=>d.selectedItemId)' in input_ and '"aria-activedescendant":c' in input_
assert 'Item:M5s,Input:B5s' in aliases and 'p.jsx(P6.Item,{ref:e,className:o,...r})' in wrapper
red = gzip.decompress((HERE / "red.tap.gz").read_bytes()).decode()
assert '# tests 14\n' in red and '# pass 3\n' in red and '# fail 11\n' in red
assert red.count("code: 'ERR_ASSERTION'") == 11
print(f'PASS: {len(records)} exact retained-source records; full-parent equality={parent is not None}; frozen fixture; fresh-main baseline; 11 assertion RED + 3 controls')
