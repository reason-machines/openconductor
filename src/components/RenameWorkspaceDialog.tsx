import { useState, type Dispatch, type KeyboardEvent } from "react";
import type { Action } from "../state/store";
import type { Workspace } from "../state/types";
import { markUserSetBranchName, renameWorkspaceRecord } from "../backend";
import { renameWorkspaceBranch } from "../workspace/api";
import { ALSO_RENAME_BRANCH_KEY, canRenameBranch, planRename, renameDefault, renamedBranch } from "../state/workspaceRename";
import { FolderIcon } from "./Icons";

interface Props {
  repoId: string;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
  onClose: () => void;
  onError: (message: string) => void;
}

function readAlsoRenameBranch(): boolean {
  try {
    return localStorage.getItem(ALSO_RENAME_BRANCH_KEY) === "true";
  } catch {
    return false;
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Conductor's branch-rename error toast (`wNt`). */
function branchRenameError(e: unknown): string {
  const message = errorText(e);
  if (message.includes("cannot rename the current branch while not on any")) return "Please check out a branch before renaming";
  return `Failed to rename branch: ${message}`;
}

/**
 * "Rename workspace" (Conductor's `Sya`, decoded renderApp-D_fmY7hW.js @11007679): one text field
 * that starts as the stored name (else the directory name) and selects itself on focus, an
 * "Also rename branch" checkbox remembered across renames, Cancel and OK. Enter submits; an empty
 * or unchanged name just closes.
 */
export function RenameWorkspaceDialog({ repoId, workspace: ws, dispatch, onClose, onError }: Props) {
  const directoryName = ws.directoryName ?? ws.name;
  const target = { directoryName, workspaceName: ws.name === directoryName ? null : ws.name };
  const initial = renameDefault(target);
  const [value, setValue] = useState(initial);
  const [alsoRenameBranch, setAlsoRenameBranch] = useState(readAlsoRenameBranch);
  const [pending, setPending] = useState(false);
  const branchRenamable = canRenameBranch(ws.branch);

  function toggleBranch(checked: boolean) {
    setAlsoRenameBranch(checked);
    try {
      localStorage.setItem(ALSO_RENAME_BRANCH_KEY, String(checked));
    } catch {
      /* preference only */
    }
  }

  async function submit() {
    if (pending) return;
    const name = value.trim();
    if (!name || name === initial) return onClose();
    const plan = planRename(target, name);
    if (plan.kind === "unchanged") return onClose();
    if (plan.kind === "invalid") {
      onError(`Failed to rename workspace: ${plan.message}`);
      return onClose();
    }
    setPending(true);
    const ids = { repoId, workspaceId: ws.id };
    try {
      await renameWorkspaceRecord(ws.id, plan.newDirectoryName, plan.workspaceName);
    } catch (e) {
      onError(`Failed to rename workspace: ${errorText(e)}`);
      return onClose();
    }
    dispatch({ type: "renameWorkspace", ...ids, name, userSet: true, keepPlaceholder: true });
    if (alsoRenameBranch && branchRenamable) {
      const branch = renamedBranch(ws.branch, name);
      try {
        await renameWorkspaceBranch(ws.id, branch);
        await markUserSetBranchName(ws.id);
        dispatch({ type: "renameWorkspace", ...ids, branch, userSet: true });
      } catch (e) {
        onError(branchRenameError(e));
      }
    }
    onClose();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal rename-ws-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-ws-title"
        aria-describedby="rename-ws-desc"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <h2 id="rename-ws-title" className="rename-ws-title">
          <FolderIcon size={20} />
          Rename workspace
        </h2>
        <p id="rename-ws-desc" className="sr-only">Enter a new name for this workspace</p>
        <input
          className="rename-ws-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={onKeyDown}
          autoFocus
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <label className="rename-ws-branch">
          <input type="checkbox" checked={alsoRenameBranch} disabled={!branchRenamable || pending} onChange={(e) => toggleBranch(e.target.checked)} />
          Also rename branch
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" data-primary-action onClick={() => void submit()} disabled={pending}>
            {pending ? "Renaming..." : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
