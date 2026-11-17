/** Center-pane identities and transitions. Moving a tab never creates a chat or terminal. */
export interface CenterGroup {
  type: "group";
  id: string;
  tabs: string[];
  activeTab: string;
}
export interface CenterSplit {
  type: "split";
  orientation: "horizontal" | "vertical";
  firstSize: number;
  first: CenterNode;
  second: CenterNode;
}
export type CenterNode = CenterGroup | CenterSplit;
export interface CenterLayout { root: CenterNode | null; activeGroupId: string | null }
export interface LayoutStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const CENTER_LAYOUT_KEY = "openconductor.workspace-center-panel-layout-v1";
const EMPTY: CenterLayout = { root: null, activeGroupId: null };

export function centerGroups(node: CenterNode | null): CenterGroup[] {
  return !node ? [] : node.type === "group" ? [node] : [...centerGroups(node.first), ...centerGroups(node.second)];
}
function replaceGroup(node: CenterNode, id: string, update: (group: CenterGroup) => CenterNode): CenterNode {
  if (node.type === "group") return node.id === id ? update(node) : node;
  const first = replaceGroup(node.first, id, update), second = replaceGroup(node.second, id, update);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}
export function activeCenterTab(layout: CenterLayout): string | undefined {
  return centerGroups(layout.root).find((group) => group.id === layout.activeGroupId)?.activeTab;
}

/** Keep each available tab exactly once; prune closed tabs and collapse empty branches. */
export function reconcileCenterLayout(layout: CenterLayout, tabKeys: readonly string[]): CenterLayout {
  const available = new Set(tabKeys), assigned = new Set<string>();
  const prune = (node: CenterNode): CenterNode | null => {
    if (node.type === "split") {
      const first = prune(node.first), second = prune(node.second);
      if (!first) return second;
      if (!second) return first;
      return first === node.first && second === node.second ? node : { ...node, first, second };
    }
    const tabs = node.tabs.filter((tab) => {
      if (!available.has(tab) || assigned.has(tab)) return false;
      assigned.add(tab); return true;
    });
    if (!tabs.length) return null;
    const activeTab = tabs.includes(node.activeTab) ? node.activeTab : tabs[0]!;
    return tabs.length === node.tabs.length && activeTab === node.activeTab ? node : { ...node, tabs, activeTab };
  };
  let root = layout.root ? prune(layout.root) : null;
  const groups = centerGroups(root);
  const activeGroupId = groups.find((group) => group.id === layout.activeGroupId)?.id ?? groups[0]?.id ?? "group:main";
  const pending = [...available].filter((tab) => !assigned.has(tab));
  if (pending.length) {
    root = root
      ? replaceGroup(root, activeGroupId, (group) => ({ ...group, tabs: [...group.tabs, ...pending] }))
      : { type: "group", id: activeGroupId, tabs: pending, activeTab: pending[0]! };
  }
  const active = root ? activeGroupId : null;
  return root === layout.root && active === layout.activeGroupId ? layout : { root, activeGroupId: active };
}

export function selectCenterTab(layout: CenterLayout, tabKey: string): CenterLayout {
  const group = centerGroups(layout.root).find((entry) => entry.tabs.includes(tabKey));
  if (!group || !layout.root || (group.activeTab === tabKey && layout.activeGroupId === group.id)) return layout;
  return {
    root: replaceGroup(layout.root, group.id, (current) => current.activeTab === tabKey ? current : { ...current, activeTab: tabKey }),
    activeGroupId: group.id,
  };
}

/** Reference Tcs: split the active group horizontally; the existing active tab moves second. */
export function splitCenterTab(layout: CenterLayout, newGroupId: string): CenterLayout {
  const groups = centerGroups(layout.root);
  const group = groups.find((entry) => entry.id === layout.activeGroupId);
  if (!layout.root || !group || group.tabs.length < 2 || !group.tabs.includes(group.activeTab) || groups.some((entry) => entry.id === newGroupId)) return layout;
  const remaining = group.tabs.filter((tab) => tab !== group.activeTab);
  const second: CenterGroup = { type: "group", id: newGroupId, tabs: [group.activeTab], activeTab: group.activeTab };
  return {
    root: replaceGroup(layout.root, group.id, () => ({
      type: "split", orientation: "horizontal", firstSize: 50,
      first: { ...group, tabs: remaining, activeTab: remaining[0]! }, second,
    })),
    activeGroupId: newGroupId,
  };
}

