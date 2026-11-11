#!/usr/bin/env python3
"""Prepare an unapplied source patch and input receipt; never import either app."""
import difflib
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
MAIN = "385ccb5229f56ff33903f034352eaa9827c40f0e"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git_bytes(path):
    return subprocess.run(["git", "show", f"{MAIN}:{path}"], cwd=ROOT,
                          check=True, capture_output=True).stdout


paths = ["src/components/AllWorkspaces.tsx", "src/home/allWorkspaces.ts", "src/home/allWorkspaces.test.ts"]
originals = {path: git_bytes(path) for path in paths}
helper_path = "src/home/allWorkspaces.ts"
tests_path = "src/home/allWorkspaces.test.ts"
helper = originals[helper_path].decode()
tests = originals[tests_path].decode()
old = ''' * workspace when nothing is filtered and there are no active workspaces at
 * all (`Or`), else Clear filters when a filter is set (`mr`).
 */
export function emptyAction(repos: readonly Repo[], filters: HomeFilters): EmptyAction {
  const anyActive = repos.some((r) => r.workspaces.some((w) => w.status !== "archived"));
  if (filters.projects.length === 0 && filters.archiveFilter === "active" && !anyActive) return "create";'''
new = ''' * workspace when no project is selected, archived workspaces are hidden, and
 * no workspace records exist before filtering (`Or`), else Clear filters (`mr`).
 */
export function emptyAction(repos: readonly Repo[], filters: HomeFilters): EmptyAction {
  const anyWorkspace = repos.some((r) => r.workspaces.length > 0);
  if (filters.projects.length === 0 && filters.archiveFilter === "active" && !anyWorkspace) return "create";'''
old_test = '  assert.equal(emptyAction([repo("a", [ws("x", { status: "archived" })])], DEFAULT_FILTERS), "create");'
new_test = '  assert.equal(emptyAction([repo("a", [ws("x", { status: "archived" })])], DEFAULT_FILTERS), "clear");'
assert helper.count(old) == 1
assert tests.count(old_test) == 1
candidates = {helper_path: helper.replace(old, new), tests_path: tests.replace(old_test, new_test)}
patch = "".join("".join(difflib.unified_diff(originals[path].decode().splitlines(keepends=True),
                                          text.splitlines(keepends=True),
                                          fromfile=f"a/{path}", tofile=f"b/{path}"))
                for path, text in candidates.items())
(OUT / "unapplied.patch").write_text(patch)
fixture_path = OUT / "homeEmptyAction.test.ts"
fixture = fixture_path.read_bytes()
assert fixture.decode().count('\ntest("') == 9
source_receipt = ROOT / "evidence/home/local-empty-states/source/receipt.json"
source = json.loads(source_receipt.read_text())
receipt = {
    "unit": "ACQ-HOME-LOCAL-EMPTY-271-02-candidate",
    "producer": "Conductor Rebuild / 27102e36",
    "status": "AUTHORED_NOT_APPLIED_OR_EXECUTED",
    "main_sha": MAIN,
    "reference_source_receipt_sha256": sha(source_receipt.read_bytes()),
    "reference_declarations": source["retained_declarations"],
    "reference_assumptions": ["Settled local input", "Reference U explicitly undefined", "Known repositories only"],
    "source_inputs": {p: {"sha256": sha(data), "bytes": len(data)} for p, data in originals.items()},
    "fixture": {"scratch_path": str(fixture_path.relative_to(ROOT)),
                "intended_path": "src/components/homeEmptyAction.test.ts", "sha256": sha(fixture),
                "bytes": len(fixture), "cases": 9},
    "unapplied_patch": {"sha256": sha(patch.encode()), "bytes": len(patch.encode()),
                        "candidate_files": {p: {"sha256": sha(t.encode()), "bytes": len(t.encode())}
                                            for p, t in candidates.items()}},
    "expected_not_observed": {"unchanged_fixture_red": {"failed": 1, "passed": 8},
                              "same_fixture_green": {"failed": 0, "passed": 9}},
    "tests_run": False,
    "product_files_edited": False,
    "publication": "none; PR #1011 immutable",
    "limits": ["Only a proposed synthetic production-component fixture.",
               "No actual app/provider/native/reference runtime or visual evidence.",
               "No assertion about loading integration, owner defaults, generic reference button, or real Create callback.",
               "Archived records are explicitly supplied in Repo props; production state/DB reachability is not established."]
}
(OUT / "prepared-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"source_preparation": "pass", "main_sha": MAIN,
                  "fixture_cases_authored": 9, "product_applied": False, "tests_run": False,
                  "fixture_sha256": sha(fixture), "patch_sha256": sha(patch.encode())}, indent=2))
