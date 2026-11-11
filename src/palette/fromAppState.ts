// Adapt the shell's AppState to palette data, and order workspaces the way
// the sidebar shows them (Cmd+1..9 and Cmd+Alt+Up/Down follow this order).

import type { AppState, Workspace } from "../state/types.ts";
import type { ActionEntry, PaletteData, SettingEntry, WorkspaceEntry } from "./search/model.ts";
import type { OpenInApp } from "../features/openIn/apps.ts";
import type { SearchItem } from "../settings/searchIndex.ts";
import { labelTargetBranch, workspaceLabel } from "../components/sidebarLabel.ts";
import { lastActiveAt as activityAt } from "../home/allWorkspaces.ts";
import { isWorkspaceUnread } from "../state/chatUnread.ts";
import { VIEW_ARCHIVED_LABEL, type ArchivedWorkspace } from "../workspace/archivedList.ts";

/** Handled inside the palette: it switches tabs instead of closing. */
export const VIEW_ARCHIVED_ACTION = "view-archived-workspaces";
import { sidebarEntries } from "../state/sidebarOrder.ts";
import { nextUnreadChat } from "../state/nextUnread.ts";

export interface WorkspaceRef {
  repoId: string;
  workspace: Workspace;
}

/** Workspaces in sidebar order: Pinned, then each repo's group, newest first (src/state/sidebarOrder.ts). */
export function sidebarOrder(state: AppState): WorkspaceRef[] {
  return sidebarEntries(state);
}

/** What Cmd+1..9 count: the rows on screen, so collapsed repos are skipped, as the row hints are. */
export function shortcutOrder(state: AppState, collapsedSections: ReadonlySet<string>): WorkspaceRef[] {
  return sidebarEntries(state, { visibleOnly: true, collapsedSections });
}

/** The workspace `delta` steps from the selected one, wrapping; first one if none is selected. */
export function stepWorkspace(state: AppState, delta: 1 | -1): WorkspaceRef | undefined {
  const order = sidebarOrder(state);
  if (order.length === 0) return undefined;
  const sel = state.selection;
  const i = sel.kind === "workspace" ? order.findIndex((w) => w.workspace.id === sel.workspaceId) : -1;
  if (i === -1) return order[delta === 1 ? 0 : order.length - 1];
  return order[(i + delta + order.length) % order.length];
}

/**
 * Conductor's command palette items (`m_a`, renderApp @10,909,900-10,918,150), in its order,
 * for a local user. Left out: Create section (sidebar sections), Team and Routines (cloud
 * organisations), Passport and Check for updates (no OpenConductor counterpart yet), and the
 * workspace actions OpenConductor cannot run from here (Search in files, Show changes / checks /
 * notes, Link issue, Move to section and the PR actions).
 */
