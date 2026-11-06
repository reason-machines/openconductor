import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Repo } from "../../state/types";
import { ChevronIcon } from "../Icons";
import { FILTER_BY_PROJECT, filterToValue, projectFilterOptions, valueToFilter, type RepoFilter } from "../../home/repoFilter";
import "../../home.css";

interface Props {
  repos: readonly Pick<Repo, "id" | "name">[];
  filter: RepoFilter;
  onChange: (next: RepoFilter) => void;
  /** Closes the surrounding menu; a choice closes it, as Conductor's radio items do (`closeOnClick`). */
  onClose?: () => void;
}

const CheckMark = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * "Filter by project" submenu for the sidebar section header menu (Conductor's
 * `pra`/`TEt`, renderApp-D_fmY7hW.js @10018210): a trigger row with a right
 * chevron that opens "All projects" and each repository as radio items, the
 * chosen one checked. Renders nothing with one repository or none.
 */
export function ProjectFilterSubmenu({ repos, filter, onChange, onClose }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const open = at !== null;
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The sidebar list scrolls (overflow clips sideways), so the popup is portaled to <body>
  // at the trigger's right edge. Its mousedown must not reach the parent menu's
  // outside-click listener on document, which would close the menu before the click lands.
  const setOpen = (next: boolean) => {
    const r = triggerRef.current?.getBoundingClientRect();
    setAt(next && r ? { x: r.right, y: r.top } : null);
  };
  // The popup starts at the trigger's right edge (over the menu's padding), so moving across
  // is continuous; a diagonal move can still clip the menu's corner, so leaving closes after
  // a short grace period that re-entering cancels.
  const leaveTimer = useRef<number | undefined>(undefined);
  const cancelLeave = () => window.clearTimeout(leaveTimer.current);
  useEffect(() => cancelLeave, []);
  useEffect(() => {
    const el = popupRef.current;
    if (!open || !el) return;
    const stop = (e: MouseEvent) => e.stopPropagation();
    el.addEventListener("mousedown", stop);
    return () => el.removeEventListener("mousedown", stop);
  }, [open]);
  const options = projectFilterOptions(repos);
  if (!options) return null;
  const selected = filterToValue(filter);

  const focusItem = (index: number) => {
    const items = popupRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
    if (!items?.length) return;
    items[(index + items.length) % items.length].focus();
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
    requestAnimationFrame(() => focusItem(Math.max(0, options.findIndex((o) => o.value === selected))));
  };

  const onPopupKey = (e: KeyboardEvent) => {
    const items = Array.from(popupRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      focusItem(at + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className="pf-sub" onMouseEnter={() => { cancelLeave(); if (!open) setOpen(true); }} onMouseLeave={() => { cancelLeave(); leaveTimer.current = window.setTimeout(() => setOpen(false), 150); }}>
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        className="sb-menu-item pf-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        data-open={open || undefined}
        onClick={() => setOpen(true)}
        onKeyDown={onTriggerKey}
      >
        <span>{FILTER_BY_PROJECT}</span>
        <ChevronIcon size={16} />
      </button>
      {at && createPortal(
        <div ref={popupRef} className="sb-menu pf-popup" role="menu" aria-label={FILTER_BY_PROJECT} style={{ position: "fixed", left: at.x, top: at.y - 5 }} onKeyDown={onPopupKey}>
          {options.map((o) => {
            const checked = o.value === selected;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                className="sb-menu-item pf-item"
                onClick={() => {
                  setOpen(false);
                  onChange(valueToFilter(o.value));
                  onClose?.();
                }}
              >
                <span className="pf-label" title={o.label}>{o.label}</span>
                <span className="pf-check">{checked && <CheckMark />}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
