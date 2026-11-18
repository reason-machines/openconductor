"""Verify inert retained source and frozen regression, without executing JS."""
from pathlib import Path
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parents[3]
packet = Path(__file__).resolve().parent
qualification = json.loads((packet / "qualification.json").read_text())
frozen = json.loads((packet / "frozen.json").read_text())
checks = []


def check(name, condition):
    assert condition, name
    checks.append(name)


def digest(data):
    return hashlib.sha256(data).hexdigest()


for span in qualification["spans"]:
    data = (packet / span["file"]).read_bytes()
    check(f"{span['name']}: complete span bytes", len(data) == span["bytes"])
    check(f"{span['name']}: source digest", digest(data) == span["sha256"])
    for literal in qualification["joins"][span["name"]]:
        check(f"{span['name']}: {literal}", literal in data.decode())

check("17 complete retained spans", len(qualification["spans"]) == 17)
check("47022 source bytes", sum(s["bytes"] for s in qualification["spans"]) == 47022)
check("same frozen source baseline", qualification["main"] == frozen["baseline"])
for source in qualification["main_sources"]:
    data = subprocess.check_output(["git", "show", f"{frozen['baseline']}:{source['path']}"], cwd=root)
    check(f"{source['path']}: pinned main digest", digest(data) == source["sha256"])
    for span in source["spans"]:
        a, b = span["lines"]
        check(f"{source['path']}:{a}-{b}", digest(b"".join(data.splitlines(keepends=True)[a-1:b])) == span["sha256"])
    for literal in qualification["main_joins"].get(source["path"], []):
        check(f"{source['path']}: {literal}", literal in data.decode())
    if source["path"] == "src/features/diff/target.ts":
        check("exact baseline predicate snapshot", (packet / "baseline-target.ts.txt").read_bytes() == data)
    if source["path"] == "src/features/diff/target.test.ts":
        check("exact superseded historical test", (packet / "superseded-target.test.ts.txt").read_bytes() == data)

successor = json.loads((packet / "frozen-v2.json").read_text())
original = (root / successor["supersedes"]["fixture_snapshot"]).read_bytes()
fixture = successor["fixture"]
selector_successor = json.loads((packet / "frozen-v3.json").read_text())
current = (root / selector_successor["supersedes"]["fixture_snapshot"]).read_bytes()
check("preserved v1 mounted fixture", digest(original) == frozen["fixture"]["sha256"] == successor["supersedes"]["sha256"])
check("preserved v1 byte count", len(original) == successor["supersedes"]["bytes"])
check("frozen v2 mounted fixture", digest(current) == fixture["sha256"])
check("frozen v2 byte count", len(current) == fixture["bytes"])
replacement = fixture["exact_replacement"]
before, after = replacement["before"].encode(), replacement["after"].encode()
check("unique unavailable-editor boundary", original.count(before) == 1)
check("only v2 boundary correction; all cases and assertions unchanged", original.replace(before, after, 1) == current)
check("preserved v2 selector predecessor", digest(current) == selector_successor["supersedes"]["sha256"])
selector_fixture = selector_successor["fixture"]
corrected = (root / selector_fixture["path"]).read_bytes()
check("frozen v3 mounted fixture", digest(corrected) == selector_fixture["sha256"])
check("frozen v3 byte count", len(corrected) == selector_fixture["bytes"])
expected = current
for replacement in selector_fixture["exact_replacements"]:
    before, after = replacement["before"].encode(), replacement["after"].encode()
    check("unique original surface binding", expected.count(before) == 1)
    expected = expected.replace(before, after, 1)
check("only v3 surface-binding corrections; all cases and assertions unchanged", expected == corrected)
case_start = b'for (const layout of ["unified", "split", "file"])'
check("ten case bodies byte-identical", current[current.index(case_start):] == corrected[corrected.index(case_start):])
check("unchanged dependency lock", digest((root / frozen["dependencies"]["lock"]).read_bytes()) == frozen["dependencies"]["sha256"])
print(json.dumps({"passed": len(checks), "failed": 0, "baseline": frozen["baseline"], "fixture_sha256": selector_fixture["sha256"], "source_spans": 17, "source_bytes": 47022}, indent=2))
