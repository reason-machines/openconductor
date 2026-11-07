import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "./state/store";
import { ATTACH_FAILED, destroyWorkspaceTerminals, onAttachFailure } from "./features/terminal/session";
import { isSidebarVisible, removedWorkspaceIds } from "./state/selectors";
import { OPEN_ADD_PROJECT_MENU, Sidebar } from "./components/Sidebar";
import { HomeScreen } from "./components/HomeScreen";
import { SubmitPromptDialog } from "./components/SubmitPromptDialog";
import { DiagnosticsPage } from "./diagnostics/DiagnosticsPage";
import { AllWorkspaces } from "./components/AllWorkspaces";
import { Dashboard } from "./components/Dashboard";
import "./home.css";
import { WorkspaceView } from "./components/WorkspaceView";
import type { DialogKind } from "./components/Dialogs";
import { CreateProjectDialog } from "./components/CreateProjectDialog";
import { OPEN_IN_GITHUB, SUCCESS_TOAST } from "./state/createProject";
import { CloneGitHubRepoDialog } from "./components/CloneGitHubRepoDialog";
import { CreateWorkspaceDialog } from "./components/CreateWorkspaceDialog";
import { CreateWorkspacePage } from "./components/CreateWorkspacePage";
import { RemoveRepositoryDialog } from "./components/RemoveRepositoryDialog";
import { MISC_COPY } from "./settings/repoMisc";
import { useAppPrefs } from "./settings/appPrefs";
import { useBoolPrefState } from "./settings/useBoolPref";
import { loadBranchPrefix } from "./workspace/api";
import { prefixSettingsFromInfo, type BranchPrefixSettings } from "./workspace/naming";
import { Toaster, useToasts, type ToastAction } from "./components/Toast";
import { useArchiveOnMergeWatcher } from "./features/pr/useArchiveOnMerge";
import { useSetupWatch } from "./workspace/useSetupWatch";
import { ArchiveRunningDialog } from "./components/ArchiveRunningDialog";
import { clearUnarchiveConflict, directoryExistsToast, failureToast, onArchiveEvent, restoreRequestFor, revealUnarchiveConflict, unarchiveFailedMessage } from "./workspace/archive";
import { ArchivedWorkspaceView } from "./components/ArchivedWorkspaceView";
import { RestoreWorkspaceDialog, type RestoreRequest } from "./components/RestoreWorkspaceDialog";
import type { Action } from "./state/store";
import { useInitIssues } from "./workspace/useInitIssues";
import { QuickOpenDialog } from "./components/QuickOpenDialog";
import { CHANGELOG_URL, DOCS_URL, FEEDBACK_URL } from "./components/helpMenuItems";
import {
  openInTerminalScript,
  XCODE_LICENSE_COMMAND,
  XCODE_LICENSE_DESCRIPTION,
  XCODE_LICENSE_TITLE,
  XCODE_LICENSE_TOAST_MS,
  xcodeLicenseBlocked,
  type ShellOut,
} from "./scripts/xcodeLicense";
import { addRepository, appInfo, inspectProjectFolder, inTauri, openUrl, pickFolder, quitApp, setQuitHandlerReady, type AppInfo } from "./backend";
import { chatStatuses } from "./features/chat/chatRuntime";
import { countRunningAgents, quitDecision } from "./features/quit/quit";
import { QuitDialog } from "./features/quit/QuitDialog";
import { addRegisteredRepo, decideOpenProject, failedToAddMessage } from "./state/openProject";
import { createFailedMessage } from "./state/githubRepoDialog";
import { GitHubRepoDialog, type GitHubRepoTarget } from "./components/GitHubRepoDialog";
import { PaletteHost, type PaletteCommands } from "./palette/PaletteHost";
import { useKeybindingOverrides, useKeybindings } from "./keybindings/KeybindingsProvider";
import { PRIORITY } from "./keybindings/dispatcher";
import { copyWorkspaceLink } from "./workspace/link";
import { SettingsView } from "./settings/SettingsView";
import { USER_PAGES } from "./settings/pages";
import { OPEN_SETTINGS_EVENT, openAgentSettings } from "./features/chat/ChatModelPicker.tsx";
import { RoutinesPage } from "./features/routines/RoutinesPage";
import { RoutineEditor } from "./features/routines/RoutineEditor";
import { REPO_SECTIONS, cloudSettingsLocation, keptSearch, resolveSettingsUrl, settingsPath, type RouteContext, type SettingsLocation } from "./settings/routes";
import { ORGANIZATION_EVENT, storedOrganization } from "./org/organization";
import { changeZoom, rememberSettings, toggleTheme } from "./settings/useSettings";
import { applyAppearance } from "./settings/appearance";
import { errorText, getSettings } from "./settings/api";
import { KeyboardShortcutsDialog } from "./components/KeyboardShortcutsDialog";
import { listen } from "@tauri-apps/api/event";
import { useNavHistory } from "./state/useNavHistory";
import { useWorkspaceDeepLinks } from "./workspace/useWorkspaceDeepLinks";
import { useAutoUnread } from "./state/useAutoUnread";
import { nextUnreadChat, openNextUnread } from "./state/nextUnread";
import { createRepoDefault } from "./home/repoFilter";
import { storedRepoFilter } from "./home/useRepoFilter";
import { toggleGarryMode, toggleRightPanel, toggleZenMode, useSidebarVisiblePref, useSidebarWidth } from "./components/panelPrefs";

