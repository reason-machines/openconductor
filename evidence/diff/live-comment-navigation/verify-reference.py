"""Verify inert retained Q-07 spans and fixture identity; never evaluate reference JS."""
from pathlib import Path
import hashlib
import json
import sys

here = Path(__file__).resolve().parent
root = here.parents[2]
manifest = json.loads((here / "source.json").read_text())
assert manifest["spans_total_bytes"] <= 65536
raw = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else None
if raw is not None:
    assert len(raw) == manifest["asset"]["bytes"]
    assert hashlib.sha256(raw).hexdigest() == manifest["asset"]["sha256"]
spans = {}
for entry in manifest["spans"]:
    data = (here / entry["path"]).read_bytes()
    start, end = entry["range_utf8"]
    assert len(data) == entry["bytes"] == end - start, entry["name"]
    assert hashlib.sha256(data).hexdigest() == entry["sha256"], entry["name"]
    if raw is not None:
        assert raw[start:end] == data, entry["name"]
    spans[entry["name"]] = data.decode()
fixture = root / manifest["fixture"]["path"]
assert hashlib.sha256(fixture.read_bytes()).hexdigest() == manifest["fixture"]["sha256"]
# Explicit caller/callee bindings, not semantic execution of vendor functions.
joins = {
    "kqo": ["getCurrentLineAnnotations:pe", "}=BMi({", "jn.set(Dt.metadata.id,Dt.lineNumber)", "jn.set(Dt.metadata.id,null)", "Dt!==null&&jn.push", "onItemEditChange:H", "onScroll:ye", "onPostRender:Dn", "xe()", "ge&&h&&p.jsx($Mi"],
    "Vo": ["}=BMi(I)", "onPostRender:Q", "onScroll:L", "p.jsx(Igi", "D&&u&&p.jsx($Mi"],
    "BMi": ["getCurrentLineAnnotations:i", "i?.()??n", "QQn({source:E,lineAnnotations:d()})", "rEt({viewer:k", "QQn({source:R,lineAnnotations:d()})[E]", 'align:"start",offset:VNt,behavior:"smooth"'],
    "rEt": ["getTopForItem(e)", "getRenderedItems()", "getContainerElement()", "getLinePosition(a.lineNumber,a.side)"],
    "QQn": ["new Set", "t.getLinePosition(r)", "top:t.top+a.top", "return jVo("],
    "jVo": ["e+VNt", "d.top+d.height>r&&d.top<o", "previousCount:h+1,nextCount:i.length-m"],
    "Mi": ['oi("diff.previousComment"', 'oi("diff.nextComment"', 'n>0&&p.jsx', 'i>0&&p.jsx'],
    "pierre-react-CodeView": ["subscribeToScroll(m)", "ye.scrollTo(ve)", "getInstance(){return H.current.instance}"],
    "pierre-subscribeToScroll": ["scrollListeners.add(e)", "scrollListeners.delete(e)"],
    "pierre-alignment": ["return i===", ":e-o-r"],
}
for name, needles in joins.items():
    for needle in needles:
        assert needle in spans[name], (name, needle)
assert "VNt=56" in spans["reading-line"]
print(f"PASS: {len(spans)} retained spans / {manifest['spans_total_bytes']} bytes; fixture SHA; {sum(map(len, joins.values())) + 1} explicit bindings; raw asset {'checked' if raw is not None else 'not supplied'}")
