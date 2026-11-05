// parity:diff.discard:ui parity:diff.changes-list:ui
// Right-click menu on a changed file in the changes list.
//
// Conductor's file context menu (renderApp `Svs`, read with REA on sven m5 max
// as data), in order: View, Attach in chat, Open in ▸ (external apps), Copy
// path (absolute), Copy relative path (only with a workspace path), then a
// separator and Discard changes (only for a file with changes; it opens the
// same confirmation, in the "All changes" view).
// Not built here: Attach in chat (no command reads a worktree file for the
// composer yet) and Open in (no external-app launcher yet).
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface FileMenuActions {
  view: () => void;
  /** Absolute path; absent while the workspace has no worktree on disk. */
  copyPath?: () => void;
  copyRelativePath: () => void;
  discard: () => void;
}

interface Props {
  path: string;
  at: { x: number; y: number };
  actions: FileMenuActions;
  onClose: () => void;
}

export function FileContextMenu({ path, at, actions, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
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
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
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
  }, [onClose]);

  return (
    <div ref={ref} className="sb-ctx-menu" role="menu" aria-label={`Actions for ${path}`} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <button type="button" role="menuitem" className="sb-ctx-item" onClick={run(actions.view)}>
        <span className="sb-ctx-label">View</span>
      </button>
      {actions.copyPath && (
        <button type="button" role="menuitem" className="sb-ctx-item" onClick={run(actions.copyPath)}>
          <span className="sb-ctx-label">Copy path</span>
        </button>
      )}
      <button type="button" role="menuitem" className="sb-ctx-item" onClick={run(actions.copyRelativePath)}>
        <span className="sb-ctx-label">Copy relative path</span>
      </button>
      <div className="sb-ctx-sep" role="separator" />
      <button type="button" role="menuitem" className="sb-ctx-item" onClick={run(actions.discard)}>
        <span className="sb-ctx-label">Discard changes</span>
      </button>
    </div>
  );
}
