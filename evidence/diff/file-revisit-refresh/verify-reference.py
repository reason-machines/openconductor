#!/usr/bin/env python3
"""Hash-check retained source as inert data; never evaluate reference code."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
packet = json.loads((Path(__file__).parent / "recovered-reference.json").read_text())
spans = {row["name"]: row["literal"] for row in packet["recovered"]}
for row in packet["recovered"]:
    content = row["literal"].encode()
    assert len(content) == row["utf8"][1] - row["utf8"][0]
    assert hashlib.sha256(content).hexdigest() == row["sha256"]
for name, path, digest in [
    ("bji", "evidence/open-in/deleted-finder/reference/bji.txt", "2d2b8aac64bada5ead6bc143ac6bb272544791374a9b71b38e57eab55c8f5688"),
    ("Jqo", "evidence/open-in/deleted-finder/reference/Jqo.txt", "0e24efc52f0ab809283b07a30fbb5e615db81ab56a03f12dad7e298d15a81a87"),
    ("Y9t", "evidence/diff/historical-large-file/reference/reference-Y9t.txt", "d275afb03c1b74e04d37c8a6f46e9edfcf82d43d4b889bbf6cf013c1eb73f740"),
]:
    content = (ROOT / path).read_bytes()
    assert hashlib.sha256(content).hexdigest() == digest
    spans[name] = content.decode()
assert "[c]:(He[c]??0)+1" in spans["Jqo"]
assert "visibleVisitCount:ce[He.path]??0" in spans["Jqo"]
assert "const Ue=Z===void 0,We=a>1;!o||a===0||a===be||se||!Ue&&!We||(he(a),ce())" in spans["bji"]
assert "refetch:ce" in spans["bji"]
assert "const G=yLt(O)" in spans["Y9t"] and "Z={...G,loadFullContents:x}" in spans["Y9t"]
assert "s.store.getState().refetch(o).fireAndForget()" in spans["yLt"]
refetch = spans["vLt"].split('refetch(O,G="foreground"){', 1)[1].split("setContent(", 1)[0]
assert "data:re?.data,error:void 0,isLoading:!0" in refetch
assert "u(Z,()=>S(Z,G,()=>l(O)))" in refetch
assert ".then(N=>k(R,O,Z,N)).catch(N=>A(R,O,Z,N))" in refetch
assert "const l=t,u=Ks()" in spans["vLt"]
print("PASS: five complete retained span hashes, visit/refetch joins and deduped load/error retention.")
print("Original whole assets not reacquired; yLt/vLt recovered from prior verified Page/Session records.")
