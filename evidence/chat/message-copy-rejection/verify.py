#!/usr/bin/env python3
"""Static retained-source/baseline custody checks only; never executes JavaScript."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--parent", type=Path, required=True)
args = parser.parse_args()
here = Path(__file__).resolve().parent
root = here.parents[2]
manifest = json.loads((here / "source-manifest.json").read_text())

def sha(data):
    return hashlib.sha256(data).hexdigest()

checks = []
def check(condition, label):
    if not condition:
        raise AssertionError(label)
    checks.append(label)

parent = args.parent.read_bytes()
check(len(parent) == manifest["parent"]["bytes"], "whole retained parent byte length")
check(sha(parent) == manifest["parent"]["sha256"], "whole retained parent SHA-256")
source = {}
for entry in manifest["spans"]:
    raw = json.loads((here / entry["file"]).read_text())["raw_utf8"].encode()
    name = entry["symbol"]
    check(len(raw) == entry["bytes"] == entry["end"] - entry["start"], name + " exact span width")
    check(sha(raw) == entry["sha256"], name + " decoded span digest")
    check(parent[entry["start"]:entry["end"]] == raw, name + " raw parent range equality")
    source[name] = raw.decode()

for name, literal in [
    ("WOo", 'Nt&&p.jsx(t0,{text:Bwr(Nt),tooltip:"Copy message",'),
    ("WOo", 'onMouseEnter:Ne,onMouseLeave:Le,children:[ze,ft,gt,Tt]'),
    ("TDo", 'G&&p.jsx(t0,{text:G,tooltip:"Copy final message",'),
    ("t0", 'if(t.disabled===!0)return'),
    ("t0", 'await l1(L);return'),
    ("t0", 'x().then(()=>{_(!0),setTimeout(()=>_(!1),2e3)}).catch(hZr)'),
    ("t0", '[g,_]=$.useState(!1)'),
    ("t0", 'O=g?p.jsx(Uo,'),
    ("t0", 'const B=g?m:u;'),
    ("t0", 'm=d===void 0?"Copied!":d'),
    ("l1", 'await navigator.clipboard.writeText(t);return'),
    ("l1", 'await xni(t)'),
    ("hZr", 'kt.error("Failed to copy",{description:"Please try again."})'),
]:
    check(literal in source[name], name + " literal join: " + literal)
check(source["hZr"].count("_(") == 0 and "setTimeout" not in source["hZr"], "rejection handler does not update success state or schedule reset")

base = manifest["baseline"]["commit"]
for entry in manifest["baseline"]["files"]:
    raw = (here / entry["snapshot"]).read_bytes()
    check(len(raw) == entry["bytes"] and sha(raw) == entry["sha256"], entry["path"] + " baseline snapshot digest")
    git_raw = subprocess.check_output(["git", "show", base + ":" + entry["path"]], cwd=root)
    check(raw == git_raw, entry["path"] + " baseline Git blob identity")
    check((root / entry["path"]).read_bytes() == raw, entry["path"] + " unchanged before RED")

entry = manifest["fixture"]
fixture = (root / entry["path"]).read_bytes()
check(len(fixture) == entry["bytes"] and sha(fixture) == entry["sha256"], "frozen actual-component fixture identity")
text = fixture.decode()
for literal in [
    'useState: React.useState',
    'React.createElement(production.Transcript!',
    '"Row", "MessageActions", "CopyButton", "TurnFooter"',
    'const transcript = applyChatEvents(',
    'const next = pending.shift()',
    'for (const target of ["Copy message", "Copy final message"] as const)',
    'await f.advance(1999)',
    'await f.advance(999)',
    'assert.equal(f.timers.size, 0, "Rejected copies do not create success-reset timers")',
]:
    check(literal in text, "fixture static join: " + literal)
check(text.count('test(`${target}:') == 4, "four frozen cases for each real button")
print(json.dumps({"kind": "STATIC_ONLY_NOT_JS_EXECUTION", "candidate": manifest["candidate"], "checks_passed": len(checks), "checks": checks}, indent=2))
