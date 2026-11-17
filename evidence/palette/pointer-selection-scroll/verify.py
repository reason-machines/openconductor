"""Check retained original bytes and the frozen mounted regression, without eval."""
from pathlib import Path
import hashlib
import json
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
manifest = json.loads((HERE / "source.json").read_text())
digest = lambda data: hashlib.sha256(data).hexdigest()
parent = Path(sys.argv[1]).read_bytes()
reference = manifest["reference"]
assert len(parent) == reference["bytes"]
assert digest(parent) == reference["sha256"]
for record in reference["records"]:
    data = (HERE / record["path"]).read_bytes()
    start, end = record["range"]
    assert data == parent[start:end], record["path"]
    assert len(data) == record["bytes"], record["path"]
    assert digest(data) == record["sha256"], record["path"]
fixture = manifest["fixture"]
assert digest((ROOT / fixture["path"]).read_bytes()) == fixture["sha256"]
for path, needles in {
    "h_a-palette-caller.txt": ["p.jsx(qZ,", "commandProps:{filter:wUi}", "children:p.jsx(m_a,"],
    "qZ-dialog.txt": ["p.jsx(Y5s,", "commandProps:i"],
    "Y5s-content.txt": ["p.jsx(KV,", "loop:!0", "...i,children:n"],
    "KV-wrapper.txt": ["p.jsx(P6,"],
    "command-component-P6.txt": ["Xyi", "Item:M5s", "List:$5s"],
    "m_a.txt": ["p.jsx(l_a,", "p.jsxs(L6,", "p.jsxs($o,", "case\"workspace-actions\"", "m===\"projects\"", "p.jsx(Vba,"],
    "regular-workspace-Vba.txt": ["p.jsx($o,", "onSelect:i"],
    "workspaces-list-l_a.txt": ["const ke=L6", "p.jsx(ke,{ref:v", "p.jsx(aYe,"],
    "workspace-item-aYe.txt": ["p.jsx($o,", "onSelect:i"],
    "item-wrapper.txt": ["p.jsx(P6.Item,"],
    "item-M5s.txt": ["function x(){m.setState(\"value\",h.current,!0)}", "onPointerMove:w||c.getDisablePointerSelection()?void 0:x"],
    "command-root-Xyi.txt": ["disablePointerSelection:x=!1", "de||D(5,z)", "function z()", "scrollIntoView({block:\"nearest\"})", "function G()", "O.current", "function Q(ce)", "P.setState(\"value\",be.getAttribute(bae))"],
    "list-L6.txt": ["p.jsx(P6.List,", "ref:e"],
    "list-$5s.txt": ["u.listInnerRef"],
    "scheduler-G5s.txt": ["DJ(", "n.current.forEach(i=>i())", "n.current.set(i,r)"],
}.items():
    data = (HERE / path).read_text()
    for needle in needles:
        assert needle in data, (path, needle)
print(f"PASS: {len(reference['records'])} retained records, full parent identity, frozen fixture and regular caller/item/root/list joins")

integration = json.loads((HERE / "integration.json").read_text())
for path, expected in integration["protected_fixtures"].items():
    assert digest((ROOT / path).read_bytes()) == expected, path
import gzip
for record in integration["logs"]:
    data = gzip.decompress((HERE / record["path"]).read_bytes())
    assert digest(data) == record["raw_sha256"], record["path"]
    for needle in record["required"]:
        assert needle in data.decode(), (record["path"], needle)
print("PASS: fresh-main integrated RED/GREEN/build logs and unchanged predecessor fixtures")
