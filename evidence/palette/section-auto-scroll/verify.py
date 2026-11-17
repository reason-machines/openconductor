#!/usr/bin/env python3
"""Verify inert retained-REA bytes and this frozen mounted regression."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess
import sys

here = Path(__file__).resolve().parent
repo = here.parents[2]
manifest = json.loads((here / "source.json").read_text())
reference = manifest["reference"]
parent = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else None
sha = lambda data: hashlib.sha256(data).hexdigest()
if parent is not None:
    assert len(parent) == reference["bytes"]
    assert sha(parent) == reference["sha256"]
for record in reference["records"]:
    data = (here / record["path"]).read_bytes()
    assert len(data) == record["bytes"], record["path"]
    assert sha(data) == record["sha256"], record["path"]
    if parent is not None:
        assert parent[slice(*record["range"])] == data, record["path"]

def retained(name):
    return next((here / record["path"]).read_text() for record in reference["records"] if Path(record["path"]).name == name)

# Actual section caller -> list component -> list-inner ref used by root G/z.
section = retained("section-Jba.txt")
assert "H=p.jsx(L6," in section and "p.jsxs(KV,{loop:!0" in section
assert "P6.List" in retained("list-L6.txt")
assert "List:$5s" in retained("command-component-P6.txt")
assert "ref:qce(a,u.listInnerRef)" in retained("list-$5s.txt")
root = retained("command-root-Xyi.txt")
for token in [
    "listInnerRef:O", 'function G(){var ce;return(ce=O.current)',
    'ce.querySelector(`${qyi}[aria-selected="true"]`)',
    "function z(){", 'ue.scrollIntoView({block:"nearest"})',
    'else if(ce==="value")', "de||D(5,z)",
    'function X(ce){let ae=K()[ce];ae&&P.setState("value",ae.getAttribute(bae))}',
    "function Q(ce)", 'be&&P.setState("value",be.getAttribute(bae))',
    'case"ArrowDown":{Z(ce);break}', 'case"ArrowUp":{se(ce);break}',
    'case"Home":{ce.preventDefault(),X(0);break}',
    'case"End":{ce.preventDefault(),te();break}',
]:
    assert token in root, token
assert "ce.metaKey?te():ce.altKey?J(1):Q(1)" in root
assert "ce.metaKey?X(0):ce.altKey?J(-1):Q(-1)" in root
# Scheduler is a layout-effect flush, not dead scroll code.
assert "n.current.forEach(i=>i())" in retained("scheduler-G5s.txt")
assert "n.current.set(i,r),e({})" in retained("scheduler-G5s.txt")
assert '$.useEffect:$.useLayoutEffect' in retained("layout-DJ.txt")
# Pointer updates deliberately suppress the scheduled scroll.
item = retained("item-M5s.txt")
assert 'm.setState("value",h.current,!0)' in item
assert "onPointerMove:w||c.getDisablePointerSelection()?void 0:x" in item
fixture = manifest["fixture"]
assert sha((repo / fixture["path"]).read_bytes()) == fixture["sha256"]
for record in manifest.get("baseline", []):
    data = subprocess.check_output(["git", "show", f'{manifest["main"]}:{record["path"]}'], cwd=repo)
    assert sha(data) == record["sha256"], record["path"]
red = here / "red.tap.gz"
if red.exists():
    text = gzip.decompress(red.read_bytes()).decode()
    assert "# tests 18\n" in text and "# pass 7\n" in text and "# fail 11\n" in text
    assert text.count("code: 'ERR_ASSERTION'") == 11
    assert text.count("must scroll its actual section list: []") == 11
integration = json.loads((here / "integration.json").read_text())
for record in integration["baseline"]:
    data = subprocess.check_output(["git", "show", f'{integration["main"]}:{record["path"]}'], cwd=repo)
    assert sha(data) == record["sha256"], record["path"]
for record in integration["candidate"] + integration["protected_fixtures"]:
    assert sha((repo / record["path"]).read_bytes()) == record["sha256"], record["path"]
for record in integration["protected_fixtures"]:
    assert (repo / record["path"]).read_bytes() == subprocess.check_output(
        ["git", "show", f'{integration["main"]}:{record["path"]}'], cwd=repo)
# Only the loader import allowlist changes; every existing assertion stays exact.
adapter = integration["adapter"]
before = gzip.decompress((here / adapter["before_archive"]).read_bytes())
after = (repo / adapter["path"]).read_bytes()
assert sha(before) == adapter["before_sha256"]
assert sha(after) == adapter["after_sha256"]
old = b'if (name === "react/jsx-runtime") return dependencies(name);'
new = b'if (name === "react" || name === "react/jsx-runtime") return dependencies(name);'
assert before.count(old) == 1 and after == before.replace(old, new)
assert before == subprocess.check_output(["git", "show", f'{integration["main"]}:{adapter["path"]}'], cwd=repo)
for name, count, passed, failed in [("red", 18, 7, 11), ("green", 21, 21, 0), ("adjacent", 433, 433, 0)]:
    text = gzip.decompress((here / "integration" / f"{name}.tap.gz").read_bytes()).decode()
    assert f"# tests {count}\n" in text and f"# pass {passed}\n" in text and f"# fail {failed}\n" in text
    assert "# skipped 0\n" in text and "# cancelled 0\n" in text
    if name == "red":
        assert text.count("code: 'ERR_ASSERTION'") == 11
        assert text.count("must scroll its actual section list: []") == 11
build = gzip.decompress((here / "integration" / "build.log.gz").read_bytes()).decode()
assert "tsc --noEmit" in build and "built in" in build
print(f'PASS: {len(reference["records"])} retained source records, keyboard/list/scheduler/pointer closure, frozen fixture, integrated RED/GREEN, protected assertions and one-line loader adapter' + ("; full parent equality PASS" if parent is not None else "; parent NOT CHECKED"))
