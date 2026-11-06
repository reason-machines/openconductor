import { useRef, useState } from "react";
import type { Repo } from "../../state/types";
import { DropdownMenu, MenuItem, MenuSeparator } from "../menu/ContextMenu";
import type { Rect } from "../menu/dropdownPlacement";
import { SidebarAddRepositoryMenu, type AddRepositoryActions } from "../AddRepositoryMenu";
import { RepoIcon } from "../RepoIcon";
import { Tooltip } from "../Tooltip";
import { CheckIcon, ChevronDownIcon, FolderPlusIcon } from "../Icons";
import "./create.css";

/** Conductor's trigger placeholder and its last item (`ZQo`, renderApp-D_fmY7hW.js @9,749,750, read as data). */
export const SELECT_REPO = "Select repo";
export const ADD_PROJECT = "Add project";

interface Props {
  repos: Repo[];
  value: string | null;
  disabled?: boolean;
  invalid?: boolean;
  /** `workspace.create` shortcut glyphs for the "Switch repo" tooltip. */
  shortcut?: string;
  onChange: (repoId: string) => void;
  /** "Add project" opens the sidebar's add menu (`Gji`) under the trigger. */
  addActions: AddRepositoryActions;
}

type Open = "closed" | "list" | "add";

/**
 * The create composer's repository picker (Conductor's `ZQo`): a borderless
 * trigger with the repo's avatar and name, or "Select repo"; tooltip "Switch
 * repo ⌘N". Its list holds every repository, a separator and "Add project",
 * which opens the same add menu as the sidebar, 320px wide under the trigger.
 */
export function RepoSelect({ repos, value, disabled, invalid, shortcut, onChange, addActions }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<Open>("closed");
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const selected = repos.find((r) => r.id === value);

  function openList() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    setOpen("list");
  }

  return (
    <>
      <Tooltip content="Switch repo" shortcut={shortcut}>
        <button
          ref={triggerRef}
          type="button"
          className="create-repo-trigger"
          aria-haspopup="listbox"
          aria-expanded={open !== "closed"}
          aria-invalid={invalid || undefined}
          data-popup-open={open !== "closed" || undefined}
          disabled={disabled}
          onClick={() => (open === "closed" ? openList() : setOpen("closed"))}
        >
          {selected ? (
            <span className="create-repo-value">
              <RepoIcon repo={selected} className="create-repo-initial" />
              <span className="create-repo-name">{selected.name}</span>
            </span>
          ) : (
            <span className="create-repo-value create-repo-placeholder">{SELECT_REPO}</span>
          )}
          <ChevronDownIcon size={14} />
        </button>
      </Tooltip>
      {open === "list" && anchor && (
        <DropdownMenu
          anchor={anchor}
          label={SELECT_REPO}
          className="create-repo-menu"
          onClose={() => setOpen((o) => (o === "list" ? "closed" : o))}
          // The menu is portalled, but React still bubbles its keys to the create dialog: keep Escape to the menu.
          onKeyDown={(e) => e.key === "Escape" && e.preventDefault()}
        >
          {repos.map((r) => (
            <MenuItem key={r.id} checked={r.id === value} trailing={r.id === value ? <span className="create-repo-check"><CheckIcon size={16} /></span> : undefined} onSelect={() => onChange(r.id)}>
              <span className="create-repo-option">
                <RepoIcon repo={r} className="create-repo-initial" />
                <span className="create-repo-name">{r.name}</span>
              </span>
            </MenuItem>
          ))}
          {repos.length > 0 && <MenuSeparator />}
          <MenuItem onSelect={() => requestAnimationFrame(() => setOpen("add"))}>
            <span className="create-repo-option create-repo-add">
              <FolderPlusIcon size={14} />
              <span>{ADD_PROJECT}</span>
            </span>
          </MenuItem>
        </DropdownMenu>
      )}
      <SidebarAddRepositoryMenu
        open={open === "add"}
        onOpenChange={(o) => setOpen(o ? "add" : "closed")}
        anchorRef={triggerRef}
        align="start"
        repos={repos}
        {...addActions}
      />
    </>
  );
}
