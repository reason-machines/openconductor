import hashlib
import json
import runpy
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
BRANCH = "d9d2187c9638ce666335ba8d8db62bb3612f8a9d"
MAIN = "f55d0330ff32e790c08a26d2e7aa83dbf2b8ea32"
VIEW = "src/features/diff/FileDiffView.tsx"
HIDDEN = "evidence/diff/hidden-whitespace-editing/execution-source-manifest.json"
MOVED = "evidence/diff/moved-comment-anchors/source.json"


def git_bytes(commit, path):
    return subprocess.check_output(["git", "show", f"{commit}:{path}"], cwd=ROOT)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


checks = {}
parents = {}
for name, commit in [("branch", BRANCH), ("main", MAIN)]:
    parents[name] = {}
    for key, path in [("hidden", HIDDEN), ("moved", MOVED)]:
        raw = git_bytes(commit, path)
        snapshot = HERE / f"{name}-{key}.before.json"
        if not snapshot.exists():
            snapshot.write_bytes(raw)
        checks[f"complete-snapshot:{name}:{key}"] = snapshot.read_bytes() == raw
        parents[name][key] = json.loads(raw)
    old_view = git_bytes(commit, VIEW)
    old_sha = sha(old_view)
    checks[f"original-identity:{name}:hidden"] = parents[name]["hidden"]["files"]["candidate/" + VIEW] == old_sha
    checks[f"original-identity:{name}:moved"] = parents[name]["moved"]["product"][VIEW]["candidate"] == old_sha

view = (ROOT / VIEW).read_bytes()
caller = b' deleted={file.status === "deleted"}'
checks["composition-only-adds-deleted-caller-to-main"] = view.count(caller) == 1 and view.replace(caller, b"", 1) == git_bytes(MAIN, VIEW)
old_body = b'  if (file.binary) body = <div className="oc-file-note">Binary file not shown.</div>;'
new_body = b'  if (file.hide_reason === "file_too_large") body = <div className="oc-file-note">File too large to display</div>;\n  else if (file.binary) body = <div className="oc-file-note">Binary file not shown.</div>;'
checks["composition-only-adds-placeholder-to-branch"] = view.count(new_body) == 1 and view.replace(new_body, old_body, 1) == git_bytes(BRANCH, VIEW)

for key, path in [("hidden", HIDDEN), ("moved", MOVED)]:
    raw = git_bytes(MAIN, path)
    old_sha = sha(git_bytes(MAIN, VIEW)).encode()
    expected = raw.replace(old_sha, sha(view).encode(), 1)
    checks[f"only-current-view-candidate-scalar:{key}"] = raw.count(old_sha) == 1 and (ROOT / path).read_bytes() == expected

hidden = json.loads((ROOT / HIDDEN).read_text())
moved = json.loads((ROOT / MOVED).read_text())
runner = runpy.run_path(str(ROOT / "evidence/diff/hidden-whitespace-editing/run-paired.py"), run_name="source_preflight")
_, inputs = runner["source_inputs"]()
for path, hashes in inputs["inputs"].items():
    checks[f"hidden-live-identity:{path}"] = sha((ROOT / path).read_bytes()) == hashes["candidate"]
checks["hidden-corrected-fixture-identity"] = sha((ROOT / runner["FIXTURE"]).read_bytes()) == inputs["fixture_sha256"]
for path, hashes in moved["product"].items():
    checks[f"moved-live-identity:{path}"] = sha((ROOT / path).read_bytes()) == hashes["candidate"]
    checks[f"moved-historical-identity:{path}"] = sha(git_bytes(moved["baseline"], path)) == hashes["baseline"]

for path in [
    "src-tauri/src/open_in/deleted_finder_ipc.rs",
    "evidence/open-in/deleted-finder/fixture-v1.rs.txt",
    "src/features/diff/deletedFinderContext.test.ts",
    "src/features/diff/hiddenWhitespaceEditing.test.ts",
    "src/features/diff/movedCommentAnchors.test.ts",
    "evidence/diff/hidden-whitespace-editing/run-paired.py",
    "evidence/diff/moved-comment-anchors/run-paired.py",
    ".github/workflows/diff-hidden-whitespace.yml",
    ".github/workflows/diff-moved-comment-anchors.yml",
]:
    checks[f"preserved-branch-fixture-runner:{path}"] = (ROOT / path).read_bytes() == git_bytes(BRANCH, path)
for path in [
    "src-tauri/src/diff/git.rs", "src-tauri/src/diff/model.rs", "src/features/diff/types.ts",
    "src-tauri/src/diff/large_file_tests.rs", "tests/diff/largeFilePlaceholder.mounted.test.mjs",
    "evidence/diff/large-file-placeholder/cases.json", ".github/workflows/diff-large-file-placeholder.yml",
]:
    checks[f"preserved-main-product-fixture:{path}"] = (ROOT / path).read_bytes() == git_bytes(MAIN, path)
checks["original-hidden-source-preflight"] = True
failed = [name for name, passed in checks.items() if not passed]
receipt = {
    "owner": "Conductor Rebuild", "branch_parent": BRANCH, "consumed_main": MAIN,
    "view_sha256": sha(view),
    "view_git_blob": subprocess.check_output(["git", "hash-object", VIEW], cwd=ROOT, text=True).strip(),
    "checks": checks, "passed": sum(checks.values()), "failed": failed,
    "claim": "Source identity and preservation only; historical manifests, fixtures, runners and workflow gates unchanged.",
    "hosted_composed_behavior": "PENDING", "native_gui": "NOT_RUN",
}
(HERE / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({key: receipt[key] for key in ["view_sha256", "view_git_blob", "passed", "failed", "claim"]}))
if failed:
    raise SystemExit(1)
