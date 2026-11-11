#!/usr/bin/env python3
"""Freeze a main-source snapshot without executing application or test code."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
MAIN = "385ccb5229f56ff33903f034352eaa9827c40f0e"
RUNTIME = ROOT / ".ara-state/home-empty-action-runtime"
DEPS = ROOT / ".ara-state/home-filter-selection-deps/node_modules"
FILES = [
    "package.json",
    "src/components/AllWorkspaces.tsx",
    "src/components/sidebarLabel.ts",
    "src/home/allWorkspaces.ts",
    "src/home/allWorkspaces.test.ts",
    "src/state/rowStatus.ts",
    "src/state/workspaceNumber.ts",
    "src/state/persisted.ts",
    "src/workspace/archivedList.ts",
    "src/state/workspaceStatus.ts",
    "src/home/sidebarGroupBy.ts",
    "src/state/openChat.ts",
    "src/state/workspaceSessions.ts",
]
EXPECTED_DEPS = {
    "react": "18.3.1", "react-test-renderer": "18.3.1", "typescript": "5.9.3",
    "loose-envify": "1.4.0", "react-is": "18.3.1", "react-shallow-renderer": "16.15.0",
    "scheduler": "0.23.2", "js-tokens": "4.0.0", "object-assign": "4.1.1",
}


def digest(data):
    return {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def blob(path):
    return subprocess.run(["git", "show", f"{MAIN}:{path}"], cwd=ROOT,
                          check=True, capture_output=True, timeout=20).stdout


assert not RUNTIME.exists(), "Do not overwrite an existing proof snapshot"
prepared = json.loads((OUT / "prepared-receipt.json").read_text())
actual_deps = {p.name: json.loads((p / "package.json").read_text())["version"]
               for p in DEPS.iterdir() if (p / "package.json").is_file()}
assert actual_deps == EXPECTED_DEPS, actual_deps
sources = {path: blob(path) for path in FILES}
for path, expected in prepared["source_inputs"].items():
    assert digest(sources[path]) == expected, path
fixture = (OUT / "homeEmptyAction.test.ts").read_bytes()
assert digest(fixture)["sha256"] == prepared["fixture"]["sha256"]
patch = (OUT / "unapplied.patch").read_bytes()
assert digest(patch)["sha256"] == prepared["unapplied_patch"]["sha256"]
for path, data in sources.items():
    dest = RUNTIME / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
(RUNTIME / "src/components/homeEmptyAction.test.ts").write_bytes(fixture)
(RUNTIME / "node_modules").symlink_to(DEPS.resolve(), target_is_directory=True)
receipt = {
    "unit": prepared["unit"], "main_sha": MAIN,
    "runtime_root": str(RUNTIME.relative_to(ROOT)),
    "source_files": {path: digest(data) for path, data in sources.items()},
    "fixture": digest(fixture), "patch": digest(patch),
    "reused_dependencies": actual_deps,
    "application_or_test_executed": False,
    "assigned_branch_unchanged": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
}
(OUT / "runtime-preparation.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
