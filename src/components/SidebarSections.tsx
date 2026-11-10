import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronIcon } from "./Icons";
import { DROP_ATTR } from "../state/navigationSections";

// Sidebar groups above and beside the repository list. Conductor renders its
// "Pinned" group (and user sections) with the same header as "My workspaces":
// text-xs font-semibold muted/70 label, a count when collapsed, hover chevron
// (renderApp chunk near "Pinned", REA-extracted, read as data).

interface GroupProps {
  label: string;
  count: number;
  children: ReactNode;
  collapsed: boolean;
  onToggle(): void;
  /** Pinned takes dropped rows (Conductor's `data-workspace-pinned-drop`). */
  pinnedDropZone?: boolean;
  /** A dragged row is over the group: accent fill. */
  isDropTarget?: boolean;
}

export function SidebarGroup({ label, count, children, collapsed, onToggle, pinnedDropZone, isDropTarget }: GroupProps) {
  return (
    <div className="sb-group" data-group={label} data-drop-target={isDropTarget || undefined} {...(pinnedDropZone ? { [DROP_ATTR.pinned]: "" } : {})}>
      <div className="sb-section-header">
        <button type="button" className="sb-section-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          <span className="sb-section-label">{label}</span>
          {collapsed && <span className="sb-group-count">{count}</span>}
          <span className="sb-section-chevron" data-collapsed={collapsed || undefined}>
            {collapsed ? <ChevronIcon size={12} /> : <ChevronDownIcon size={12} />}
          </span>
        </button>
      </div>
      {!collapsed && <div className="sb-ws-list sb-group-list">{children}</div>}
    </div>
  );
}