export interface CenterPane { group: CenterGroup; left: number; top: number; width: number; height: number }
/** Flat keyed content slots preserve a mounted tab when its group/rectangle changes. */
export function centerPanes(layout: CenterLayout): CenterPane[] {
  const walk = (node: CenterNode, left: number, top: number, width: number, height: number): CenterPane[] => {
    if (node.type === "group") return [{ group: node, left, top, width, height }];
    const fraction = node.firstSize / 100;
    return node.orientation === "horizontal"
      ? [...walk(node.first, left, top, width * fraction, height), ...walk(node.second, left + width * fraction, top, width * (1 - fraction), height)]
      : [...walk(node.first, left, top, width, height * fraction), ...walk(node.second, left, top + height * fraction, width, height * (1 - fraction))];
  };
  return layout.root ? walk(layout.root, 0, 0, 100, 100) : [];
}

function readLayouts(storage?: LayoutStorage): Record<string, CenterLayout> {
  try {
    const value: unknown = JSON.parse(storage?.getItem(CENTER_LAYOUT_KEY) ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("layouts" in value) || !value.layouts || typeof value.layouts !== "object" || Array.isArray(value.layouts)) return {};
    return value.layouts as Record<string, CenterLayout>;
  } catch { return {}; }
}
export function parseCenterLayout(value: unknown): CenterLayout | undefined {
  if (!value || typeof value !== "object" || !("root" in value) || !("activeGroupId" in value)) return;
  const groups = new Set<string>(), tabs = new Set<string>();
  const valid = (node: unknown, depth: number): node is CenterNode => {
    if (!node || typeof node !== "object" || depth > 64 || !("type" in node)) return false;
    if (node.type === "split") return "orientation" in node && (node.orientation === "horizontal" || node.orientation === "vertical")
      && "firstSize" in node && typeof node.firstSize === "number" && Number.isFinite(node.firstSize) && node.firstSize > 0 && node.firstSize < 100
      && "first" in node && valid(node.first, depth + 1) && "second" in node && valid(node.second, depth + 1);
    if (node.type !== "group" || !("id" in node) || typeof node.id !== "string" || !node.id || groups.has(node.id)
      || !("tabs" in node) || !Array.isArray(node.tabs) || !node.tabs.length || !("activeTab" in node) || typeof node.activeTab !== "string") return false;
    groups.add(node.id);
    for (const tab of node.tabs) {
      if (typeof tab !== "string" || !tab || tabs.has(tab)) return false;
      tabs.add(tab);
    }
    return node.tabs.includes(node.activeTab);
  };
  if (value.root === null) return value.activeGroupId === null ? EMPTY : undefined;
  if (!valid(value.root, 0) || typeof value.activeGroupId !== "string" || !groups.has(value.activeGroupId)) return;
  return value as CenterLayout;
}

export interface CenterPanelOptions {
  workspaceId: string;
  tabs: readonly string[];
  selectedTab?: string;
  enabled?: boolean;
  storage?: LayoutStorage;
  createGroupId?: () => string;
}
/** Persistence and enablement are owned here; callers cannot accidentally persist the ordinary mode. */
export function createCenterPanelController(options: CenterPanelOptions) {
  const { workspaceId, storage } = options;
  const saved = readLayouts(storage);
  const restored = Object.prototype.hasOwnProperty.call(saved, workspaceId) ? parseCenterLayout(saved[workspaceId]) : undefined;
  let layout = reconcileCenterLayout(restored ?? EMPTY, options.tabs);
  if (!restored && options.selectedTab) layout = selectCenterTab(layout, options.selectedTab);
  let enabled = options.enabled === true;
  const listeners = new Set<() => void>();
  const commit = (next: CenterLayout) => {
    if (next === layout) return;
    layout = next;
    try { storage?.setItem(CENTER_LAYOUT_KEY, JSON.stringify({ version: 1, layouts: { ...readLayouts(storage), [workspaceId]: next } })); }
    catch { /* A full/blocked store cannot break an existing live pane. */ }
    listeners.forEach((notify) => notify());
  };
  return {
    snapshot: () => layout,
    subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify); }; },
    setEnabled(value: boolean) { enabled = value; },
    reconcile(tabs: readonly string[]) { if (enabled) commit(reconcileCenterLayout(layout, tabs)); },
    selectTab(tab: string) { if (enabled) commit(selectCenterTab(layout, tab)); },
    activateGroup(id: string) {
      const group = centerGroups(layout.root).find((entry) => entry.id === id);
      if (enabled && group) commit(selectCenterTab(layout, group.activeTab));
    },
    split() {
      if (!enabled) return false;
      const id = options.createGroupId?.() ?? `group:${crypto.randomUUID()}`;
      commit(splitCenterTab(layout, id));
      return true;
    },
  };
}
