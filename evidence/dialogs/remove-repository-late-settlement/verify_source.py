#!/usr/bin/env python3
"""Verify bounded retained REA source bindings as inert data, never JavaScript."""
import argparse
import hashlib
import json
from pathlib import Path
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument("--renderer", required=True, type=Path)
parser.add_argument("--index", required=True, type=Path)
args = parser.parse_args()
manifest = json.loads(Path(__file__).with_name("qualification.json").read_text())
with tarfile.open(args.renderer) as archive:
    renderer = archive.extractfile("renderApp-D_fmY7hW.js").read()
assets = {"renderer": renderer, "index": args.index.read_bytes()}
spans = {}
for binding in manifest["reference_spans"]:
    data = assets[binding["asset"]][binding["start"]:binding["end"]]
    assert hashlib.sha256(data).hexdigest() == binding["sha256"], binding["label"]
    spans[binding["label"]] = data.decode("utf8")
    print(f"PASS {binding['label']} [{binding['start']},{binding['end']})")
row = spans["repository-row"]
assert "d=csi(),[h,m]=$.useState(!1)" in row
assert "d.mutate(n.id,{onSuccess:()=>m(!1),onError:Mra})" in row
assert "p.jsx(Tg,{open:h,onOpenChange:m,children:Qe})" in row
parent = spans["keyed-repository-parent"]
assert "Q.map((he,ge)=>p.jsx(uCe,{draggableId:he.id" in parent
assert "p.jsx(Dra,{repository:he," in parent
assert "})})},he.id))" in parent
assert spans["renderer-delete-import"] == "od as csi"
assert spans["index-delete-export"] == "sQt as od"
assert "onSuccess:D2t" in spans["delete-mutation-hook"]
assert "return" in spans["delete-mutation-hook"] and "Be(i)" in spans["delete-mutation-hook"]
assert spans["delete-mutation-success"] == 'function D2t(){Gt("repository_deleted")}'
print("PASS per-repository identity, local close ownership and delete-hook joins; no vendor evaluation")
