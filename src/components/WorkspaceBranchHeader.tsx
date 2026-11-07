import { useMemo, useReducer, useRef, useState, type Dispatch } from "react";
import { markUserSetBranchName } from "../backend";
import { copyText } from "../features/openIn/apps";
import type { Action } from "../state/store";
import type { Workspace } from "../state/types";
import { renameWorkspaceBranch } from "../workspace/api";
import { BranchIcon } from "./Icons";
import { ContextMenu, MenuItem } from "./menu/ContextMenu";
import { CopyIcon, PencilIcon } from "./menu/menuIcons";
import { createBranchHeaderController } from "./workspaceBranchHeader";
import "./workspaceBranchHeader.css";

interface Props {
  repoId: string;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
  onError: (message: string) => void;
}

export function WorkspaceBranchHeader({ repoId, workspace, dispatch, onError }: Props) {
  const [, refresh] = useReducer((revision: number) => revision + 1, 0);
  const callbacks = useRef({ dispatch, onError });
  callbacks.current = { dispatch, onError };
  const { id, branch } = workspace;
  const controller = useMemo(() => createBranchHeaderController({
    repoId, workspace: { id, branch },
    renameBranch: renameWorkspaceBranch,
    markUserSetBranchName,
    copyText,
    dispatch: (action) => callbacks.current.dispatch(action),
    onError: (message) => callbacks.current.onError(message),
    onChange: refresh,
  }), [repoId, id, branch]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { editing, value, pending } = controller.state;

  function rename() {
    setMenu(null);
    controller.startEditing();
  }

  return (
    <>
      {editing ? (
        <span className="chip">
          <BranchIcon size={12} />
          <input
            className="ws-branch-input"
            aria-label="Branch name"
            value={value}
            disabled={pending}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{ width: `${Math.max(1, value.length)}ch` }}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => controller.change(event.currentTarget.value)}
            onBlur={() => void controller.blur()}
            onKeyDown={(event) => void controller.inputKey(event)}
          />
        </span>
      ) : (
        <button
          type="button"
          className="chip"
          aria-label="Rename branch"
          aria-disabled={!controller.canRename || pending}
          onClick={rename}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY });
          }}
        >
          <BranchIcon size={12} /> {branch}
        </button>
      )}
      {menu && (
        <ContextMenu
          at={menu}
          label="Branch actions"
          onClose={() => setMenu(null)}
          onKeyDown={(event) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            // Close before R focuses the inline editor; the old menu must not steal focus.
            if (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "r") {
              setMenu(null);
              void controller.menuKey(event);
            }
          }}
        >
          <MenuItem icon={<CopyIcon />} shortcut="C" disabled={!branch} onSelect={() => void controller.copy()}>Copy</MenuItem>
          <MenuItem icon={<PencilIcon />} shortcut="R" disabled={!controller.canRename || pending} onSelect={rename}>Rename</MenuItem>
        </ContextMenu>
      )}
    </>
  );
}
