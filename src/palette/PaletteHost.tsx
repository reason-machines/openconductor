import { useEffect, useMemo, useState, type Dispatch } from "react";
import type { Action } from "../state/store";
import type { AppState } from "../state/types";
import type { DialogKind } from "../components/Dialogs";
import { CommandPalette } from "./CommandPalette.tsx";
import { useKeybindings } from "../keybindings/KeybindingsProvider.tsx";
import type { CommandHandlers } from "../keybindings/bind.ts";
import { workspacePaletteData, paletteSettings, shortcutOrder, sidebarOrder, stepWorkspace, paletteOpenInRequest, type WorkspaceOpenInTarget, type WorkspaceRef } from "./fromAppState.ts";
import { buildSearchIndex } from "../settings/searchIndex";
import { settingsGroups } from "../settings/pages";
import { AGENT_SEARCH_TABS, scrollToRow, searchIcon } from "../settings/SettingsView";
import { openAgentSettings, openRepoSettingsPage, openSettingsPage } from "../features/chat/ChatModelPicker";
import type { ResultItem } from "./search/model.ts";
import { useBoolPref } from "../settings/useBoolPref.ts";
import { loadRecentWorkspaceIds, recordViewedWorkspace, saveRecentWorkspaceIds } from "./recentWorkspaces.ts";
import { loadLastWorkspaceRoute, saveLastWorkspaceRoute, selectedWorkspaceRoute, settingsRepositoryId } from "./settingsRepository.ts";
import { listArchivedWorkspaces, type ArchivedWorkspace } from "../workspace/archive";
import { openNextUnread } from "../state/nextUnread.ts";
import { preferredProjectWorkspace } from "./projectWorkspace.ts";
import { AppIcon, useInstalledApps } from "../features/openIn/OpenInButton.tsx";
import { openInApp } from "../features/openIn/apps.ts";
import { recordOpenIn, useAppPrefs } from "../settings/appPrefs.ts";
import { Toaster, useToasts } from "../components/Toast";
import { ConductorIcon } from "../components/ConductorIcon";
import { GIT_PANEL_ACTIONS, requestGitPanelAction } from "./gitPanelActions.ts";

interface Props {
  state: AppState;
  collapsedSections: ReadonlySet<string>;
  dispatch: Dispatch<Action>;
  onOpenDialog: (kind: DialogKind) => void;
  /** Native folder picker flow for adding a project. */
  onOpenProject: () => void;
  /** Open state lives in App so the sidebar's Search row can open the palette too. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** App-level commands the palette's Actions and Navigation items run. */
  commands: PaletteCommands;
  activeOpenInTarget?: WorkspaceOpenInTarget | null;
}

/** App-shell commands available to the palette's actions. */
export interface PaletteCommands {
  createSection?: () => void;
  addProject: () => void;
  toggleTheme: () => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  toggleZenMode: () => void;
  sendFeedback: () => void;
  submitPrompt: () => void;
  showShortcuts: () => void;
  openChangelog: () => void;
  openSettings: () => void;
  openDocs: () => void;
  quickOpen: () => void;
  copyUrl: () => void;
}

