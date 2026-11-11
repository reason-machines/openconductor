import type { Action } from "../state/store";
import type { Workspace } from "../state/types";
import { canRenameBranch } from "../state/workspaceRename.ts";

type KeyEvent = { key: string; preventDefault(): void; stopPropagation(): void };

interface Dependencies {
  repoId: string;
  workspace: Pick<Workspace, "id" | "branch" | "status">;
  renameBranch(workspaceId: string, branch: string): Promise<void>;
  markUserSetBranchName(workspaceId: string): Promise<void>;
  dispatch(action: Action): void;
  copyText(text: string): Promise<void>;
  onError(message: string): void;
  onChange(): void;
}

// REA renderApp bro / index h8=pOe: branch editing preserves case, slashes and dots.
export function sanitizeHeaderBranch(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_./]+/g, "-");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createBranchHeaderController(deps: Dependencies) {
  const { repoId, workspace: { id, branch, status } } = deps;
  const archived = status === "archived";
  const canRename = !archived && canRenameBranch(branch);
  const state = { editing: false, value: branch, pending: false };

  function startEditing() {
    if (!canRename || state.pending) return;
    state.value = branch;
    state.editing = true;
    deps.onChange();
  }

  function change(value: string) {
    if (!state.editing || state.pending) return;
    state.value = sanitizeHeaderBranch(value);
    deps.onChange();
  }

  async function submit() {
    if (!canRename || !state.editing || !state.value || state.pending) return;
    const next = sanitizeHeaderBranch(state.value);
    if (next === branch) {
      state.editing = false;
      deps.onChange();
      return;
    }
    state.pending = true;
    state.editing = false;
    deps.onChange();
    try {
      await deps.renameBranch(id, next);
      deps.dispatch({ type: "renameWorkspace", repoId, workspaceId: id, branch: next, userSet: true });
      try {
        await deps.markUserSetBranchName(id);
      } catch (error) {
        deps.onError(`Branch renamed, but failed to save branch-name preference: ${errorText(error)}`);
      }
    } catch (error) {
      const message = errorText(error);
      deps.onError(message.includes("cannot rename the current branch while not on any")
        ? "Please check out a branch before renaming"
        : `Failed to rename branch: ${message}`);
    } finally {
      state.pending = false;
      state.editing = false;
      deps.onChange();
    }
  }

  async function inputKey(event: KeyEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      state.editing = false;
      deps.onChange();
    } else if (event.key === "Enter") {
      event.preventDefault();
      await submit();
    }
  }

  async function copy() {
    if (archived || !branch) return;
    try {
      await deps.copyText(branch);
    } catch {
      deps.onError("Failed to copy to clipboard");
    }
  }

  async function menuKey(event: KeyEvent): Promise<boolean> {
    const key = event.key.toLowerCase();
    if (key !== "c" && key !== "r") return false;
    event.preventDefault();
    if (key === "c") await copy();
    else startEditing();
    return true;
  }

  return { state, canRename, startEditing, change, blur: submit, inputKey, copy, menuKey };
}