export default function App() {
  const [state, storeDispatch, startup] = useAppStore();
  // The full-screen create page (`/create`) fills the main area until a
  // selection or a created workspace replaces it.
  const [createPage, setCreatePage] = useState<{ repoId: string | null; sectionId?: string; fromOpen?: boolean } | null>(() => (window.location.pathname === "/create" ? { repoId: null } : null));
  const dispatch = useCallback(
    (action: Action) => {
      if (action.type === "select" || action.type === "addWorkspace") setCreatePage(null);
      storeDispatch(action);
    },
    [storeDispatch],
  );
  const prefs = useAppPrefs();
  const cloudUI = useBoolPrefState("experimental_cloud_ui");
  useEffect(() => {
    if (cloudUI !== false || state.selection.kind !== "routines") return;
    dispatch({ type: "select", selection: { kind: "root" } });
    window.history.replaceState(window.history.state, "", "/" + keptSearch(window.location.search));
  }, [cloudUI, state.selection, dispatch]);
  // A `/create` start URL shows no workspace as current, like the reference's route.
  useEffect(() => {
    if (createPage && state.selection.kind === "workspace") storeDispatch({ type: "select", selection: { kind: "root" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A workspace that leaves the app (archived, or its repository removed)
  // takes its terminals and their saved history with it, as in Conductor.
  const prevState = useRef(state);
  useEffect(() => {
    for (const id of removedWorkspaceIds(prevState.current, state)) void destroyWorkspaceTerminals(id);
    prevState.current = state;
  }, [state]);
  const nav = useNavHistory(state, dispatch);
  // openconductor://workspace?id=<id> (Copy link) selects that workspace.
  useWorkspaceDeepLinks(state, dispatch);
  // A chat that finishes or waits on the user while not in view is marked unread.
  useAutoUnread(state, dispatch);
  useSidebarVisiblePref(isSidebarVisible(state), dispatch);
  const sidebarWidth = useSidebarWidth();
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSection = useCallback((id: string) => {
    setCollapsedSections((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(() => new URLSearchParams(window.location.search).get("palette") === "1");
  // `/create` opens the full-screen create page; `?dialog=create` the dialog.
  const [dialog, setDialog] = useState<DialogKind | null>(() => new URLSearchParams(window.location.search).get("dialog") as DialogKind | null);
  const [createRepoId, setCreateRepoId] = useState<string | null>(null);
  const [createSectionId, setCreateSectionId] = useState<string | undefined>(undefined);
  const [createFromOpen, setCreateFromOpen] = useState(false);
  /** `fromOpen`: Conductor's `createFromOpen` (repo menu "Create from...", ⌘⇧N) opens the source picker. */
  const openDialog = (d: DialogKind, repoId?: string, sectionId?: string, fromOpen = false) => {
    const requested = repoId ?? (state.selection.kind === "workspace" ? state.selection.repoId : null);
    // Nothing requested: start on the sidebar's project filter, as Conductor's `q4a` does.
    const id = createRepoDefault(state.repos.map((r) => r.id), requested, storedRepoFilter(prefs.sidebar_repo_filter));
    // Like Conductor's `g5`: the page when Experimental › New workspace page is on, else the dialog.
    if (d === "create" && prefs.experimental_new_workspace_page) {
      setDialog(null);
      // Off the current workspace, as Conductor's route change does; Back returns to it.
      if (state.selection.kind !== "root") storeDispatch({ type: "select", selection: { kind: "root" } });
      return setCreatePage({ repoId: id, sectionId, ...(fromOpen ? { fromOpen } : {}) });
    }
    setCreateRepoId(id);
    setCreateSectionId(sectionId);
    setCreateFromOpen(fromOpen);
    setDialog(d);
  };
  const [info, setInfo] = useState<AppInfo | null>(null);
  // Help › Diagnostics (Conductor's `/diagnostics` route) and Help › Submit a prompt.
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [submitPromptOpen, setSubmitPromptOpen] = useState(false);
  const { toasts, show, dismiss } = useToasts();
  // A setup script the create flow started reports its failure here, after the dialog closed.
  useSetupWatch(useCallback((message: string) => show("error", message), [show]));
  // A terminal screen that could not attach (Conductor's "Failed to attach terminal" toast).
  useEffect(() => onAttachFailure(() => show("error", ATTACH_FAILED)), [show]);
  // Non-fatal initialization issues (Conductor's workspaceError with "View logs"), from every create path.
  useInitIssues(useCallback((message: string, opts: { sticky: true; action?: ToastAction }) => show("error", message, opts), [show]));
  // Archive on merge for workspaces that are not open (the open one reports through its own PR lookup).
  useArchiveOnMergeWatcher({ repos: state.repos, openWorkspaceId: state.selection.kind === "workspace" ? state.selection.workspaceId : null, dispatch, notify: show });
  // Full archive (src/workspace/archive.ts): the running-agents question and
  // what the archive reports, wherever it was started from.
  const [archiveOverAgents, setArchiveOverAgents] = useState<Extract<Action, { type: "archiveWorkspace" }> | null>(null);
  // Unarchive found the branch deleted, taken or moved: "Restore to new branch?".
  const [restoreRequest, setRestoreRequest] = useState<RestoreRequest | null>(null);
  const closeRestore = useCallback(() => setRestoreRequest(null), []);
  useEffect(
    () =>
      onArchiveEvent<Action>((e) => {
        if (e.type === "agents-running" && e.action.type === "archiveWorkspace") setArchiveOverAgents(e.action);
        if (e.type === "archived" || e.type === "unarchived") for (const n of e.result.notices) show(n.kind, n.message, { sticky: n.kind === "error" });
        const restore = restoreRequestFor(e);
        if (restore) setRestoreRequest(restore);
        if (e.type === "unarchive-failed") {
          const conflict = directoryExistsToast(e.error);
          const retry = e.action.type === "unarchiveWorkspace" ? e.action : null;
          if (conflict && retry) {
            show("error", conflict.title, {
              sticky: true,
              description: conflict.description,
              action: {
                label: conflict.clearLabel,
                onClick: () =>
                  void clearUnarchiveConflict(retry.workspaceId).then(
                    () => dispatch(retry),
                    (err) => show("error", `Failed to delete folder: ${err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err)}`, { sticky: true }),
                  ),
              },
              extraActions: [
                { label: conflict.openLabel, onClick: () => void revealUnarchiveConflict(retry.workspaceId).catch(() => undefined) },
                { label: conflict.copyLabel, onClick: () => void navigator.clipboard?.writeText(conflict.path).catch(() => undefined) },
              ],
            });
          } else {
            show("error", unarchiveFailedMessage(e.error), { sticky: true });
          }
        }
        if (e.type === "failed" && e.action.type === "archiveWorkspace") {
          const { repoId, workspaceId } = e.action;
          const retry = { ...e.action, mode: "discardGitOperationState" as const };
          const t = failureToast(e.error, e.mode);
          if (t.kind === "git-operation") {
            show("error", t.message, { sticky: true, action: { label: "Archive", onClick: () => dispatch(retry) } });
          } else {
            show("error", t.message, { sticky: true, action: { label: t.deleteLabel, onClick: () => dispatch({ type: "deleteWorkspace", repoId, workspaceId }) } });
          }
        }
      }),
    [show, dispatch],
  );
  // A `/settings...` start URL opens settings where Conductor's router would
  // (src/settings/routes.ts); the URL then follows the open settings page.
  const routeContext = (): RouteContext => ({
    repoIds: state.repos.map((r) => r.id),
    lastRepoId: state.selection.kind === "workspace" ? state.selection.repoId : null,
    userPages: USER_PAGES,
    // Read synchronously from the stored choice, so an organization start URL resolves on the first render.
    organization: storedOrganization() !== null,
    // Preserve start-URL intent until settings load; rendering and navigation enforce the preference.
    experimentalCloudUI: true,
  });
  const [settingsLocation, setSettingsLocation] = useState<SettingsLocation | null>(() =>
    resolveSettingsUrl(window.location.pathname, window.location.search, routeContext()),
  );
  // On the desktop, repositories arrive from conductor.db after mount: resolve a
  // `/settings/repos...` start URL again once they are there.
  const pendingReposUrl = useRef(window.location.pathname.startsWith("/settings/repos") && state.repos.every((r) => !r.name));
  useEffect(() => {
    if (!pendingReposUrl.current || !state.repos.some((r) => r.name)) return;
    pendingReposUrl.current = false;
    const loc = resolveSettingsUrl(window.location.pathname, window.location.search, routeContext());
    if (loc) navigateSettings(loc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.repos]);
  const navigateSettings = useCallback((loc: SettingsLocation | null) => {
    const target = loc ? cloudSettingsLocation(loc, cloudUI === true) : null;
    setSettingsLocation(target);
    const search = keptSearch(window.location.search);
    window.history.replaceState(window.history.state, "", (target ? settingsPath(target) : "/") + search);
  }, [cloudUI]);
  useEffect(() => {
    if (cloudUI !== null && settingsLocation && !pendingReposUrl.current) navigateSettings(settingsLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudUI]);
  // Switching to Personal while an organization page is open lands on General, as Conductor's `lW` redirect does.
  const settingsLocationRef = useRef(settingsLocation);
  settingsLocationRef.current = settingsLocation;
  useEffect(() => {
    const onChange = () => {
      if (storedOrganization() === null && settingsLocationRef.current?.scope === "org") navigateSettings({ scope: "user", page: "general" });
    };
    window.addEventListener(ORGANIZATION_EVENT, onChange);
    return () => window.removeEventListener(ORGANIZATION_EVENT, onChange);
  }, [navigateSettings]);
  const openSettings = useCallback(() => {
    if (!settingsLocation) navigateSettings({ scope: "user", page: "general" });
  }, [settingsLocation, navigateSettings]);
  const closeSettings = useCallback(() => navigateSettings(null), [navigateSettings]);
  // The composer's model picker ("Add models", "Edit") opens Settings › Default models.
  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent<{ page?: string; repoId?: string; section?: string; providerTab?: string }>).detail;
      // The right panel's "Add run script" opens the repository's Scripts settings.
      const section = REPO_SECTIONS.find((s) => s === detail?.section);
      if (detail?.repoId && section) return navigateSettings({ scope: "repo", repoId: detail.repoId, section });
      // Cloud setup (create's "Set up cloud") lives at /settings/cloud/setup, outside the user pages.
      const known = [...USER_PAGES, "setup-cloud" as const].find((p) => p === detail?.page);
      if (known) navigateSettings({ scope: "user", page: known });
      // A chat's "Open <agent> settings": the Agents page opens on that agent's tab.
      if (known === "providers" && detail?.providerTab) {
        const q = new URLSearchParams(window.location.search);
        q.set("providerTab", detail.providerTab);
        window.history.replaceState(window.history.state, "", `${window.location.pathname}?${q}`);
      }
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, [navigateSettings]);

  // Apply the saved theme and appearance at startup; the settings page applies later changes.
  useEffect(() => {
    getSettings().then((s) => applyAppearance(rememberSettings(s)), () => undefined);
  }, []);


  // "Create a private GitHub repo?" for a picked folder without git or origin.
  // `?dialog=github-repo` opens it with a sample folder in a plain browser.
  const [githubRepo, setGithubRepo] = useState<GitHubRepoTarget | null>(() =>
    !inTauri() && new URLSearchParams(window.location.search).get("dialog") === "github-repo"
      ? { path: "/Users/you/code/My Notes", name: "My Notes", needsGitInit: true }
      : null,
  );
  const addCreatedRepo = useCallback(async (target: GitHubRepoTarget, remote: string) => {
    dispatch(addRegisteredRepo(await addRepository(target.path), remote));
  }, [dispatch]);

  // Open project: native picker straight away, then the backend folder checks.
  // A Recents row of the sidebar add menu runs the same checks on its folder
  // (Conductor's `Jgi` mutation, called with or without a path).
  const addProject = useCallback(async (picked?: string) => {
    if (!inTauri()) return show("info", "Open project needs the desktop app.");
    try {
      const path = picked ?? (await pickFolder("Select project directory"));
      if (!path) return;
      const outcome = decideOpenProject(path, await inspectProjectFolder(path));
      if (outcome.kind === "error") return show("error", failedToAddMessage(outcome.message));
      if (outcome.kind === "needsGitHubRepo") return setGithubRepo({ path: outcome.path, name: outcome.name, needsGitInit: outcome.needsGitInit });
      // An already-added folder is not refused: as in Conductor the backend
      // registers a second project for it, named `<name>-v1`, `-v2`, ...
      // (evidence/screens/duplicate-repo.md).
      dispatch(addRegisteredRepo(await addRepository(outcome.path), outcome.remote));
    } catch (err) {
      show("error", failedToAddMessage(err));
    }
  }, [dispatch, show]);
  const openProject = useCallback(() => void addProject(), [addProject]);
  const addProjectAt = useCallback((path: string) => void addProject(path), [addProject]);
  // The create composer's "Add project" (Conductor's `ZQo` opens `Gji`, the sidebar's add menu): a project
  // opened from there becomes the composer's repository; the GitHub and Quick start items open their dialogs.
  const createAddActions = {
    onOpenProject: openProject,
    onOpenGitHubProject: () => openDialog("clone"),
    onQuickStart: () => openDialog("quickstart"),
    onAddProjectAt: addProjectAt,
  };
  const [quickOpen, setQuickOpen] = useState(false);
  // ⌥⌘/ and the native Help > Keyboard Shortcuts item both toggle the help dialog.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { overrides } = useKeybindingOverrides();
  const toggleShortcuts = useCallback(() => setShortcutsOpen((open) => !open), []);
  useEffect(() => {
    if (!inTauri()) return;
    const unlisten = listen("open_keyboard_shortcuts_dialog", toggleShortcuts);
    return () => void unlisten.then((off) => off());
  }, [toggleShortcuts]);
  // View > Toggle Left / Right Sidebar in the native menu (src-tauri/src/menu.rs).
  useEffect(() => {
    if (!inTauri()) return;
    const offs = [
      listen("toggle_left_sidebar", () => dispatch({ type: "toggleSidebar" })),
      listen("toggle_right_sidebar", toggleRightPanel),
    ];
    return () => offs.forEach((off) => void off.then((f) => f()));
  }, [dispatch]);

  // Quit: the native app menu's Quit (⌘Q) and the quitApplication shortcut ask first
  // while agents run, as Conductor does (src/features/quit/quit.ts).
  const [quitConfirm, setQuitConfirm] = useState<number | null>(null);
  const reposRef = useRef(state.repos);
  reposRef.current = state.repos;
  const openWorkspaceRef = useRef<string | undefined>(undefined);
  openWorkspaceRef.current = state.selection.kind === "workspace" ? state.selection.workspaceId : undefined;
  const requestQuit = useCallback(() => {
    const running = countRunningAgents(chatStatuses(), reposRef.current.flatMap((r) => r.workspaces), openWorkspaceRef.current);
    if (quitDecision(running) === "confirm") setQuitConfirm(running);
    else void quitApp().catch((e) => show("error", errorText(e)));
  }, [show]);
  const confirmQuit = useCallback(() => void quitApp().catch((e) => show("error", errorText(e))), [show]);
  // The native menu's accelerators land here as events: App menu > Settings... (⌘,) opens
  // Settings › General like Conductor's `open_settings_page`, and Quit (⌘Q) sends `quit_requested`.
  const menuRef = useRef({ requestQuit, navigateSettings });
  menuRef.current = { requestQuit, navigateSettings };
  useEffect(() => {
    if (!inTauri()) return;
    const offs = [
      listen("quit_requested", () => menuRef.current.requestQuit()),
      listen("open_settings_page", () => menuRef.current.navigateSettings({ scope: "user", page: "general" })),
    ];
    // Only once it listens may the native Quit item wait for it.
    void Promise.all(offs).then(() => setQuitHandlerReady(true)).catch(() => {});
    return () => {
      void setQuitHandlerReady(false).catch(() => {});
      offs.forEach((off) => void off.then((f) => f()));
    };
  }, []);
  const quitDialog = quitConfirm !== null && <QuitDialog running={quitConfirm} onConfirm={confirmQuit} onClose={() => setQuitConfirm(null)} />;

  const sel = state.selection;
  const repo = sel.kind === "workspace" ? state.repos.find((r) => r.id === sel.repoId) : undefined;
  // An archived workspace opened from the archived list is not in `repos` (parity:sidebar.archived-view).
  const workspace =
    sel.kind === "workspace"
      ? (repo?.workspaces.find((w) => w.id === sel.workspaceId) ?? (state.archivedOpen?.workspace.id === sel.workspaceId ? state.archivedOpen.workspace : undefined))
      : undefined;
  // Quick open needs an active (not archived) workspace, like the reference.
  const canQuickOpen = !!workspace && workspace.status !== "archived";
  const workspacePath = workspace?.path || repo?.path || (inTauri() ? null : "/demo");

  // Every app-shell shortcut goes through the one dispatcher (src/keybindings).
  useKeybindings({
    "openKeyboardShortcuts": toggleShortcuts,
    "openSettings": openSettings,
    "sendFeedback": () => void openUrl(FEEDBACK_URL),
    "toggleTheme": () => void toggleTheme().catch((e) => show("error", errorText(e))),
    "view.zoomIn": () => void changeZoom("in").catch((e) => show("error", errorText(e))),
    "view.zoomOut": () => void changeZoom("out").catch((e) => show("error", errorText(e))),
    "view.resetZoom": () => void changeZoom("reset").catch((e) => show("error", errorText(e))),
    "nav.back": nav.onBack,
    "nav.forward": nav.onForward,
    "view.toggleLeftSidebar": () => dispatch({ type: "toggleSidebar" }),
    "view.toggleRightSidebar": toggleRightPanel,
    "view.toggleZenMode": () => toggleZenMode(isSidebarVisible(state), dispatch),
    "toggleGarryMode": toggleGarryMode,
    "nav.quickOpen": () => setQuickOpen((open) => !open && canQuickOpen),
    "workspace.create": () => openDialog("create"),
    "workspace.createFromPRBranchIssue": () => openDialog("create", undefined, undefined, true),
    "quitApplication": requestQuit,
  });

  // Repo menu "Remove repository" (Conductor's `Dra` dialog), then the same toast and state as Settings › Misc.
  const [removingRepoId, setRemovingRepoId] = useState<string | null>(null);
  const removingRepo = removingRepoId ? state.repos.find((r) => r.id === removingRepoId) : undefined;
  const removeRepositoryFromMenu = (repoId: string) => setRemovingRepoId(repoId);
  const copyLink = useCallback(
    (workspaceId: string) => void copyWorkspaceLink(workspaceId).then(({ kind, message }) => show(kind, message)),
    [show],
  );
  // Conductor binds ⌘⇧C in the open workspace (`Dlo`) with `Olo`: dialog
  // priority, global, also while typing, not in the terminal.
  useKeybindings(
    { "workspace.copyLink": workspace ? () => copyLink(workspace.id) : undefined },
    { priority: PRIORITY.DIALOG, isGlobal: true, enableOnInputFocus: true, enableOnTerminalFocus: false },
  );

  // What the command palette's items run: the same handlers as their shortcuts.
  const paletteCommands: PaletteCommands = {
    addProject: () => (isSidebarVisible(state) ? window.dispatchEvent(new Event(OPEN_ADD_PROJECT_MENU)) : openProject()),
    toggleTheme: () => void toggleTheme().catch((e) => show("error", errorText(e))),
    toggleLeftSidebar: () => dispatch({ type: "toggleSidebar" }),
    toggleRightSidebar: toggleRightPanel,
    toggleZenMode: () => toggleZenMode(isSidebarVisible(state), dispatch),
    sendFeedback: () => void openUrl(FEEDBACK_URL),
    submitPrompt: () => setSubmitPromptOpen(true),
    showShortcuts: () => setShortcutsOpen(true),
    openChangelog: () => void openUrl(CHANGELOG_URL),
    openSettings: () => navigateSettings({ scope: "user", page: "general" }),
    openDocs: () => void openUrl(DOCS_URL),
    quickOpen: () => setQuickOpen(canQuickOpen),
    copyUrl: () => {
      if (workspace) copyLink(workspace.id);
    },
  };

  const [prefix, setPrefix] = useState<{ settings: BranchPrefixSettings; githubUsername: string | null }>({ settings: {}, githubUsername: null });
  // Re-read each time the dialog or page opens so a settings change applies to the next create.
  const creating = dialog === "create" || createPage !== null;
  useEffect(() => {
    if (!creating) return;
    loadBranchPrefix().then((info) => setPrefix(prefixSettingsFromInfo(info))).catch(() => {});
  }, [creating]);

  useEffect(() => {
    appInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  // Conductor's startup Xcode license check (`HBr`, src/scripts/xcodeLicense.ts): an unaccepted
  // license blocks git, so say so for 15 s with "Run for me".
  useEffect(() => {
    if (!inTauri()) return;
    const run = (command: string) => invoke<ShellOut>("execute_shell_command", { request: { command } });
    appInfo()
      .then((i) => xcodeLicenseBlocked(i.platform, run))
      .then((blocked) => {
        if (!blocked) return;
        show("error", XCODE_LICENSE_TITLE, {
          durationMs: XCODE_LICENSE_TOAST_MS,
          description: XCODE_LICENSE_DESCRIPTION,
          action: { label: "Run for me", onClick: () => void run(openInTerminalScript(XCODE_LICENSE_COMMAND)).catch(() => {}) },
        });
      })
      .catch(() => {});
  }, [show]);

  // The Toaster sits at the same place (second child of this fragment) in both views, so
  // opening or closing Settings keeps the toasts mounted: their timers keep running and
  // they do not replay their 400ms slide-in over the page that just opened.
  const toaster = <Toaster toasts={toasts} dismiss={dismiss} />;
  if (diagnosticsOpen)
    return (
      <>
        <>
          <DiagnosticsPage onClose={() => setDiagnosticsOpen(false)} notify={show} />
          {quitDialog}
        </>
        {toaster}
      </>
    );

  if (settingsLocation)
    return (
      <>
        <>
        <SettingsView
          location={cloudSettingsLocation(settingsLocation, cloudUI === true)}
          repos={state.repos}
          onNavigate={navigateSettings}
          onClose={closeSettings}
          miscActions={{
            onSetIcon: (repoId, icon) => dispatch({ type: "setRepoIcon", repoId, icon }),
            // Conductor leaves for Settings › Git once the repository is gone.
            onRemoved: (repoId) => {
              dispatch({ type: "removeRepo", repoId });
              navigateSettings({ scope: "user", page: "git" });
            },
            notify: (kind, message) => show(kind, message),
          }}
          onLaunchCloudWorkspace={() => {
            closeSettings();
            openDialog("create");
          }}
        />
        {quitDialog}
        </>
        {toaster}
      </>
    );

  return (
    <>
    <div className={`app ${isSidebarVisible(state) ? "" : "sidebar-hidden"}`} style={sidebarWidth.style} aria-busy={startup === "loading"} data-startup={startup}>
      {isSidebarVisible(state) && sidebarWidth.resizer}
      {isSidebarVisible(state) && <Sidebar state={state} collapsedSections={collapsedSections} onToggleSection={toggleSection} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} onAddProjectAt={addProjectAt} onOpenSettings={openSettings} onOpenShortcuts={toggleShortcuts} onSubmitPrompt={() => setSubmitPromptOpen(true)} onOpenDiagnostics={() => setDiagnosticsOpen(true)} onSearch={() => setPaletteOpen(true)} nav={nav} info={info} onCopyWorkspaceLink={(ws) => copyLink(ws.id)} onError={(message) => show("error", message)} onCreateFrom={(repoId) => openDialog("create", repoId, undefined, true)} onOpenRepoSettings={(repoId) => navigateSettings({ scope: "repo", repoId, section: "misc" })} onRemoveRepository={removeRepositoryFromMenu} />}
      <main className="main">
        {createPage ? (
          <CreateWorkspacePage
            // A new page for each open, so its draft starts fresh.
            key={JSON.stringify(createPage)}
            repos={state.repos}
            initialRepoId={createPage.repoId}
            sections={state.sections ?? []}
            initialSectionId={createPage.sectionId}
            fromOpen={createPage.fromOpen}
            prefixSettings={prefix.settings}
            githubUsername={prefix.githubUsername}
            sidebarVisible={isSidebarVisible(state)}
            onClose={() => setCreatePage(null)}
            addActions={createAddActions}
            onWarning={(message) => show("error", message, { sticky: true })}
            dispatch={dispatch}
          />
        ) : repo && workspace?.status === "archived" ? (
          <ArchivedWorkspaceView repo={repo} workspace={workspace} dispatch={dispatch} />
        ) : repo && workspace ? (
          <WorkspaceView
            repo={repo}
            workspace={workspace}
            dispatch={dispatch}
            notify={show}
            hasNextUnread={(selectedChatId) => nextUnreadChat(state, { skipSelected: true, selectedChatId }) !== undefined}
            onNextUnread={() => void openNextUnread(state, dispatch, { skipSelected: true })}
          />
        ) : sel.kind === "home" ? (
          <AllWorkspaces repos={state.repos} sidebarVisible={isSidebarVisible(state)} dispatch={dispatch} onCreateWorkspace={() => openDialog("create")} />
        ) : sel.kind === "routines" && cloudUI === true ? (
          sel.page ? (
            <RoutineEditor
              page={sel.page}
              repos={state.repos}
              onNavigate={(page) => dispatch({ type: "select", selection: page ? { kind: "routines", page } : { kind: "routines" } })}
              onOpenReasonSettings={() => openAgentSettings("reason")}
              notify={show}
            />
          ) : (
            <RoutinesPage
              sidebarVisible={isSidebarVisible(state)}
              onToggleSidebar={() => dispatch({ type: "toggleSidebar" })}
              onNavigate={(page) => dispatch({ type: "select", selection: page ? { kind: "routines", page } : { kind: "routines" } })}
              onOpenReasonSettings={() => openAgentSettings("reason")}
              notify={show}
            />
          )
        ) : sel.kind === "dashboard" ? (
          <Dashboard
            repos={state.repos}
            repo={sel.repo}
            sidebarVisible={isSidebarVisible(state)}
            dispatch={dispatch}
            onCreateWorkspace={(repoId) => openDialog("create", repoId)}
            onError={(message) => show("error", message)}
          />
        ) : (
          <HomeScreen repos={state.repos} sidebarVisible={isSidebarVisible(state)} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} />
        )}
      </main>
      {dialog === "clone" && (
        <CloneGitHubRepoDialog
          onClose={() => setDialog(null)}
          // The backend names the folder uniquely; a second clone of one remote is its own project (Conductor: `<name>-v1`).
          onCloned={(cloned, remote, name) => dispatch({ type: "addRepo", id: inTauri() ? cloned.id : undefined, repo: { name: cloned.name || name, path: cloned.root, remote, defaultBranch: cloned.defaultBranch } })}
        />
      )}
      {dialog === "quickstart" && (
        <CreateProjectDialog
          onClose={() => setDialog(null)}
          onRepoAdded={({ id, ...repo }) => dispatch({ type: "addRepo", id, repo })}
          onCreated={(repoId, first, githubUrl) => {
            dispatch({ type: "addWorkspace", repoId, workspace: first.workspace });
            show("info", SUCCESS_TOAST, { action: { label: OPEN_IN_GITHUB, onClick: () => void openUrl(githubUrl) } });
          }}
        />
      )}
      {removingRepo && (
        <RemoveRepositoryDialog
          repo={removingRepo}
          onClose={() => setRemovingRepoId(null)}
          onRemoved={() => {
            setRemovingRepoId(null);
            show("info", MISC_COPY.remove.removed);
            dispatch({ type: "removeRepo", repoId: removingRepo.id });
          }}
          onError={(message) => show("error", message)}
        />
      )}
      {dialog === "create" && (
        <CreateWorkspaceDialog
          repos={state.repos}
          initialRepoId={createRepoId}
          sections={state.sections ?? []}
          initialSectionId={createSectionId}
          fromOpen={createFromOpen}
          prefixSettings={prefix.settings}
          githubUsername={prefix.githubUsername}
          onClose={() => setDialog(null)}
          addActions={createAddActions}
          onWarning={(message) => show("error", message, { sticky: true })}
          dispatch={dispatch}
        />
      )}
      {quickOpen && repo && (
        <QuickOpenDialog
          repoId={repo.id}
          workspacePath={workspacePath}
          onClose={() => setQuickOpen(false)}
          onOpen={(path, mode) => show("info", `${mode === "diff" ? "Diff of" : "Opened"} ${path} (file viewer not built yet)`)}
        />
      )}
      {githubRepo && (
        <GitHubRepoDialog
          target={githubRepo}
          onClose={() => setGithubRepo(null)}
          onOpenSettings={openSettings}
          onCreated={(remote) => addCreatedRepo(githubRepo, remote)}
          onError={(message) => show("error", createFailedMessage(message))}
        />
      )}
      {submitPromptOpen && <SubmitPromptDialog appVersion={info?.version} platform={info?.platform} onClose={() => setSubmitPromptOpen(false)} />}
      {shortcutsOpen && <KeyboardShortcutsDialog onClose={() => setShortcutsOpen(false)} overrides={overrides} />}
      <PaletteHost state={state} collapsedSections={collapsedSections} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} open={paletteOpen} onOpenChange={setPaletteOpen} commands={paletteCommands} />
      {archiveOverAgents && (
        <ArchiveRunningDialog
          onClose={() => setArchiveOverAgents(null)}
          onConfirm={() => dispatch({ ...archiveOverAgents, stopRunningAgents: true })}
        />
      )}
      {restoreRequest && <RestoreWorkspaceDialog request={restoreRequest} dispatch={dispatch} onClose={closeRestore} />}
      {quitDialog}
    </div>
    {toaster}
    </>
  );
}
