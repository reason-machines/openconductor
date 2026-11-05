import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Workspace } from "../state/types";
import type { NavSection } from "../state/navigationSections";
import { WORKSPACE_STATUSES, effectiveStatus, statusLabel, type WorkspaceStatusValue } from "../state/workspaceStatus";
import { ChevronIcon } from "./Icons";
import { isWorkspaceUnread } from "../state/chatUnread";

// Conductor's workspace row menu (`D9e` -> `Aao` in the renderApp chunk,
// REA-extracted and read as data), opened by right-clicking a sidebar row.
// Local-workspace items, in order: Mark as read / Mark as unread (R),
// Pin / Unpin (P), Set status ▸, Move to section ▸, Rename, Copy link (⌘⇧C),
// separator, Archive (⌘⇧A, shown on the selected row) / Unarchive.
// R and P act on the row while the menu is open
// (workspace.contextMenu.toggleRead / togglePin).
// Move to section ▸ (Conductor's `Xoo` / `Joo`): every section (emoji, name,
// a check on the current one, which is disabled), a separator when there are
// sections, "New section…" (creates one holding this workspace) and
// "Remove from section" when it is in one.
// Copy link (`XV`) copies openconductor://workspace?id=<id> (src/workspace/link.ts);
// its ⌘⇧C hint shows only on the open workspace's row (`de = NCi(n)`).

export interface WorkspaceActions {
  toggleRead: () => void;
  togglePin: () => void;
  setStatus: (status: WorkspaceStatusValue) => void;
  /** Absent until the rename dialog exists; the item is hidden. */
  rename?: () => void;
  /** Absent when nobody handles it; the item is hidden. */
  copyLink?: () => void;
  archive: () => void;
  moveToSection: (sectionId: string) => void;
  /** Opens the New section dialog with this workspace to move. */
  newSection: () => void;
  removeFromSection: () => void;
}

interface Props {
  workspace: Workspace;
  /** Row is the selected workspace: Conductor shows the ⌘⇧A hint only then. */
  selected: boolean;
  /** Viewport point the menu opens at (the right-click position). */
  at: { x: number; y: number };
  actions: WorkspaceActions;
  /** The user's sections, in sidebar order. */
  sections: readonly NavSection[];
  /** Section that holds this workspace, if any. */
  currentSectionId?: string;
  onClose: () => void;
}

export function WorkspaceActionsMenu({ workspace, selected, at, actions, sections, currentSectionId, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const [sub, setSub] = useState<"status" | "section" | null>(null);
  const statusOpen = sub === "status";
  const sectionOpen = sub === "section";
  const setStatusOpen = (open: boolean) => setSub(open ? "status" : null);
  const setSectionOpen = (open: boolean) => setSub(open ? "section" : null);
  const current = effectiveStatus(workspace);
  const pinned = typeof workspace.pinnedAt === "number";

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4)) });
  }, [at]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "escape") {
        e.preventDefault();
        onClose();
      } else if (key === "r") {
        e.preventDefault();
        run(actions.toggleRead)();
      } else if (key === "p") {
        e.preventDefault();
        run(actions.togglePin)();
      } else if (key === "arrowdown" || key === "arrowup") {
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = items[(i + (key === "arrowdown" ? 1 : -1) + items.length) % items.length];
        next?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onClose);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ref} className="sb-ctx-menu" role="menu" aria-label="Workspace actions" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <button type="button" role="menuitem" className="sb-ctx-item" onClick={run(actions.toggleRead)}>
        <span className="sb-ctx-label">{isWorkspaceUnread(workspace) ? "Mark as read" : "Mark as unread"}</span>
        <kbd className="sb-ctx-kbd">R</kbd>
      </button>
      <button type="button" role="menuitem" className="sb-ctx-item" onClick={run(actions.togglePin)}>
        <span className="sb-ctx-label">{pinned ? "Unpin" : "Pin"}</span>
        <kbd className="sb-ctx-kbd">P</kbd>
      </button>
      <div className="sb-ctx-sub" onMouseEnter={() => setStatusOpen(true)} onMouseLeave={() => setStatusOpen(false)}>
        <button
          type="button"
          role="menuitem"
          className="sb-ctx-item"
          aria-haspopup="menu"
          aria-expanded={statusOpen}
          onClick={() => setStatusOpen(!statusOpen)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              setStatusOpen(true);
            }
          }}
        >
          <span className="sb-ctx-label">Set status</span>
          <ChevronIcon size={14} />
        </button>
        {statusOpen && (
          <div className="sb-ctx-menu sb-ctx-submenu" role="menu" aria-label="Set status">
            {WORKSPACE_STATUSES.map((s) => (
              <button key={s} type="button" role="menuitemradio" aria-checked={s === current} className="sb-ctx-item" onClick={run(() => actions.setStatus(s))}>
                <span className={`sb-status-dot status-${s}`} aria-hidden />
                <span className="sb-ctx-label">{statusLabel(s)}</span>
                {s === current && <span className="sb-ctx-check" aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="sb-ctx-sub" onMouseEnter={() => setSectionOpen(true)} onMouseLeave={() => setSectionOpen(false)}>
        <button
          type="button"
          role="menuitem"
          className="sb-ctx-item"
          aria-haspopup="menu"
          aria-expanded={sectionOpen}
          onClick={() => setSectionOpen(!sectionOpen)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              setSectionOpen(true);
            }
          }}
        >
          <span className="sb-ctx-label">Move to section</span>
          <ChevronIcon size={14} />
        </button>
        {sectionOpen && (
          <div className="sb-ctx-menu sb-ctx-submenu" role="menu" aria-label="Move to section">
            {sections.map((section) => {
              const current = section.id === currentSectionId;
              return (
                <button key={section.id} type="button" role="menuitemradio" aria-checked={current} disabled={current} className="sb-ctx-item" onClick={run(() => actions.moveToSection(section.id))}>
                  {section.emoji !== undefined && <span className="sb-section-emoji" aria-hidden>{section.emoji}</span>}
                  <span className="sb-ctx-label">{section.name}</span>
                  {current && <span className="sb-ctx-check" aria-hidden>✓</span>}
                </button>
              );
            })}
            {sections.length > 0 && <div className="sb-ctx-sep" role="separator" />}
            <button type="button" role="menuitem" className="sb-ctx-item" onClick={run(actions.newSection)}>
              <span className="sb-ctx-label">New section…</span>
            </button>
            {currentSectionId !== undefined && (
              <button type="button" role="menuitem" className="sb-ctx-item" onClick={run(actions.removeFromSection)}>
                <span className="sb-ctx-label">Remove from section</span>
              </button>
            )}
          </div>
        )}
      </div>
      {actions.rename && (
        <button type="button" role="menuitem" className="sb-ctx-item" onClick={run(actions.rename)}>
          <span className="sb-ctx-label">Rename</span>
        </button>
      )}
      {actions.copyLink && (
        <button type="button" role="menuitem" className="sb-ctx-item" onClick={run(actions.copyLink)}>
          <span className="sb-ctx-label">Copy link</span>
          {selected && <kbd className="sb-ctx-kbd">⌘⇧C</kbd>}
        </button>
      )}
      <div className="sb-ctx-sep" role="separator" />
      <button type="button" role="menuitem" className="sb-ctx-item" onClick={run(actions.archive)}>
        <span className="sb-ctx-label">Archive</span>
        {selected && <kbd className="sb-ctx-kbd">⌘⇧A</kbd>}
      </button>
    </div>
  );
}
