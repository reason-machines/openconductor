#!/usr/bin/env python3
"""Check the candidate's source boundaries. This does not execute the app."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
BASE = "2b079f13e07b580d26191f7f1f50b4d21e62174e"
COMPARE_BASE = BASE


def read(path):
    return (ROOT / path).read_text()


def baseline(path):
    return subprocess.check_output(["git", "show", f"{COMPARE_BASE}:{path}"], cwd=ROOT).decode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def compact(source):
    return re.sub(r"\s+", "", re.sub(r"//[^\n]*", "", source))


def verify():
    source = json.loads((HERE / "reference.json").read_bytes())
    for span in source["reference"]["context_binding_chain"].values():
        raw = span["source"].encode()
        assert digest(raw) == span["sha256"], span["symbol"]
        assert len(raw) == span["utf8_span"][1] - span["utf8_span"][0], span["symbol"]
    fixture = ROOT / "tests/e2e/workspace-header-menu-cases.mjs"
    assert digest(fixture.read_bytes()) == source["fixture"]["sha256"]
    assert len(source["case_ids"]) == 8

    path = "src/components/SidebarWorkspaceRow.tsx"
    old, new = baseline(path), read(path)
    shared = read("src/components/WorkspaceContextMenu.tsx")
    before = old.split("        actions={{", 1)[1].split("\n        }}", 1)[0]
    after = shared.split("      actions={{", 1)[1].split("\n      }}", 1)[0]
    before = before.replace("repo.id", "repoId").replace(
        "archive: () => archive(repoId, ws),",
        'archive: () => onArchive ? onArchive(repoId, ws) : dispatch({ type: "archiveWorkspace", ...ids }),',
    )
    assert compact(before) == compact(after), "workspace actions changed during extraction"
    assert 'const ids = { repoId, workspaceId: ws.id };' in shared
    assert 'onArchive ? onArchive(repoId, ws) : dispatch({ type: "archiveWorkspace", repoId, workspaceId: ws.id })' in old
    for begin, end in [
        ("export function SidebarWorkspaceRow", "export interface RowCallbacks"),
        ("export function useShortcutHints", "type MenuTarget"),
        ("  const rowProps =", "  let element:"),
    ]:
        assert old.split(begin)[1].split(end)[0] == new.split(begin)[1].split(end)[0], begin
    assert 'currentSectionId={sectionOf(sections, ws.id)?.id}' in shared
    assert read("src/components/WorkspaceActionsMenu.tsx") == baseline("src/components/WorkspaceActionsMenu.tsx")

    path = "src/App.tsx"
    expected = baseline(path).replace(
        '          <WorkspaceView\n            repo={repo}\n            workspace={workspace}\n            dispatch={dispatch}',
        '          <WorkspaceView\n            repo={repo}\n            workspace={workspace}\n            sections={state.sections ?? []}\n            onNewSection={(ws) => setSectionDialog({ mode: "create", workspaceIdToMove: ws.id })}\n            dispatch={dispatch}',
    )
    assert read(path) == expected, "App changed outside WorkspaceView props"

    path = "src/components/WorkspaceView.tsx"
    expected = baseline(path)
    expected = expected.replace(
        'import { WorkspaceBranchHeader } from "./WorkspaceBranchHeader";',
        'import { WorkspaceBranchHeader } from "./WorkspaceBranchHeader";\nimport { WorkspaceNameHeader } from "./WorkspaceNameHeader";\nimport type { NavSection } from "../state/navigationSections";',
    ).replace(
        "// In the desktop app the workspace's own chat runs the agent picked in the",
        'interface WorkspaceViewProps extends Props {\n  sections: readonly NavSection[];\n  onNewSection: (workspace: Workspace) => void;\n}\n\n// In the desktop app the workspace\'s own chat runs the agent picked in the',
    ).replace(
        'export function WorkspaceView({ repo, workspace, dispatch, notify, onNextUnread, hasNextUnread }: Props) {',
        'export function WorkspaceView({ repo, workspace, sections, dispatch, notify, onNewSection, onNextUnread, hasNextUnread }: WorkspaceViewProps) {',
    ).replace(
        '          <strong>{workspace.name}</strong>',
        '''          <WorkspaceNameHeader
            key={workspace.id}
            repoId={repo.id}
            workspace={workspace}
            sections={sections}
            dispatch={dispatch}
            onNewSection={onNewSection}
            onCopyLink={(ws) => void copyWorkspaceLink(ws.id).then(({ kind, message }) => notify?.(kind, message))}
            onError={(message) => notify?.("error", message)}
          />''',
    )
    assert read(path) == expected, "WorkspaceView changed outside name and props"
    header = read("src/components/WorkspaceNameHeader.tsx")
    assert 'onContextMenu=' in header and 'onClick=' not in header
    assert 'event.preventDefault();' in header
    assert 'setMenu({ x: event.clientX, y: event.clientY });' in header
    assert '<WorkspaceContextMenu' in header and '<RenameWorkspaceDialog' in header
    for path in source["unchanged_paths"]:
        assert read(path) == baseline(path), path
    changed = subprocess.check_output(["git", "diff", "--name-only", COMPARE_BASE, "--", "src"], cwd=ROOT).decode().splitlines()
    assert set(changed) <= set(source["product_paths"]), changed
    return {
        "base": COMPARE_BASE,
        "retained_reference_base": BASE,
        "source_checks": "PASS",
        "retained_reference_spans": 6,
        "fixture_sha256": digest(fixture.read_bytes()),
        "actions": "normalized extracted callbacks match baseline",
        "scope": "App and WorkspaceView exact replacements; other owners unchanged",
        "runtime": "NOT RUN",
        "behavioral_red_green": "NOT OBSERVED",
        "typecheck_build_browser_native": "NOT RUN",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=BASE)
    args = parser.parse_args()
    COMPARE_BASE = subprocess.check_output(
        ["git", "rev-parse", "--verify", f"{args.base}^{{commit}}"], cwd=ROOT,
    ).decode().strip()
    print(json.dumps(verify(), indent=2))
