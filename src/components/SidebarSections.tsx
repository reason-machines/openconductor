import { useState, type ReactNode } from "react";
import { ChevronDownIcon, ChevronIcon } from "./Icons";

// Sidebar groups above and beside the repository list. Conductor renders its
// "Pinned" group (and user sections) with the same header as "My workspaces":
// text-xs font-semibold muted/70 label, a count when collapsed, hover chevron
// (renderApp chunk near "Pinned", REA-extracted, read as data).

interface GroupProps {
  label: string;
  count: number;
  children: ReactNode;
}

export function SidebarGroup({ label, count, children }: GroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="sb-group" data-group={label}>
      <div className="sb-section-header">
        <button type="button" className="sb-section-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
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
