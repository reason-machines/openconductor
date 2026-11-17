import { useLayoutEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { KeybindingScope } from "../../keybindings/KeybindingsProvider";
import { useBoolPref } from "../../settings/useBoolPref";
import { activeCenterTab, centerPanes, createCenterPanelController, reconcileCenterLayout, type CenterGroup, type CenterLayout, type LayoutStorage } from "./centerPanelLayout.ts";
import "./centerPanelGroups.css";

function paneStorage(): LayoutStorage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}

/** The existing table-backed toggle remains the sole admission to grouped rendering/writes. */
export function useCenterPanelLayout(workspaceId: string, tabs: readonly string[], selectedTab: string, onSelect: (tab: string) => void) {
  const enabled = useBoolPref("experimental_configurable_center_panel");
  const controller = useMemo(() => createCenterPanelController({ workspaceId, tabs, selectedTab, enabled, storage: paneStorage() }), [workspaceId]);
  controller.setEnabled(enabled);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const signature = JSON.stringify(tabs);
  const layout = useMemo(() => reconcileCenterLayout(snapshot, tabs), [snapshot, signature]);
  const previous = useRef<{ controller: typeof controller; enabled: boolean; selectedTab: string } | null>(null);
  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = { controller, enabled, selectedTab };
    if (!enabled) return;
    controller.reconcile(tabs);
    // A fresh/reenabled workspace restores its group selection. Later external opens select
    // the existing tab's group; reconciliation puts a genuinely new tab in the active group.
    if (last?.controller === controller && last.enabled && last.selectedTab !== selectedTab) controller.selectTab(selectedTab);
    const active = activeCenterTab(controller.snapshot());
    if (active && active !== selectedTab) onSelect(active);
  }, [controller, enabled, signature, selectedTab, onSelect]);
  return {
    enabled, layout,
    split: controller.split,
    select(groupId: string, tab: string) {
      controller.activateGroup(groupId);
      controller.selectTab(tab);
      const active = activeCenterTab(controller.snapshot());
      if (active) onSelect(active);
    },
    activate(groupId: string) {
      controller.activateGroup(groupId);
      const active = activeCenterTab(controller.snapshot());
      if (active) onSelect(active);
    },
  };
}

interface Props {
  layout: CenterLayout;
  onActivate: (groupId: string) => void;
  renderTabs: (group: CenterGroup) => ReactNode;
  renderContent: (tab: string, focused: boolean) => ReactNode;
}

export function CenterPanelGroups({ layout, onActivate, renderTabs, renderContent }: Props) {
  const panes = centerPanes(layout);
  const geometry = (pane: typeof panes[number]): CSSProperties => ({ left: `${pane.left}%`, top: `${pane.top}%`, width: `${pane.width}%`, height: `${pane.height}%` });
  return (
    <div className="center-panel-groups" aria-label="Workspace split panes">
      {panes.map((pane) => (
        <div key={pane.group.id} className="center-panel-group" style={geometry(pane)} data-active={pane.group.id === layout.activeGroupId || undefined} onPointerDownCapture={() => onActivate(pane.group.id)}>
          {renderTabs(pane.group)}
        </div>
      ))}
      {/* Content is keyed by TAB at one stable parent, not nested under its current group.
          A split moves the existing mounted content instead of cloning/restarting it. */}
      {panes.flatMap((pane) => pane.group.tabs.map((tab) => {
        const visible = tab === pane.group.activeTab;
        const focused = visible && pane.group.id === layout.activeGroupId;
        return (
          <div key={tab} className="center-panel-content" hidden={!visible} data-center-tab={tab} style={{ ...geometry(pane), top: `calc(${pane.top}% + var(--center-tab-strip-height))`, height: `calc(${pane.height}% - var(--center-tab-strip-height))` }} onPointerDownCapture={() => onActivate(pane.group.id)} onFocusCapture={() => onActivate(pane.group.id)}>
            <KeybindingScope focused={focused}>{renderContent(tab, focused)}</KeybindingScope>
          </div>
        );
      }))}
    </div>
  );
}
