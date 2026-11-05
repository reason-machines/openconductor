import { useRef, useState, type KeyboardEvent } from "react";
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
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
    <div className="pf-sub" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
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
      {open && (
        <div ref={popupRef} className="sb-menu pf-popup" role="menu" aria-label={FILTER_BY_PROJECT} onKeyDown={onPopupKey}>
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
        </div>
      )}
    </div>
  );
}