export const PALETTE_ACTIONS: readonly ActionEntry[] = [
  // Workspace actions: only while a workspace is open.
  { id: "quick-open", title: "File picker", group: "workspace-actions", bindingId: "nav.quickOpen", icon: "file", keywords: ["quick", "open", "file", "search", "find", "picker"] },
  { id: "copy-url", title: "Copy URL", group: "workspace-actions", bindingId: "workspace.copyLink", icon: "link", keywords: ["copy", "url", "link", "share", "workspace"] },
  { id: "archive-workspace", title: "Archive workspace", group: "workspace-actions", bindingId: "workspace.archive", icon: "archive", keywords: ["archive", "current", "workspace"] },
  // Actions.
  { id: "new-workspace", title: "Create workspace", group: "actions", bindingId: "workspace.create", icon: "plus", keywords: ["new", "workspace", "create", "create workspace"] },
  { id: "add-project", title: "Add project", group: "actions", bindingId: "nav.addRepository", icon: "folder-plus", keywords: ["add", "project", "repository", "repo", "open", "import"] },
  { id: "toggle-theme", title: "Toggle theme", group: "actions", bindingId: "toggleTheme", icon: "sun-moon", keywords: ["toggle", "theme", "dark", "light"] },
  { id: "toggle-left-sidebar", title: "Toggle left sidebar", group: "actions", bindingId: "view.toggleLeftSidebar", icon: "panel-left", keywords: ["toggle", "left", "sidebar", "panel"] },
  { id: "toggle-right-sidebar", title: "Toggle right sidebar", group: "actions", bindingId: "view.toggleRightSidebar", icon: "panel-right", keywords: ["toggle", "right", "sidebar", "panel"] },
  { id: "toggle-zen-mode", title: "Toggle zen mode", group: "actions", bindingId: "view.toggleZenMode", icon: "maximize", keywords: ["toggle", "zen", "mode", "focus", "distraction"] },
  { id: "send-feedback", title: "Send feedback", group: "actions", bindingId: "sendFeedback", icon: "message", keywords: ["send", "feedback", "report", "issue"] },
  { id: "submit-prompt", title: "Submit a prompt", group: "actions", icon: "message", keywords: ["submit", "prompt", "request", "feature", "idea"] },
  { id: "show-shortcuts", title: "Show keyboard shortcuts", group: "actions", bindingId: "openKeyboardShortcuts", icon: "keyboard", keywords: ["show", "keyboard", "shortcuts", "keys", "hotkeys"] },
  { id: "open-changelog", title: "Open changelog", group: "actions", icon: "book", keywords: ["open", "changelog", "change", "log", "release", "notes", "updates", "version"] },
  // Navigation. Go to next unread comes first, only while something is unread (renderApp @10,916,846).
  { id: "go-to-next-unread", title: "Go to next unread", group: "navigation", bindingId: "chat.nextAttention", icon: "chevron-right", keywords: ["go", "to", "next", "unread", "attention", "chat", "session"] },
  { id: "settings", title: "Settings", group: "navigation", hint: "⌘,", icon: "settings", keywords: ["settings", "preferences", "config"] },
  // Conductor's `V9t` ("Home", nav.home) opens the /all-workspaces list.
  { id: "go-home", title: "Home", group: "navigation", bindingId: "nav.home", icon: "home", keywords: ["home", "history", "all", "workspaces", "activity"] },
  // Conductor: opens the Workspaces tab with archived workspaces shown, only while a workspace is open.
  { id: VIEW_ARCHIVED_ACTION, title: VIEW_ARCHIVED_LABEL, group: "navigation", icon: "archive", keywords: ["archive", "archived", "workspaces", "view", "show"] },
  { id: "open-docs", title: "Open documentation", group: "navigation", icon: "book", keywords: ["docs", "documentation", "help", "guide"] },
];

/**
 * Settings pages and rows (Conductor's `yUi` and `xUi`) as palette entries; ids stay the search index's.
 * Pages follow Conductor's nav (`jWt`): the repository sections (Scripts, Actions, Misc) come
 * right after Environment, before Experimental and Advanced.
 */
export function paletteSettings(items: readonly SearchItem[]): SettingEntry[] {
  const isRepoPage = (i: SearchItem) => i.target.scope === "repo" && i.tabLabel === undefined;
  const repoPages = items.filter(isRepoPage);
  const rest = items.filter((i) => !isRepoPage(i));
  const at = rest.findIndex((i) => i.id === "environment") + 1;
  const ordered = at > 0 ? [...rest.slice(0, at), ...repoPages, ...rest.slice(at)] : [...rest, ...repoPages];
  return ordered.map((i) => ({ id: i.id, title: i.label, section: i.tabLabel, keywords: i.keywords, row: i.tabLabel !== undefined }));
}

/**
 * `recentIds` is most recent first; it also drives each workspace's recency.
 * `archived` are the archived workspaces from conductor.db; they list after
 * the active ones, newest first.
 */
