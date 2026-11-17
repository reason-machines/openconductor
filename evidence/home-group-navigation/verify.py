#!/usr/bin/env python3
"""Verify inert retained source, frozen fixtures and the recorded RED input."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PACKET = Path(__file__).with_name("reference.json")
if not PACKET.exists():
    PACKET = Path(__file__).with_name("qualification.json")
packet = json.loads(PACKET.read_text())
for span in packet["spans"]:
    data = span["source"].encode()
    assert len(data) == span["bytes"] == span["utf8_half_open"][1] - span["utf8_half_open"][0], span["name"]
    assert hashlib.sha256(data).hexdigest() == span["sha256"], span["name"]
    if "utf16_half_open" in span:
        assert len(span["source"].encode("utf-16-le")) // 2 == span["utf16_half_open"][1] - span["utf16_half_open"][0]
by_name = {span["name"]: span["source"] for span in packet["spans"]}
needles = {
    "Home-UJo": ['BJo.map(Ei=>p.jsx(iJn,{heading:FJo[Ei],items:ct[Ei]??[],...Ft}', 'p.jsxs(KV,{shouldFilter:!1,disablePointerSelection:!0'],
    "Home-command-root-KV": ['p.jsx(P6,{ref:e,className:o,...r})'],
    "command-component-P6": ['P6=Object.assign(Xyi,', 'Item:M5s', 'Group:j5s'],
    "Home-date-group-iJn": ['if(r.length===0)return null', 'p.jsx(_Jo,{workspace:k', 'p.jsx(ff,{heading:_'],
    "Home-command-group-ff": ['p.jsx(P6.Group,{ref:e,className:o,...r})'],
    "command-group-j5s": ['"cmdk-group":""', '"cmdk-group-items":""'],
    "Home-row-_Jo": ['p.jsxs($o,{value:P,onSelect:D'],
    "Home-command-item-$o": ['p.jsx(P6.Item,{ref:e,className:o,...r})'],
    "command-item-M5s": ['"cmdk-item":""', '"aria-disabled":!!w', 'onClick:w?void 0:v'],
    "selectors-prefix": ['Eve=\'[cmdk-group=""]\'', '_Bn=`${qyi}:not([aria-disabled="true"])`'],
    "V5s": ['nextElementSibling', 'if(n.matches(e))return n'],
    "W5s": ['previousElementSibling', 'if(n.matches(e))return n'],
    "command-root-Xyi": ['de=ae?.closest(Eve)', 'de=ce>0?V5s(de,Eve):W5s(de,Eve),ue=de?.querySelector(_Bn)', 'ue?P.setState("value",ue.getAttribute(bae)):Q(ce)', 'ce.preventDefault(),ce.metaKey?te():ce.altKey?J(1):Q(1)', 'ce.preventDefault(),ce.metaKey?X(0):ce.altKey?J(-1):Q(-1)'],
}
for name, fragments in needles.items():
    for fragment in fragments:
        assert fragment in by_name[name], (name, fragment)
fixture = ROOT / packet["fixture"]["path"]
assert hashlib.sha256(fixture.read_bytes()).hexdigest() == packet["fixture"]["sha256"]
baseline = subprocess.check_output(["git", "show", f'{packet["main"]}:{packet["component"]["path"]}'], cwd=ROOT)
assert hashlib.sha256(baseline).hexdigest() == packet["component"]["sha256"]
red_file = PACKET.parent / packet["red"]["path"]
compressed = red_file.read_bytes()
assert hashlib.sha256(compressed).hexdigest() == packet["red"]["sha256"]
red = gzip.decompress(compressed)
assert hashlib.sha256(red).hexdigest() == packet["red"]["uncompressed_sha256"]
assert b"# pass 4\n# fail 5\n# cancelled 0\n# skipped 0" in red
results = json.loads(PACKET.with_name("results.json").read_text())
for key in ("green", "adjacent", "typecheck"):
    receipt = results[key]
    assert hashlib.sha256((PACKET.parent / receipt["path"]).read_bytes()).hexdigest() == receipt["sha256"]
assert hashlib.sha256((ROOT / packet["component"]["path"]).read_bytes()).hexdigest() == results["fixed_component_sha256"]
print(f'PASS: {len(packet["spans"])} retained span hashes/ranges and caller joins; frozen fixture; baseline/fixed inputs; lossless RED and GREEN/adjacent/typecheck receipts')
