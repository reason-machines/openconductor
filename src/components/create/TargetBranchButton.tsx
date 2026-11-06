import { useEffect, useRef, useState } from "react";
import type { BranchDto } from "../../workspace/api";
import type { SourceState } from "../../workspace/createFrom";
import { Tooltip } from "../Tooltip";
import { CheckIcon, ChevronsUpDownIcon, MoreIcon } from "../Icons";
import { LOAD_FAILED, LOADING_BRANCHES, NO_BRANCH, SEARCH_PLACEHOLDER, TARGET_BRANCH, branchDisplay, branchOptions } from "./targetBranch";
import "./create.css";

interface Props {
  value: string;
  defaultBranch: string;
  branches: SourceState<BranchDto>;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (branch: string) => void;
  onRetry: () => void;
}

/**
 * Conductor's `U4a`: a 28px ghost "…" button (aria-label and tooltip "Target
 * branch") that opens a popover with "Target branch" and the branch combobox
 * (`EJe`). Picking a branch closes both.
 */
export function TargetBranchButton({ value, defaultBranch, branches, disabled, invalid, onChange, onRetry }: Props) {
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  function close() {
    setOpen(false);
    setListOpen(false);
    setQuery("");
  }

  const items = branches.status === "ready" ? branches.items : [];
  const names = items.map((b) => b.name);
  const rows = branchOptions(names, value, query);

  return (
    <div
      ref={rootRef}
      className="create-branch"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        // Close the popover, not the create dialog around it.
        e.preventDefault();
        e.stopPropagation();
        if (listOpen) setListOpen(false);
        else close();
      }}
    >
      <Tooltip content={TARGET_BRANCH}>
        <button
          type="button"
          className="create-icon-btn"
          aria-label={TARGET_BRANCH}
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <MoreIcon size={12} />
        </button>
      </Tooltip>
      {open && (
        <div className="create-branch-pop" role="dialog" aria-label={TARGET_BRANCH}>
          <span className="create-branch-label">{TARGET_BRANCH}</span>
          <button type="button" role="combobox" aria-expanded={listOpen} className="create-branch-combo" autoFocus onClick={() => setListOpen(!listOpen)}>
            <span className="create-branch-value">{branchDisplay(value, items)}</span>
            <ChevronsUpDownIcon size={12} />
          </button>
          {listOpen && (
            <div className="create-branch-list">
              <input autoFocus placeholder={SEARCH_PLACEHOLDER} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={SEARCH_PLACEHOLDER} />
              {branches.status === "loading" ? (
                <p className="create-branch-status" role="status">{LOADING_BRANCHES}</p>
              ) : branches.status === "error" || branches.status === "unavailable" ? (
                <p className="create-branch-status">
                  {LOAD_FAILED}{" "}
                  <button type="button" className="btn btn-small" onClick={onRetry}>Try again</button>
                </p>
              ) : rows.length === 0 ? (
                <p className="create-branch-status">{NO_BRANCH}</p>
              ) : (
                <ul role="listbox" aria-label={TARGET_BRANCH}>
                  {rows.map((n) => (
                    <li key={n} role="option" aria-selected={n === value}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(n);
                          close();
                        }}
                      >
                        <span className="create-branch-tick" data-on={n === value || undefined}><CheckIcon size={16} /></span>
                        <span className="create-branch-name">{n}</span>
                        {n === defaultBranch && <span className="create-branch-default">default</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