/** Owns the palette's open state, recent workspaces and the app's global shortcuts. */
export function PaletteHost({ state, collapsedSections, dispatch, onOpenDialog, onOpenProject, open, onOpenChange, commands, activeOpenInTarget }: Props) {
  const [recents, setRecents] = useState<readonly string[]>(loadRecentWorkspaceIds);
  const [lastWorkspaceRoute, setLastWorkspaceRoute] = useState(loadLastWorkspaceRoute);
  const sel = state.selection;
  const selectedId = sel.kind === "workspace" ? sel.workspaceId : null;
  const selectedRepoId = sel.kind === "workspace" ? sel.repoId : null;

  useEffect(() => {
    const route = selectedWorkspaceRoute(state);
    if (route) {
      setLastWorkspaceRoute((previous) => previous?.href === route.href ? previous : route);
      saveLastWorkspaceRoute(route);
    }
    if (selectedId) setRecents((r) => recordViewedWorkspace(r, selectedId));
  }, [selectedId, selectedRepoId, state.repos, state.archivedOpen]);
  useEffect(() => saveRecentWorkspaceIds(recents), [recents]);

  // parity:sidebar.archived-view: archived workspaces are not in the sidebar
  // state; read them from conductor.db each time the palette opens.
  const [archived, setArchived] = useState<ArchivedWorkspace[]>([]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    listArchivedWorkspaces().then(
      (rows) => live && setArchived(rows),
      (err) => console.error("conductor.db: could not list archived workspaces", err),
    );
    return () => {
      live = false;
    };
  }, [open, state.repos]);
  // Conductor's palette lists the settings pages, and with a query their rows (`yUi`, `xUi`):
  // the same index as Settings' own search.
  const hasRepos = state.repos.length > 0;
  const settingsIndex = useMemo(
    () => buildSearchIndex({ pages: settingsGroups(false).flatMap((g) => g.pages), agentTabs: AGENT_SEARCH_TABS, hasRepos }),
    [hasRepos],
  );
  const settingEntries = useMemo(() => paletteSettings(settingsIndex), [settingsIndex]);
  const apps = useInstalledApps();
  const prefs = useAppPrefs();
  const { toasts, show, dismiss } = useToasts();
  const data = useMemo(() => {
    const entries = workspacePaletteData(state, recents, archived, settingEntries, apps ?? [], prefs.default_open_in);
    return commands.createSection ? entries : { ...entries, actions: entries.actions.filter((entry) => entry.id !== "create-section") };
  }, [state, recents, archived, settingEntries, apps, prefs.default_open_in, commands.createSection]);
  const archivedById = (id: string) => archived.find((a) => a.id === id);
  const showWorkspaceNumbers = useBoolPref("experimental_show_workspace_numbers");

  const go = (ref: WorkspaceRef | undefined) =>
    ref && dispatch({ type: "select", selection: { kind: "workspace", repoId: ref.repoId, workspaceId: ref.workspace.id } });
  const activeRepoId = sel.kind === "workspace" ? sel.repoId : state.repos[0]?.id;
  const goUnread = (skipSelected: boolean): boolean => openNextUnread(state, dispatch, { skipSelected });

  const actions: Record<string, () => void> = {
    "archive-workspace": () => sel.kind === "workspace" && dispatch({ type: "archiveWorkspace", repoId: sel.repoId, workspaceId: sel.workspaceId }),
    "new-workspace": () => (activeRepoId ? onOpenDialog("create") : onOpenProject()),
    "create-section": () => commands.createSection?.(),
    // Conductor opens the sidebar's add-project popover on the next frame (`b_a`, after the dialog closes).
    "add-project": () => requestAnimationFrame(commands.addProject),
    "toggle-theme": commands.toggleTheme,
    "toggle-left-sidebar": commands.toggleLeftSidebar,
    "toggle-right-sidebar": commands.toggleRightSidebar,
    "toggle-zen-mode": commands.toggleZenMode,
    "send-feedback": commands.sendFeedback,
    "submit-prompt": commands.submitPrompt,
    "show-shortcuts": commands.showShortcuts,
    "open-changelog": commands.openChangelog,
    settings: commands.openSettings,
    "open-docs": commands.openDocs,
    "quick-open": commands.quickOpen,
    ...Object.fromEntries(GIT_PANEL_ACTIONS.map(({ entry }) => [entry.id, () => requestGitPanelAction(entry.id, state)])),
    "copy-url": commands.copyUrl,
    "go-home": () => dispatch({ type: "select", selection: { kind: "home" } }),
    "next-workspace": () => go(stepWorkspace(state, 1)),
    "previous-workspace": () => go(stepWorkspace(state, -1)),
    "go-to-next-unread": () => void goUnread(false),
  };

  // Cmd+N (workspace.create) is bound in App, which owns the Create-workspace dialog.
  const handlers: CommandHandlers = {
    toggleCommandPalette: () => onOpenChange(!open),
    "nav.home": actions["go-home"],
    "workspace.archive": actions["archive-workspace"],
    "workspace.next": actions["next-workspace"],
    "workspace.previous": actions["previous-workspace"],
    // Cmd+Alt+L. Conductor registers it in the workspace chat view (g1o @7,571,704), so it is
    // live only while a workspace is open, and it keeps the key even when nothing is unread.
    "chat.nextAttention": () => void (sel.kind === "workspace" && goUnread(true)),
  };
  for (let i = 1; i <= 9; i++) handlers[`workspace.switchTo${i}`] = () => go(shortcutOrder(state, collapsedSections)[i - 1]);
  useKeybindings(handlers);

  function onSelect(item: ResultItem) {
    const gone = item.kind === "workspace" && item.workspace.archived ? archivedById(item.workspace.id) : undefined;
    if (gone) {
      // An archived workspace opens read-only, with Unarchive.
      dispatch({ type: "openArchivedWorkspace", repoId: gone.repoId, workspace: gone.workspace });
    } else if (item.kind === "workspace") {
      const ref = sidebarOrder(state).find((w) => w.workspace.id === item.workspace.id);
      go(ref);
    } else if (item.kind === "project") {
      const repo = state.repos.find((r) => r.id === item.project.id);
      const target = repo && preferredProjectWorkspace(repo, recents);
      if (repo && target) go({ repoId: repo.id, workspace: target });
      else if (repo) dispatch({ type: "newWorkspace", repoId: repo.id });
    } else if (item.kind === "action") {
      const app = apps?.find((a) => item.action.id === `open-in-${a.id}`);
      const repo = sel.kind === "workspace" ? state.repos.find((r) => r.id === sel.repoId) : undefined;
      const workspace = repo?.workspaces.find((w) => w.id === selectedId);
      if (app && repo && workspace?.path && workspace.status !== "archived") {
        const request = paletteOpenInRequest(app.id, { repoId: repo.id, workspaceId: workspace.id, workspacePath: workspace.path }, activeOpenInTarget);
        void recordOpenIn(app.id, false).catch((err) => console.warn("could not save the default app", err));
        const pending = request.fileContext ? openInApp(app.id, request.path, request.fileContext) : openInApp(app.id, request.path);
        void pending.catch((err) => show("error", `Failed to open in ${app.name}: ${String(err)}`));
      } else actions[item.action.id]?.();
    } else if (item.kind === "setting") {
      openSetting(item.setting.id);
    }
  }

  function openSetting(id: string) {
    const t = settingsIndex.find((i) => i.id === id)?.target;
    if (!t) return;
    if (t.scope === "repo") {
      const repoId = settingsRepositoryId(state, lastWorkspaceRoute);
      if (repoId) openRepoSettingsPage(repoId, t.section);
    } else if (t.providerTab) openAgentSettings(t.providerTab);
    else openSettingsPage(t.page);
    if (t.row) scrollToRow(t.row);
  }
  const settingIcon = (id: string) => {
    const item = settingsIndex.find((i) => i.id === id);
    return item ? searchIcon(item) : null;
  };

  return (
    <>
      <Toaster toasts={toasts} dismiss={dismiss} />
      {open && <CommandPalette
      data={data}
      repos={state.repos}
      archived={archived}
      showWorkspaceNumbers={showWorkspaceNumbers}
      onSelect={onSelect}
      settingIcon={settingIcon}
      actionIcon={(id) => {
        if (id === "show-all-files") return <ConductorIcon name="list-tree" size={16} />;
        if (id === "show-changes" || id === "show-uncommitted-changes") return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2Z" /><path d="M14 2v5a1 1 0 0 0 1 1h5M9 13h6M12 10v6M9 19h6" /></svg>;
        if (id === "show-checks") return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx={12} cy={12} r={10} /><path d="m9 12 2 2 4-4" /></svg>;
        const app = apps?.find((a) => id === `open-in-${a.id}`);
        return app ? <AppIcon app={{ ...app, icon: null }} size={14} /> : null;
      }}
      onClose={() => onOpenChange(false)}
      />}
    </>
  );
}
