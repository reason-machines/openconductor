#!/usr/bin/env python3
"""Inert retained-source and frozen mounted-regression verification."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
manifest = json.loads((HERE / "source.json").read_text())
reference = manifest["reference"]
parent = Path(sys.argv[1]).read_bytes()
assert len(parent) == reference["bytes"]
assert hashlib.sha256(parent).hexdigest() == reference["sha256"]
records = {}
for record in reference["records"]:
    raw = (HERE / record["path"]).read_bytes()
    start, end = record["range"]
    assert raw == parent[start:end], record["path"]
    assert len(raw) == record["bytes"], record["path"]
    assert hashlib.sha256(raw).hexdigest() == record["sha256"], record["path"]
    records[record["path"]] = raw.decode()
assert len(records) == 18

joins = {
    "h_a-palette-caller.txt": ["p.jsx(qZ,", "p.jsx(m_a,"],
    "qZ-dialog.txt": ["p.jsx(Y5s,"],
    "Y5s-content.txt": ["p.jsx(KV,", "loop:!0"],
    "KV-wrapper.txt": ["p.jsx(P6,"],
    "P6-alias.txt": ["Object.assign(Xyi", "Group:j5s", "Item:M5s", "List:$5s"],
    "m_a.txt": ['p.jsxs(L6,{ref:x', 'p.jsxs(ff,{heading:"Workspace actions"', 'p.jsxs(ff,{heading:"Actions"', 'p.jsx(ff,{heading:"Settings"', 'p.jsxs($o,'],
    "workspaces-list-l_a.txt": ["p.jsx(ff,", "p.jsx(aYe,"],
    "workspace-item-aYe.txt": ["p.jsx($o,"],
    "group-wrapper-ff.txt": ["p.jsx(P6.Group,{ref:e,className:o,...r})"],
    "group-component-j5s.txt": ['"cmdk-group":""', '"cmdk-group-heading":""', '"cmdk-group-items":""', 'role:"group"', 'n&&$.createElement("div"'],
    "selectors.txt": ["Eve='[cmdk-group=\"\"]'", "P5s='[cmdk-group-heading=\"\"]'"],
    "item-wrapper.txt": ["p.jsx(P6.Item,"],
    "item-M5s.txt": ["setState(\"value\",h.current,!0)", 'role:"option"'],
    "Xyi-root.txt": [
        'de||D(5,z)',
        'function z(){',
        'ce.firstChild)===ue',
        'ue.closest(Eve)',
        'ae.querySelector(P5s)',
        'de.scrollIntoView({block:"nearest"})',
        'ue.scrollIntoView({block:"nearest"})',
        'querySelector(`${qyi}[aria-selected="true"]`)',
        'ue?P.setState("value",ue.getAttribute(bae)):Q(ce)',
        'ce.altKey?J(1):Q(1)',
        'ce.altKey?J(-1):Q(-1)',
    ],
    "list-L6.txt": ["p.jsx(P6.List,{ref:e"],
    "list-$5s.txt": ['"cmdk-list-sizer":""', 'u.listInnerRef'],
    "scheduler-G5s.txt": ['DJ(()=>{n.current.forEach(i=>i())', 'n.current.set(i,r)'],
    "layout-DJ.txt": ["useLayoutEffect"],
}
for name, tokens in joins.items():
    for token in tokens:
        assert token in records[name], (name, token)
fixture = ROOT / manifest["fixture"]["path"]
assert hashlib.sha256(fixture.read_bytes()).hexdigest() == manifest["fixture"]["sha256"]
red = (HERE / "red.tap").read_text()
assert re.search(r"^# tests 18$", red, re.M)
assert re.search(r"^# pass 8$", red, re.M)
assert re.search(r"^# fail 10$", red, re.M)
assert red.count("code: 'ERR_ASSERTION'") == 10
assert "ERR_MODULE_NOT_FOUND" not in red
assert "TypeError" not in red
for name in ["predecessor-head-red.tap"]:
    text = (HERE / name).read_text()
    assert re.search(r"^# pass 8$", text, re.M)
    assert re.search(r"^# fail 10$", text, re.M)
    assert text.count("code: 'ERR_ASSERTION'") == 10
for name, count in [("green.tap", 37), ("adjacent.tap", 470)]:
    text = (HERE / name).read_text()
    assert re.search(rf"^# tests {count}$", text, re.M), name
    assert re.search(rf"^# pass {count}$", text, re.M), name
    assert re.search(r"^# fail 0$", text, re.M), name
    assert re.search(r"^# skipped 0$", text, re.M), name
build = gzip.decompress((HERE / "build.log.gz").read_bytes()).decode()
assert "tsc --noEmit" in build and "built in" in build
integration = json.loads((HERE / "integration.json").read_text())
assert integration["baseMain"] == "e6f9dfcb2eb9e12dc3b1c67c41baa268236f7269"
assert integration["predecessor"]["merge"] == integration["baseMain"]
assert integration["fixture"] == manifest["fixture"]
for path, digest in integration["frozenPredecessors"].items():
    assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest, path
production = integration["production"]
assert hashlib.sha256((ROOT / production["path"]).read_bytes()).hexdigest() == production["sha256"]
integrated = {}
for name, expected in integration["logs"].items():
    packed = (HERE / name).read_bytes()
    raw = gzip.decompress(packed)
    assert hashlib.sha256(packed).hexdigest() == expected["gzipSha256"], name
    assert len(raw) == expected["rawBytes"], name
    assert hashlib.sha256(raw).hexdigest() == expected["rawSha256"], name
    integrated[name] = raw.decode()
for name, total, passed, failed in [
    ("integrated-red.tap.gz", 18, 8, 10),
    ("integrated-green.tap.gz", 37, 37, 0),
    ("integrated-adjacent.tap.gz", 470, 470, 0),
]:
    text = integrated[name]
    for key, count in [("tests", total), ("pass", passed), ("fail", failed), ("skipped", 0)]:
        assert re.search(rf"^# {key} {count}$", text, re.M), (name, key)
red = integrated["integrated-red.tap.gz"]
assert red.count("code: 'ERR_ASSERTION'") == 10
assert "ERR_MODULE_NOT_FOUND" not in red and "TypeError" not in red
build = integrated["integrated-build.log.gz"]
assert "tsc --noEmit" in build and "built in" in build
print("PASS: full retained parent, 18 complete byte records, closed joins, frozen fixture; assertion-only RED 8/10, fresh-main 37/37 + 470/470 and build; protected predecessors and lossless integrated logs")
