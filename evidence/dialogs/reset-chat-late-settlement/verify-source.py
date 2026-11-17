#!/usr/bin/env python3
"""Check retained inert reference bindings and the unchanged regression fixture."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--original-root", type=Path)
args = parser.parse_args()
here = Path(__file__).resolve().parent
repo = here.parents[2]
manifest = json.loads((here / "source.json").read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
if args.original_root:
    assets = {name: (args.original_root / name).read_bytes() for name in manifest["reference_assets"]}
    for name, identity in manifest["reference_assets"].items():
        assert len(assets[name]) == identity["bytes"], name
        assert sha(assets[name]) == identity["sha256"], name
for span in manifest["spans"]:
    data = (here / span["path"]).read_bytes()
    assert len(data) == span["bytes"], span["label"]
    assert sha(data) == span["sha256"], span["label"]
    if args.original_root:
        start, end = span["utf8_half_open"]
        assert assets[span["asset"]][start:end] == data, span["label"]

def source(label):
    return (here / "reference" / f"{label}.txt").read_text()

assert "[R,O]=$.useState(!1)" in source("TDo")
assert "onSelect:()=>O(!0)" in source("TDo")
assert "open:R,onOpenChange:O" in source("TDo")
assert "ue=F&&de&&!ce&&!h&&X" in source("TDo")
assert "turnId:r.id" in source("MDo")
assert "i&&p.jsx(dDo,{...n})" in source("uDo")
assert "onSuccess:()=>d(!1)" in source("dDo")
assert "useResetChatToTurn:qDt" in source("reset-api-registry")
assert source("reset-api-export") == "M9t as fi"
assert source("reset-api-import") == "fi as pSe"
assert "Be(e)" in source("qDt")
assert "n.subscribe(nn.batchCalls(o))" in source("mutation-hook")
assert "this.listeners.delete(t),this.onUnsubscribe()" in source("mutation-listener")
assert "this.hasListeners()||this.#s?.removeObserver(this)" in source("mutation-observer")
assert "if(this.#n&&this.hasListeners())" in source("mutation-observer")
assert "await fe.deleteMessagesAfterWatermark" in source("UDt")
fixture = manifest["regression"]
assert sha((repo / fixture["path"]).read_bytes()) == fixture["sha256"]
print(f"PASS {len(manifest['spans'])} retained source bindings, lifecycle joins and frozen fixture")
