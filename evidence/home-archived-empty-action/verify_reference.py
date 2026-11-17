#!/usr/bin/env python3
"""Check retained-source/frozen-test proof; never evaluate Conductor code."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--renderer", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
packet = Path(__file__).resolve().parent
reference = json.loads((packet / "reference.json").read_text())
blob = args.renderer.read_bytes()
if blob[:2] == b"\x1f\x8b":
    blob = gzip.decompress(blob)
checks = 0

def check(condition, label):
    global checks
    if not condition:
        raise AssertionError(label)
    checks += 1

check(hashlib.sha256(blob).hexdigest() == reference["reference"]["assets"]["renderer"]["sha256"], "Full retained renderer identity")
for span in reference["spans"]:
    literal = span["source"].encode()
    check(hashlib.sha256(literal).hexdigest() == span["sha256"], f'{span["name"]} literal hash')
    if span["asset"] == "renderer":
        start, end = span["utf8_half_open"]
        check(blob[start:end] == literal, f'{span["name"]} original byte range')

home = next(s["source"] for s in reference["spans"] if s["name"] == "Home-UJo")
for anchor in [
    'R=E!==void 0&&fc(E)==="cloud"',
    'if(Ye.length===0){He=Ve;break e}',
    'hi=mo=>xe.has(mo.repositoryId)',
    'Or=U===void 0&&z.length===0&&G==="active"&&it.length===0',
    'Or?p.jsx(tt,{size:"sm",onClick:()=>n(),children:"Create a workspace"}):mr&&p.jsx(tt,{variant:"outline",size:"sm",onClick:J,children:"Clear filters"})',
]:
    check(anchor in home, anchor)
check('const LJo={owners:void 0,projects:[],archiveFilter:"active"}' in blob.decode(), "Default local filters")
for path, expected in reference["baseline_source_sha256"].items():
    current = (root / path).read_text()
    if path == "src/components/AllWorkspaces.tsx":
        current = current.replace("const empty = emptyAction(repos, filters, archivedRows);", "const empty = emptyAction(repos, filters);")
    elif path == "src/home/allWorkspaces.ts":
        current = current.replace(
            "export function emptyAction(\n  repos: readonly Repo[],\n  filters: HomeFilters,\n  archivedRows: readonly ArchivedWorkspace[] = [],\n): EmptyAction {\n  const anyWorkspace = reposWithWorkspaces(repos, archivedRows).length > 0;",
            "export function emptyAction(repos: readonly Repo[], filters: HomeFilters): EmptyAction {\n  const anyWorkspace = repos.some((r) => r.workspaces.length > 0);",
        )
    check(hashlib.sha256(current.encode()).hexdigest() == expected, f"Exact intended source boundary {path}")
check(hashlib.sha256((root / "src/components/homeArchivedEmptyAction.test.ts").read_bytes()).hexdigest() == reference["frozen_fixture_sha256"], "Unchanged frozen rendered fixture")
red = gzip.decompress((packet / "red.tap.gz").read_bytes()).decode()
check("# pass 5\n# fail 5\n" in red, "Actual frozen RED 5 pass / 5 fail")
check(red.count("+   'Create a workspace'") == 5 and red.count("-   'Clear filters'") == 5, "All five failures identify the intended contradiction")
integrated = gzip.decompress((packet / "integrated-red.tap.gz").read_bytes()).decode()
check("# pass 5\n# fail 5\n" in integrated, "Fresh-main frozen RED 5 pass / 5 fail")
check(integrated.count("+   'Create a workspace'") == 5 and integrated.count("-   'Clear filters'") == 5, "Fresh-main failures preserve intended contradiction")
print(f"PASS {checks} checks; full renderer original bytes verified; index spans historical-literal only; native/browser not run")
