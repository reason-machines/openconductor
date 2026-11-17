#!/usr/bin/env python3
"""Verify inert source bindings, frozen24, controls and the exact image-only hunk."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--renderer", required=True, type=Path)
parser.add_argument("--index", required=True, type=Path)
parser.add_argument("--root", required=True, type=Path)
parser.add_argument("--baseline", required=True)
args = parser.parse_args()
here = Path(__file__).resolve().parent
source = json.loads((here / "source.json").read_text())
freeze = json.loads((here / "freeze.json").read_text())
sha = lambda b: hashlib.sha256(b).hexdigest()
assets = {"renderer": args.renderer.read_bytes(), "index": args.index.read_bytes()}
for name, raw in assets.items():
    assert len(raw) == source["parents"][name]["bytes"], name
    assert sha(raw) == source["parents"][name]["sha256"], name
for span in source["spans"]:
    raw = assets[span["asset"]][span["start_byte"]:span["end_byte"]]
    assert raw.decode() == span["text"], span["name"]
    assert sha(raw) == span["sha256"], span["name"]
spans = {s["name"]: s["text"] for s in source["spans"]}
joins = {
    "kind": ('ImageGeneration:"image-generation"', "kind-registry"),
    "dispatch": ('"image-generation":Vpo', "row-dispatch"),
    "result-prop": ('toolResult:i', "row-dispatch"),
    "raw-selection": ('m=i?.content===void 0?"":yZe(i.content).trim()', "Vpo"),
    "fallback-bytes": ('children:m', "Vpo"),
    "visibility": ('L=I||m.length>0', "Vpo"),
    "capability": ('isCollapsible:I,defaultCollapsed:!1', "Vpo"),
    "path-resolution": ('g=zpo({imagePath:m,workspacePath:d})', "Vpo"),
    "extension-call": ('k=w.length>0&&oJ(w)', "Vpo"),
    "extension-own-membership": ('Object.prototype.hasOwnProperty.call(ile,e)', "ole"),
    "import-alias": ('jm as oJ', "complete-image-import"),
    "import-source": ('from"./index-BGEQ8YjU.js"', "complete-image-import"),
    "export-alias": ('ole as jm', "image-predicate-export"),
    "shell-click-guard": ('P&&B&&te()', "Mu"),
    "shell-content-gate": ('xe=B&&!Q&&g&&p.jsx', "Mu"),
}
for name, (needle, span) in joins.items():
    assert needle in spans[span], name
assert sha((here / "source.json").read_bytes()) == freeze["source_manifest_sha256"]
assert sha((args.root / freeze["fixture"]).read_bytes()) == freeze["fixture_sha256"]
for name, expected in freeze["controls"].items():
    raw = (args.root / name).read_bytes()
    assert sha(raw) == expected, name
    assert raw == subprocess.check_output(["git", "show", f"{args.baseline}:{name}"]), name
before = '      const path = result === undefined ? "" : resultText(result).trim();'
after = '      const content = rawResult === undefined ? result : rawResult;\n      const path = content === undefined ? "" : resultText(content).trim();'
original = subprocess.check_output(["git", "show", f"{args.baseline}:src/features/chat/ToolRows.tsx"]).decode()
assert original.count(before) == 1
assert (args.root / "src/features/chat/ToolRows.tsx").read_text() == original.replace(before, after, 1)
print(f"PASS: 2 parent assets, {len(source['spans'])} complete byte spans, {len(joins)} consumer joins; frozen V2 24 cases; 9 unchanged controls; exact 2-addition/1-removal image-only hunk")