export function paletteDataFromState(
  state: AppState,
  recentIds: readonly string[],
  archived: readonly ArchivedWorkspace[] = [],
  settings: readonly SettingEntry[] = [],
  openInApps: readonly Pick<OpenInApp, "id" | "name">[] = [],
  defaultOpenIn: string | null = null,
): PaletteData {
  const rank = new Map(recentIds.map((id, i) => [id, i]));
  const workspaces: WorkspaceEntry[] = state.repos.flatMap((r) =>
    r.workspaces.map((w) => {
      const r0 = rank.get(w.id);
      // Recently visited workspaces sort above the rest; others by creation time.
      const lastActiveAt = r0 === undefined ? w.createdAt : Number.MAX_SAFE_INTEGER - r0;
      return {
        id: w.id,
        name: w.name,
        branch: w.branch,
        repoName: r.name,
        lastActiveAt,
        updatedAt: w.updatedAt ?? w.createdAt,
        archived: w.status === "archived",
        number: w.number ?? null,
        label: displayName(w),
        activeAt: activityAt(w),
        unread: isWorkspaceUnread(w),
      };
    }),
  );
  const repoNames = new Map(state.repos.map((r) => [r.id, r.name]));
  for (const a of archived) {
    if (!repoNames.has(a.repoId)) continue;
    workspaces.push({
      id: a.id,
      name: a.name,
      branch: a.branch,
      repoName: repoNames.get(a.repoId) ?? "",
      lastActiveAt: a.createdAt - Number.MAX_SAFE_INTEGER / 2,
      updatedAt: a.workspace.updatedAt ?? a.createdAt,
      archived: true,
      number: a.workspace.number ?? null,
      label: displayName(a.workspace),
      activeAt: activityAt(a.workspace),
    });
  }
  const activeWorkspaceId = state.selection.kind === "workspace" ? state.selection.workspaceId : null;
  const selectedWorkspace = state.repos.flatMap((r) => r.workspaces).find((w) => w.id === activeWorkspaceId);
  const openInActions: ActionEntry[] = selectedWorkspace?.path && selectedWorkspace.status !== "archived"
    ? openInApps.map((app) => ({ id: `open-in-${app.id}`, title: app.name, group: "open-in", keywords: ["open", "in", "open in", app.name, app.id], bindingId: app.id === defaultOpenIn ? "workspace.openInApp" : undefined }))
    : [];
  return {
    workspaces,
    projects: state.repos.map((r) => ({ id: r.id, name: r.name })),
    actions: [...PALETTE_ACTIONS.filter((a) => {
      if (a.id === "quick-open") return selectedWorkspace !== undefined && selectedWorkspace.status !== "archived" && selectedWorkspace.state !== "archived" && selectedWorkspace.state !== "unstarted";
      if (a.id === "archive-workspace") return selectedWorkspace?.status !== "archived" && state.archivedOpen?.workspace.id !== activeWorkspaceId;
      if (a.id === "go-to-next-unread") return nextUnreadChat(state, { skipSelected: false }) !== undefined;
      // Conductor gates both rows on the resolved workspace (`Xt &&`).
      if (a.id === VIEW_ARCHIVED_ACTION || a.id === "copy-url") {
        const sel = state.selection;
        if (sel.kind !== "workspace") return false;
        const workspace = state.repos.find((r) => r.id === sel.repoId)?.workspaces.find((w) => w.id === sel.workspaceId)
          ?? (state.archivedOpen?.workspace.id === sel.workspaceId ? state.archivedOpen.workspace : undefined);
        return workspace !== undefined;
      }
      return true;
    }), ...openInActions],
    settings,
    // Archived workspaces stay in Recent, as in Conductor; ids of deleted ones drop out here
    // but stay stored, so they still count toward the cap of 5 (recordViewedWorkspace never prunes).
    recentWorkspaceIds: recentIds.filter((id) => workspaces.some((w) => w.id === id)),
    activeWorkspaceId,
  };
}

/** The sidebar row's name for a workspace (Conductor's `$V`, src/components/sidebarLabel.ts). */
function displayName(w: Workspace): string {
  return workspaceLabel({
    name: w.name,
    workspaceName: w.workspaceName,
    branch: w.branch,
    prTitle: w.prTitle,
    userSetWorkspaceName: w.userSetWorkspaceName,
    targetBranch: labelTargetBranch(w.targetBranch),
  });
}
