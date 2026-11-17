"""Verify only the newly qualified retained byte ranges; never execute vendor JS."""
import argparse
import hashlib
import json
from pathlib import Path
import tarfile

p = argparse.ArgumentParser()
p.add_argument("--renderer", type=Path, required=True, help="existing original renderer .tar.gz or raw asset")
p.add_argument("--index", type=Path, required=True, help="existing original index asset")
p.add_argument("--manifest", type=Path, default=Path(__file__).with_name("qualification.json"))
a = p.parse_args()
manifest = json.loads(a.manifest.read_text())
if tarfile.is_tarfile(a.renderer):
    with tarfile.open(a.renderer) as archive:
        members = [m for m in archive.getmembers() if m.isfile() and m.name.endswith("renderApp-D_fmY7hW.js")]
        assert len(members) == 1, "expected one original renderer member"
        renderer = archive.extractfile(members[0]).read()
else:
    renderer = a.renderer.read_bytes()
assets = {"renderApp-D_fmY7hW.js": renderer, "index-BGEQ8YjU.js": a.index.read_bytes()}
bodies = {}
for span in manifest["reference_spans"]:
    body = assets[span["asset"]][span["start"]:span["end"]]
    assert len(body) == span["end"] - span["start"], span["label"]
    assert hashlib.sha256(body).hexdigest() == span["sha256"], span["label"]
    bodies[span["label"]] = body
assert b"p.jsx(m6a,{workspace:i,scenario:r,onClose:f6a},i.localId)" in bodies["restore-root"]
assert b"isPending:a}=BYe()" in bodies["restore-content"]
assert bodies["renderer-mutation-import"] == b"hG as BYe"
assert bodies["index-mutation-export"] == b"HYt as hG"
assert b"e=Be({mutationKey:PWt" in bodies["unarchive-mutation"]
assert b"useState(()=>new Zqe(s,t))" in bodies["mutation-hook"]
assert b"#s;" in bodies["mutation-observer"]
assert b"constructor(e,s){super(),this.#e=e,this.setOptions(s),this.bindMethods(),this.#i()}" in bodies["mutation-observer"]
assert b"const e=this.#s?.state??Ute()" in bodies["mutation-observer"]
assert b'isPending:e.status==="pending"' in bodies["mutation-observer"]
assert b'status:"idle"' in bodies["mutation-idle"]
print(f"PASS: {len(bodies)} retained byte/hash bindings and keyed per-workspace idle-observer contract; no vendor evaluation")
