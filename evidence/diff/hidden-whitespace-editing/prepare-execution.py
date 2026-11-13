"""Seal source inputs without executing Git fixtures, Node or application code."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(sys.argv[1]).resolve()
BASE = "2b079f13e07b580d26191f7f1f50b4d21e62174e"
PRODUCT = [
    "src/features/diff/useWorkspaceDiff.ts", "src/features/diff/DiffViewer.tsx",
    "src/features/diff/editable.ts", "src/features/diff/FileDiffView.tsx", "src/features/diff/pierre.ts",
]
COMMON = [
    "src/features/diff/api.ts", "src/features/diff/types.ts", "src/features/diff/target.ts",
    "src/features/diff/nav.ts", "src/features/diff/changesTree.ts", "src/features/diff/changesFilter.ts",
    "src/features/diff/viewed.ts", "src/features/diff/EditInViewer.ts", "src/features/diff/editorContents.ts",
    "src/features/diff/copyFile.ts", "src/features/files/tree.ts", "src/lib/keyedCache.ts", "src/keybindings/fuzzy.ts",
    "src/keybindings/overrides.ts", "src/keybindings/registry.ts", "src/keybindings/shortcut.ts", "src/keybindings/types.ts",
    "src/features/diff/EditInViewer.test.ts", "src/features/diff/wholeFileRefresh.test.ts", "src/features/diff/pierre.test.ts",
    "src/features/diff/editorContents.test.ts", "package.json", "package-lock.json", "tsconfig.json",
]
TEST = "src/features/diff/hiddenWhitespaceEditing.test.ts"
ORIGINAL = ".rea-work/diff-edit-whitespace-source"
ORIGINAL_SHA = "9e2323001151099dc53928a8b3276c82729ca3b4783fb7ab5baea51bb6703c0a"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


assert not OUT.exists(), "Use a new output directory. Do not rewrite a sealed execution packet."
assert git("branch", "--show-current").decode().strip() == "reason/openconductor-sol-diff-a-de6c02f4"
assert sha((ROOT / ORIGINAL / "hiddenWhitespaceEditing.test.ts").read_bytes()) == ORIGINAL_SHA
reference = json.loads((ROOT / ORIGINAL / "qualification.json").read_text())
assert reference["main"] == BASE
for entry in reference["reference_spans"]:
    assert sha(entry["source"].encode()) == entry["sha256"]
for path in COMMON:
    assert (ROOT / path).read_bytes() == git("show", f"{BASE}:{path}"), f"Shared input changed: {path}"

manifest = {
    "scope": "DIFF-EDIT-HIDDEN-WHITESPACE",
    "owner": "de6c02f4-4880-4a0d-bf8f-9e3954522753",
    "baseline_main": BASE,
    "assigned_branch": "reason/openconductor-sol-diff-a-de6c02f4",
    "fixture": {"path": TEST, "sha256": sha((ROOT / TEST).read_bytes()),
                "assertion_tail_sha256": sha((ROOT / TEST).read_bytes().split(b'for (const layout of ["unified", "split", "file"] as const) {', 1)[1])},
    "original_fixture_sha256": ORIGINAL_SHA,
    "reference_source_sha256": sha((ROOT / ORIGINAL / "qualification.json").read_bytes()),
    "files": {},
    "runtime": "NOT RUN; source preparation only",
    "admission": "existing E1 only; older queue unchanged; no independent runtime/observer/native",
    "limitations": ["Tauri IPC bridge uses real Git patch responses, not Rust workspace_diff execution",
                    "Pierre CodeView/editor handle is substituted; no DOM/native/visual claim",
                    "save bridge writes exact IPC payload to an isolated disposable Git file",
                    "whole-file save does not add an atomic disk-conflict check"],
}
for phase in ["baseline", "candidate"]:
    for path in PRODUCT + COMMON + [TEST]:
        data = git("show", f"{BASE}:{path}") if phase == "baseline" and path != TEST else (ROOT / path).read_bytes()
        target = OUT / phase / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        manifest["files"][f"{phase}/{path}"] = sha(data)
    for name in ["hiddenWhitespaceEditing.test.ts", "prepare-input.py"]:
        target = OUT / phase / ORIGINAL / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / ORIGINAL / name, target)
        manifest["files"][f"{phase}/{ORIGINAL}/{name}"] = sha(target.read_bytes())
    assert (OUT / phase / TEST).read_bytes() == (ROOT / TEST).read_bytes()

patch = git("diff", BASE, "--", *PRODUCT)
assert patch and git("diff", BASE, "--", "src/features/diff/ChangesList.tsx", "src/features/diff/changesSummary.test.ts", "src/components/WorkspaceView.tsx", "src-tauri") == b""
(OUT / "candidate.patch").write_bytes(patch)
manifest["candidate_patch_sha256"] = sha(patch)
manifest["commands"] = {
    "integration_each_phase": "node --experimental-strip-types --test --test-concurrency=1 src/features/diff/hiddenWhitespaceEditing.test.ts",
    "original_prepare_each_phase": "python3 .rea-work/diff-edit-whitespace-source/prepare-input.py <empty-executor-owned-directory>",
    "original_each_phase": "node --experimental-strip-types --test --test-concurrency=1 .rea-work/diff-edit-whitespace-source/hiddenWhitespaceEditing.test.ts",
    "nearby_candidate": "node --experimental-strip-types --test --test-concurrency=1 src/features/diff/EditInViewer.test.ts src/features/diff/wholeFileRefresh.test.ts src/features/diff/pierre.test.ts src/features/diff/editorContents.test.ts",
}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
shutil.copyfile(ROOT / "evidence/diff/hidden-whitespace-editing/README.md", OUT / "README.md")
shutil.copyfile(ROOT / ORIGINAL / "qualification.json", OUT / "reference-source.json")
with tarfile.open(str(OUT) + ".tar.gz", "w:gz") as archive:
    archive.add(OUT, arcname=OUT.name)
print(json.dumps({"source_inputs": "PASS", "baseline": BASE, "fixture_sha256": manifest["fixture"]["sha256"],
                  "manifest_sha256": sha((OUT / "manifest.json").read_bytes()),
                  "archive": str(OUT) + ".tar.gz", "archive_sha256": sha(Path(str(OUT) + ".tar.gz").read_bytes()),
                  "runtime": "NOT RUN"}))
