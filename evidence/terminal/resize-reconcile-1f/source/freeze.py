"""Freeze an unexecuted source-only resize unit for the existing serialized executor."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
sha = lambda data: hashlib.sha256(data).hexdigest()
ref = json.loads((HERE / "reference.json").read_text())
base = ref["main_checked"]
assert subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip() == base
fixture_path = "src/features/terminal/resizeState.test.ts"
fixture = (ROOT / fixture_path).read_bytes()
(HERE / "frozen-resizeState.test.ts.txt").write_bytes(fixture)
paths = [
    "src/features/terminal/session.ts", "src/features/terminal/events.ts",
    "src/features/terminal/tabs.ts", "src/features/terminal/restore.ts",
    "src/features/terminal/tabList.ts", "src/features/terminal/shortcuts.ts",
    "src/features/terminal/shellIntegration.ts", "src/features/terminal/bigTerminal.ts",
    "src/keybindings/resolve.ts", "src/keybindings/dispatcher.ts",
    "src/keybindings/shortcut.ts", "src/keybindings/overrides.ts",
    "src/keybindings/registry.ts", "src/keybindings/types.ts",
    "scripts/check-colors.mjs", "src/theme/tokens.css", "package.json", "package-lock.json",
]
closure = []
for path in paths:
    data = subprocess.check_output(["git", "show", f"{base}:{path}"], cwd=ROOT)
    dest = HERE / "main" / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    closure.append({"path": path, "file": "main/" + path, "bytes": len(data), "sha256": sha(data)})
assert (ROOT / "src/features/terminal/session.ts").read_bytes() == (HERE / "main/src/features/terminal/session.ts").read_bytes()
patch = (HERE / "candidate.patch").read_bytes()
candidate = (ROOT / ".oc-tmp/resize-reconcile-1f/candidate-session.ts").read_bytes()
frozen = {
    "unit": ref["unit"], "author": "Conductor Rebuild", "main_checked": base,
    "fixture": {"path": fixture_path, "bytes": len(fixture), "sha256": sha(fixture)},
    "baseline_session_sha256": sha((HERE / "main/src/features/terminal/session.ts").read_bytes()),
    "candidate_session_sha256": sha(candidate), "candidate_patch_sha256": sha(patch),
    "source_reference_sha256": sha((HERE / "reference.json").read_bytes()),
    "source_closure": closure,
    "candidate_applied_to_product": False, "fixture_executed": False,
    "assertions": "Same fixture bytes for RED and GREEN; no reference JS evaluation",
}
(HERE / "frozen.json").write_text(json.dumps(frozen, indent=2) + "\n")
command = "NODE_OPTIONS=--max-old-space-size=768 nice -n 19 timeout --kill-after=5s 60s node --experimental-strip-types --test --test-concurrency=1 src/features/terminal/resizeState.test.ts"
request = {
    "unit": ref["unit"], "owner": "1f14fa82-4ec3-41fc-b085-32ec441b4228",
    "executor": "e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46", "no_new_runtime_here": True,
    "main_checked": base, "frozen_manifest_sha256": sha((HERE / "frozen.json").read_bytes()),
    "scope": ["src/features/terminal/session.ts:spawnTerminal", fixture_path, "evidence/terminal/resize-reconcile-1f/**"],
    "deps": {"runtime": ["existing TypeScript", "existing React"], "xterm": "type-only imports + isolated Terminal boundary", "install": False, "full_app_typecheck_qualified": False},
    "phases": [
        {"stage": "RED", "command": command, "expected": "10 cases: 7 intended request-assertion failures, 3 passes; setup failures do not qualify", "source": "baseline session/main closure"},
        {"stage": "GREEN", "command": command, "expected": "same 10 cases/assertions all pass after ONLY frozen candidate.patch", "source": "same private closure + candidate.patch"},
        {"stage": "target-color-lint", "command": "NODE_OPTIONS=--max-old-space-size=768 nice -n 19 timeout --kill-after=5s 20s node scripts/check-colors.mjs src/features/terminal/resizeState.test.ts", "expected": "exit 0; no literals/hue violations"},
    ],
    "execution_rules": ["Existing sole queue only after source/dependency admission; no extra runner/install/observer", "Check fresh main source pins, frozen hashes and physical existing dependency pins before execution", "Do not evaluate retained reference JS", "If missing source/dependency, return exact blocker; no setup/retry loop", "No broad focused/fullTSC/native gate added", "Return actual commands, timing, process terminal state, limits, full TAP, input/source identities; no predicted result as actual"],
    "gaps": ["No actual xterm rendering", "No native/PTY/kernel/shell/provider/browser/install behavior", "No whole-app TSC from scoped resolver"],
}
(HERE / "execution-request.json").write_text(json.dumps(request, indent=2) + "\n")
files = {fixture_path: ROOT / fixture_path}
for file in sorted((HERE.parent).rglob("*")):
    if file.is_file() and not file.is_symlink():
        files[file.relative_to(ROOT).as_posix()] = file
inventory = {"unit": ref["unit"], "members": [{"path": path, "bytes": file.stat().st_size, "sha256": sha(file.read_bytes())} for path, file in sorted(files.items())], "regular_files_only": True}
inventory_path = ROOT / ".oc-tmp/resize-reconcile-1f/HANDOFF-INVENTORY.json"
inventory_path.write_text(json.dumps(inventory, indent=2) + "\n")
files["HANDOFF-INVENTORY.json"] = inventory_path
archive = ROOT / ".oc-tmp/resize-reconcile-1f/terminal-resize-reconcile-frozen.tar"
with tarfile.open(archive, "w") as tar:
    for path, file in sorted(files.items()):
        assert not path.startswith("/") and ".." not in Path(path).parts
        tar.add(file, arcname=path, recursive=False)
with tarfile.open(archive) as tar:
    for member in tar.getmembers():
        assert member.isfile() and not member.issym() and not member.islnk()
        assert tar.extractfile(member).read() == files[member.name].read_bytes()
print(json.dumps({"archive": str(archive.relative_to(ROOT)), "sha256": sha(archive.read_bytes()), "bytes": archive.stat().st_size, "members": len(files), "fixture": frozen["fixture"], "baseline": frozen["baseline_session_sha256"], "candidate": frozen["candidate_session_sha256"], "patch": frozen["candidate_patch_sha256"], "frozen_manifest": request["frozen_manifest_sha256"]}, indent=2))
