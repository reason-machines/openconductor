import type { Dispatch } from "react";
import type { Action } from "../state/store";
import type { AppState } from "../state/types";
import { isStatusGroupCollapsed, statusGroupEntries, type SidebarEntry } from "../state/sidebarOrder";
import { statusLabel } from "../state/workspaceStatus";
import { ChevronDownIcon, ChevronIcon } from "./Icons";
import { WorkspaceStatusGlyph } from "./menu/menuIcons";
import { SidebarPresence } from "./sidebarMotion";
import "./sidebarStatusGroups.css";

export function SidebarStatusGroups({ state, dispatch, renderRow }: {
  state: AppState;
  dispatch: Dispatch<Action>;
  renderRow: (entry: SidebarEntry, index: number) => JSX.Element;
}) {
  return (
    <div className="sb-status-groups">
      {statusGroupEntries(state).map((group) => {
        const collapsed = isStatusGroupCollapsed(state, group);
        return (
          <div key={group.status} className="sb-status-group" data-status-group={group.status}>
            <button type="button" className="sb-status-header" aria-expanded={!collapsed} onClick={() => dispatch({ type: "setStatusGroupCollapsed", status: group.status, collapsed: !collapsed })}>
              <span className="sb-status-glyph"><WorkspaceStatusGlyph status={group.status} /></span>
              <span className="sb-status-label">{statusLabel(group.status)}</span>
              {collapsed && group.entries.length > 0 && <span className="sb-status-count">{group.entries.length}</span>}
              <span className="sb-status-chevron" aria-hidden>{collapsed ? <ChevronIcon size={12} /> : <ChevronDownIcon size={12} />}</span>
            </button>
            {!collapsed && <div className="sb-ws-list"><SidebarPresence>{group.entries.map(renderRow)}</SidebarPresence></div>}
          </div>
        );
      })}
    </div>
  );
}
