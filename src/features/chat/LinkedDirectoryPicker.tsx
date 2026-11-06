import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ConductorIcon } from "../../components/ConductorIcon";
import { useDialogMotion } from "../../components/motion/dialogMotion";
import type { Repo } from "../../state/types";
import { linkedDirectoryGroups } from "./linkedDirectories.ts";
import { chooseLinkedDirectory, localLinkedDirectoryServices, type LinkedDirectoryServices } from "./linkedDirectoryApi.ts";
import "./linkedDirectoryPicker.css";

export interface LinkedDirectoryPickerProps {
  repos: readonly Repo[];
  repositoryId: string;
  excludedPaths?: readonly string[];
  onChoose: (path: string) => void;
  onClose: () => void;
  services?: LinkedDirectoryServices;
}

type SelectionState = { kind: "idle" } | { kind: "checking" } | { kind: "error"; message: string };
const NO_PATHS: readonly string[] = [];

// Lucide folder-symlink (ISC License, Lucide Authors).
function WorkspaceFolderIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 9.35V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7" /><path d="m8 16 3-3-3-3" />
  </svg>;
}

export function LinkedDirectoryPicker({ repos, repositoryId, excludedPaths = NO_PATHS, onChoose, onClose, services = localLinkedDirectoryServices }: LinkedDirectoryPickerProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(0);
  const [selection, setSelection] = useState<SelectionState>({ kind: "idle" });
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const request = useRef(0);
  const pending = useRef(false);
  const motion = useDialogMotion<HTMLDivElement>();
  const id = useId();
  const groups = useMemo(() => linkedDirectoryGroups({ repos, repositoryId, query, excludedPaths }), [repos, repositoryId, query, excludedPaths]);
  const rows = groups.flatMap((group) => group.workspaces);
  const activeIndex = Math.min(focused, rows.length);

  useEffect(() => {
    pending.current = false;
    setSelection({ kind: "idle" });
    return () => { request.current++; };
  }, [repositoryId, services]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-row-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function close() {
    request.current++;
    onClose();
  }

  async function choose(path?: string) {
    if (pending.current) return;
    pending.current = true;
    const revision = ++request.current;
    setSelection({ kind: "checking" });
    try {
      const chosen = await chooseLinkedDirectory({ path, excludedPaths, services });
      if (revision !== request.current) return;
      setSelection({ kind: "idle" });
      if (chosen !== null) onChoose(chosen);
      else input.current?.focus();
    } catch (error) {
      if (revision === request.current) {
        setSelection({ kind: "error", message: error instanceof Error ? error.message : String(error) });
        input.current?.focus();
      }
    } finally {
      if (revision === request.current) pending.current = false;
    }
  }

  function keyDown(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing || event.defaultPrevented) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setFocused((activeIndex + delta + rows.length + 1) % (rows.length + 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      void choose(activeIndex === 0 ? undefined : rows[activeIndex - 1]?.path);
    }
  }

  let index = 0;
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
      <Dialog.Portal>
        <div className="linked-directory-layer" ref={motion} data-dialog-motion="cmdk" data-dialog-id="linked-directory-picker">
          <Dialog.Backdrop className="linked-directory-backdrop" />
          <Dialog.Popup className="linked-directory-picker" initialFocus={input} finalFocus={returnFocus} aria-describedby={undefined} onKeyDown={keyDown}>
            <Dialog.Title className="linked-directory-title">Link workspaces</Dialog.Title>
            <input ref={input} className="linked-directory-search" placeholder="Search workspaces..." aria-label="Search workspaces" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-list`} aria-activedescendant={`${id}-${activeIndex}`} value={query} onChange={(event) => { setQuery(event.target.value); setFocused(0); }} />
            <div className="linked-directory-list" role="listbox" aria-label="Directories and workspaces" id={`${id}-list`} ref={list} aria-busy={selection.kind === "checking"}>
              <div role="group" aria-labelledby={`${id}-directories`}>
                <div className="linked-directory-heading" id={`${id}-directories`}>Directories</div>
                <div role="option" id={`${id}-0`} data-row-index={0} aria-selected={activeIndex === 0} aria-disabled={selection.kind === "checking"} className="linked-directory-row" onMouseMove={() => setFocused(0)} onMouseDown={(event) => event.preventDefault()} onClick={() => void choose()}>
                  <ConductorIcon name="folder-open" size={16} strokeWidth={1} />
                  <span>Browse...</span><span className="linked-directory-spacer" />
                  <span className="linked-directory-hint"><ConductorIcon name="corner-down-left" size={12} strokeWidth={1} /></span>
                </div>
              </div>
              {groups.map((group) => (
                <div role="group" aria-labelledby={`${id}-group-${group.id}`} key={group.id}>
                  <div className="linked-directory-heading" id={`${id}-group-${group.id}`}>{group.name}</div>
                  {group.workspaces.map((workspace) => {
                    const rowIndex = ++index;
                    return <div key={workspace.id} role="option" id={`${id}-${rowIndex}`} data-row-index={rowIndex} aria-selected={activeIndex === rowIndex} aria-disabled={selection.kind === "checking"} className="linked-directory-row" onMouseMove={() => setFocused(rowIndex)} onMouseDown={(event) => event.preventDefault()} onClick={() => void choose(workspace.path)}>
                      <WorkspaceFolderIcon />
                      <span className="linked-directory-label">{workspace.label}</span><span className="linked-directory-detail">{workspace.directoryName}</span><span className="linked-directory-spacer" />
                      <span className="linked-directory-hint">Link <ConductorIcon name="corner-down-left" size={12} strokeWidth={1} /></span>
                    </div>;
                  })}
                </div>
              ))}
            </div>
            {selection.kind === "error" ? <div className="linked-directory-status" role="alert">{selection.message}</div> : null}
            {selection.kind === "checking" ? <div className="linked-directory-status" role="status">Checking directory...</div> : null}
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
