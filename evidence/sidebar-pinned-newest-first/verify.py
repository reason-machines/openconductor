#!/usr/bin/env python3
"""Verify retained inert source, frozen assertions and the exact repair boundary."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
manifest = json.loads((HERE / "source.json").read_text())
checks = 0


def check(condition, message):
    global checks
    assert condition, message
    checks += 1


def digest(data):
    return hashlib.sha256(data).hexdigest()


spans = {}
for item in manifest["spans"]:
    data = (HERE / item["file"]).read_bytes()
    start, end = item["utf8_span"]
    check(len(data) == end - start == item["bytes"], item["name"] + " extent")
    check(digest(data) == item["sha256"], item["name"] + " digest")
    spans[item["name"]] = data.decode()

check(spans["jia"] == "function jia(t,e){return e.pinnedAt-t.pinnedAt}", "full display comparator and argument order")
check(spans["bsa"] == "function bsa(t,e){return e.pinnedAt-t.pinnedAt}", "shortcut comparator has the same order")
check(".map(Fia).sort(jia).map(Mia)" in spans["Pia"], "selector transform sequence")
check("z=v.map(Lia)" in spans["Pia"], "rendered list preserves selected order")
check("localWorkspaceId:t" in spans["Lia"], "row receiver uses the selected workspace id")
check("return{localId:e,pinnedAt:n}" in spans["Fia"], "selector preserves numeric pin timestamps")
check(spans["Mia"] == "function Mia(t){return t.localId}", "id projection preserves sort order")
check('fc(E)==="cloud"' in spans["hBi"] and "Ue=!I&&p.jsx(Pia" in spans["hBi"], "ordinary local sidebar mount")
check(spans["Xh-import"] == "cb as Xh" and spans["Xh-export"] == "Afe as cb", "same-index workspace query binding")
check("t===void 0?v:t(v)" in spans["reference-workspace-query"], "query applies the supplied selector")
check("Yse(p.current,_)" in spans["reference-workspace-query"], "query stabilization")
check("e.entries()" in spans["query-positional-stabilization"] and "const o=t[r]" in spans["query-positional-stabilization"], "query stabilization preserves positions")
check("const r=t(i)" in spans["u5"] and "OSr(n,r)" in spans["u5"], "memoized selector forwards the new selected array")
check(spans["OSr-import"] == "nf as OSr" and spans["OSr-export"] == "EA as nf", "same-index selector stabilization binding")
check(spans["EA"] == "function EA(t,e){return NO(t,e)}", "structural sharing adapter")
check("const n=e.map((r,i)=>{const o=NO(t[i],r)" in spans["NO"], "array structural sharing retains new-array positions")

v1 = (HERE / "frozen-v1/sidebarPinnedOrder.test.ts.txt").read_bytes()
v2 = (ROOT / "src/components/sidebarPinnedOrder.test.ts").read_bytes()
change = manifest["v1_to_v2_only_change"]
check(digest(v1) == manifest["fixture_v1_sha256"], "frozen v1 full bytes retained")
check(digest(v2) == manifest["fixture_v2_sha256"], "frozen v2 full bytes")
check(v1.decode().count(change["old"]) == 1, "single inert helper correction")
check(v1.decode().replace(change["old"], change["new"]) == v2.decode(), "no assertion or case changed between v1 and v2")
for name, passed, failed in [("red.tap.gz", 7, 5), ("green.tap", 12, 0), ("frozen-v1/red.tap.gz", 7, 5), ("frozen-v1/green.tap", 12, 0), ("adjacent.tap", 205, 0)]:
    path = HERE / name
    tap = gzip.decompress(path.read_bytes()).decode() if path.suffix == ".gz" else path.read_text()
    check(re.search(rf"^# pass {passed}$", tap, re.M) is not None, name + " pass count")
    check(re.search(rf"^# fail {failed}$", tap, re.M) is not None, name + " fail count")
    check("# cancelled 0" in tap and "# skipped 0" in tap, name + " no skipped/cancelled tests")

product = (ROOT / "src/state/sidebarOrder.ts").read_text()
old_doc = "/** Pinned workspaces outside sections, across repositories, in the order they were pinned. */"
new_doc = "/** Pinned workspaces outside sections, across repositories, newest pin first (Conductor's Pia/jia). */"
old_compare = ".sort((a, b) => (a.workspace.pinnedAt ?? 0) - (b.workspace.pinnedAt ?? 0));"
new_compare = ".sort((a, b) => (b.workspace.pinnedAt ?? 0) - (a.workspace.pinnedAt ?? 0));"
check(product.count(new_compare) == product.count(new_doc) == 1, "single comparator and matching doc")
check(digest(product.replace(new_compare, old_compare).replace(new_doc, old_doc).encode()) == manifest["baseline_product_sha256"], "all other sidebarOrder bytes unchanged, including filtered REPO arm")
legacy = (HERE / "legacy-sidebarOrder.test.ts.txt").read_text()
check(digest(legacy.encode()) == manifest["legacy_fixture_sha256"], "legacy test full baseline preserved")
expected = legacy.replace('test("pinned workspaces leave their repo group and sort by pin time"', 'test("pinned workspaces leave their repo group and sort newest pin first"')
expected = expected.replace('["b1", "a2", "a3", "a1", "b2"]', '["a2", "b1", "a3", "a1", "b2"]')
expected = expected.replace('["b1", "a2", "a3", "a1"]', '["a2", "b1", "a3", "a1"]')
expected = expected.replace('["b1", "a2"]', '["a2", "b1"]')
check(expected == (ROOT / "src/state/sidebarOrder.test.ts").read_text(), "legacy migration changes pin order expectations only")
source_paths = subprocess.check_output(["git", "diff", "--name-only", manifest["baseline"], "--", "src"], cwd=ROOT, text=True).splitlines()
# A new, not-yet-staged fixture need not appear in git diff yet.
check(set(source_paths) <= {"src/state/sidebarOrder.ts", "src/state/sidebarOrder.test.ts", "src/components/sidebarPinnedOrder.test.ts"}, "no other source delta")
print(json.dumps({"result": "PASS", "checks": checks, "baseline": manifest["baseline"], "fixture_v2_sha256": digest(v2)}))
