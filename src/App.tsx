import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "./state/store";
import { destroyWorkspaceTerminals } from "./features/terminal/session";
import { isSidebarVisible, removedWorkspaceIds } from "./state/selectors";
import { Sidebar } from "./components/Sidebar";
import { HomeScreen } from "./components/HomeScreen";
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
import { useAppPrefs } from "./settings/appPrefs";
import { loadBranchPrefix } from "./workspace/api";
import { prefixSettingsFromInfo, type BranchPrefixSettings } from "./workspace/naming";
import { Toaster, useToasts, type ToastAction } from "./components/Toast";
import { useArchiveOnMergeWatcher } from "./features/pr/useArchiveOnMerge";
import { useSetupWatch } from "./workspace/useSetupWatch";
import { ArchiveRunningDialog } from "./components/ArchiveRunningDialog";
import { clearUnarchiveConflict, directoryExistsToast, failureToast, onArchiveEvent, revealUnarchiveConflict, unarchiveFailedMessage } from "./workspace/archive";
import { ArchivedWorkspaceView } from "./components/ArchivedWorkspaceView";
import { RestoreWorkspaceDialog, type RestoreRequest } from "./components/RestoreWorkspaceDialog";
import type { Action } from "./state/store";
import { useInitIssues } from "./workspace/useInitIssues";
import { QuickOpenDialog } from "./components/QuickOpenDialog";
import { FEEDBACK_URL } from "./components/helpMenuItems";
import { addRepository, appInfo, inspectProjectFolder, inTauri, openUrl, pickFolder, type AppInfo } from "./backend";
import { decideOpenProject, failedToAddMessage } from "./state/openProject";
import { createFailedMessage } from "./state/githubRepoDialog";
import { GitHubRepoDialog, type GitHubRepoTarget } from "./components/GitHubRepoDialog";
import { PaletteHost } from "./palette/PaletteHost";
import { useKeybindingOverrides, useKeybindings } from "./keybindings/KeybindingsProvider";
import { PRIORITY } from "./keybindings/dispatcher";
import { copyWorkspaceLink } from "./workspace/link";
import { SettingsView } from "./settings/SettingsView";
import { USER_PAGES } from "./settings/pages";
import { OPEN_SETTINGS_EVENT } from "./features/chat/ChatModelPicker.tsx";
import { REPO_SECTIONS, keptSearch, resolveSettingsUrl, settingsPath, type RouteContext, type SettingsLocation } from "./settings/routes";
import { changeZoom } from "./settings/useSettings";
import { applyAppearance } from "./settings/appearance";
import { errorText, getSettings } from "./settings/api";
import { KeyboardShortcutsDialog } from "./components/KeyboardShortcutsDialog";
import { listen } from "@tauri-apps/api/event";
import { useNavHistory } from "./state/useNavHistory";
import { createRepoDefault } from "./home/repoFilter";
import { storedRepoFilter } from "./home/useRepoFilter";
import { toggleGarryMode, toggleRightPanel, toggleZenMode, useSidebarVisiblePref, useSidebarWidth } from "./components/panelPrefs";

export default function App() {
  const [state, storeDispatch] = useAppStore();
  // The full-screen create page (`/create`) fills the main area until a
  // selection or a created workspace replaces it.
  const [createPage, setCreatePage] = useState<{ repoId: string | null; sectionId?: string } | null>(() => (window.location.pathname === "/create" ? { repoId: null } : null));
  const dispatch = useCallback(
    (action: Action) => {
      if (action.type === "select" || action.type === "addWorkspace") setCreatePage(null);
      storeDispatch(action);
    },
    [storeDispatch],
  );
  const prefs = useAppPrefs();
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
  useSidebarVisiblePref(isSidebarVisible(state), dispatch);
  const sidebarWidth = useSidebarWidth();
  const [paletteOpen, setPaletteOpen] = useState(() => new URLSearchParams(window.location.search).get("palette") === "1");
  // `/create` opens the full-screen create page; `?dialog=create` the dialog.
  const [dialog, setDialog] = useState<DialogKind | null>(() => new URLSearchParams(window.location.search).get("dialog") as DialogKind | null);
  const [createRepoId, setCreateRepoId] = useState<string | null>(null);
  const [createSectionId, setCreateSectionId] = useState<string | undefined>(undefined);
  const openDialog = (d: DialogKind, repoId?: string, sectionId?: string) => {
    const requested = repoId ?? (state.selection.kind === "workspace" ? state.selection.repoId : null);
    // Nothing requested: start on the sidebar's project filter, as Conductor's `q4a` does.
    const id = createRepoDefault(state.repos.map((r) => r.id), requested, storedRepoFilter(prefs.sidebar_repo_filter));
    // Like Conductor's `g5`: the page when Experimental › New workspace page is on, else the dialog.
    if (d === "create" && prefs.experimental_new_workspace_page) {
      setDialog(null);
      // Off the current workspace, as Conductor's route change does; Back returns to it.
      if (state.selection.kind !== "root") storeDispatch({ type: "select", selection: { kind: "root" } });
      return setCreatePage({ repoId: id, sectionId });
    }
    setCreateRepoId(id);
    setCreateSectionId(sectionId);
    setDialog(d);
  };
  const [info, setInfo] = useState<AppInfo | null>(null);
  const { toasts, show, dismiss } = useToasts();
  // A setup script the create flow started reports its failure here, after the dialog closed.
  useSetupWatch(useCallback((message: string) => show("error", message), [show]));
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
        if (e.type === "unarchived" && e.result.scenario && e.action.type === "unarchiveWorkspace") {
          setRestoreRequest({ repoId: e.action.repoId, workspaceId: e.action.workspaceId, branch: e.result.branch ?? "unknown", scenario: e.result.scenario });
        }
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
    setSettingsLocation(loc);
    const search = keptSearch(window.location.search);
    window.history.replaceState(window.history.state, "", (loc ? settingsPath(loc) : "/") + search);
  }, []);
  // Show the page a start URL resolved to, as Conductor's redirects do.
  useEffect(() => {
    if (settingsLocation && !pendingReposUrl.current) navigateSettings(settingsLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openSettings = useCallback(() => {
    if (!settingsLocation) navigateSettings({ scope: "user", page: "general" });
  }, [settingsLocation, navigateSettings]);
  const closeSettings = useCallback(() => navigateSettings(null), [navigateSettings]);
  // The composer's model picker ("Add models", "Edit") opens Settings › Default models.
  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent<{ page?: string; repoId?: string; section?: string }>).detail;
      // The right panel's "Add run script" opens the repository's Scripts settings.
      const section = REPO_SECTIONS.find((s) => s === detail?.section);
      if (detail?.repoId && section) return navigateSettings({ scope: "repo", repoId: detail.repoId, section });
      const known = USER_PAGES.find((p) => p === detail?.page);
      if (known) navigateSettings({ scope: "user", page: known });
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, [navigateSettings]);

  // Apply the saved theme and appearance at startup; the settings page applies later changes.
  useEffect(() => {
    getSettings().then(applyAppearance, () => undefined);
  }, []);


  // "Create a private GitHub repo?" for a picked folder without git or origin.
  // `?dialog=github-repo` opens it with a sample folder in a plain browser.
  const [githubRepo, setGithubRepo] = useState<GitHubRepoTarget | null>(() =>
    !inTauri() && new URLSearchParams(window.location.search).get("dialog") === "github-repo"
      ? { path: "/Users/you/code/My Notes", name: "My Notes", needsGitInit: true }
      : null,
  );
  const addCreatedRepo = useCallback(async (target: GitHubRepoTarget, remote: string) => {
    const registered = await addRepository(target.path);
    dispatch({ type: "addRepo", id: registered.id, repo: { name: target.name, path: registered.root, remote, defaultBranch: registered.defaultBranch } });
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
      const registered = await addRepository(outcome.path);
      dispatch({ type: "addRepo", id: registered.id, repo: { name: registered.name, path: registered.root, remote: outcome.remote, defaultBranch: registered.defaultBranch } });
    } catch (err) {
      show("error", failedToAddMessage(err));
    }
  }, [dispatch, show]);
  const openProject = useCallback(() => void addProject(), [addProject]);
  const addProjectAt = useCallback((path: string) => void addProject(path), [addProject]);
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
  });

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

  if (settingsLocation)
    return (
      <>
        <SettingsView
          location={settingsLocation}
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
        />
        <Toaster toasts={toasts} dismiss={dismiss} />
      </>
    );

  return (
    <div className={`app ${isSidebarVisible(state) ? "" : "sidebar-hidden"}`} style={sidebarWidth.style}>
      {isSidebarVisible(state) && sidebarWidth.resizer}
      {isSidebarVisible(state) && <Sidebar state={state} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} onAddProjectAt={addProjectAt} onOpenSettings={openSettings} onOpenShortcuts={toggleShortcuts} onSearch={() => setPaletteOpen(true)} nav={nav} info={info} onCopyWorkspaceLink={(ws) => copyLink(ws.id)} onError={(message) => show("error", message)} />}
      <main className="main">
        {createPage ? (
          <CreateWorkspacePage
            // A new page for each open, so its draft starts fresh.
            key={JSON.stringify(createPage)}
            repos={state.repos}
            initialRepoId={createPage.repoId}
            sections={state.sections ?? []}
            initialSectionId={createPage.sectionId}
            prefixSettings={prefix.settings}
            githubUsername={prefix.githubUsername}
            sidebarVisible={isSidebarVisible(state)}
            onClose={() => setCreatePage(null)}
            onAddRepository={() => void openProject()}
            onWarning={(message) => show("error", message, { sticky: true })}
            dispatch={dispatch}
          />
        ) : repo && workspace?.status === "archived" ? (
          <ArchivedWorkspaceView repo={repo} workspace={workspace} dispatch={dispatch} />
        ) : repo && workspace ? (
          <WorkspaceView repo={repo} workspace={workspace} dispatch={dispatch} notify={show} />
        ) : sel.kind === "home" ? (
          <AllWorkspaces repos={state.repos} sidebarVisible={isSidebarVisible(state)} dispatch={dispatch} onCreateWorkspace={() => openDialog("create")} />
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
      {dialog === "create" && (
        <CreateWorkspaceDialog
          repos={state.repos}
          initialRepoId={createRepoId}
          sections={state.sections ?? []}
          initialSectionId={createSectionId}
          prefixSettings={prefix.settings}
          githubUsername={prefix.githubUsername}
          onClose={() => setDialog(null)}
          onAddRepository={() => {
            setDialog(null);
            void openProject();
          }}
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
      {shortcutsOpen && <KeyboardShortcutsDialog onClose={() => setShortcutsOpen(false)} overrides={overrides} />}
      <PaletteHost state={state} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} open={paletteOpen} onOpenChange={setPaletteOpen} />
      {archiveOverAgents && (
        <ArchiveRunningDialog
          onClose={() => setArchiveOverAgents(null)}
          onConfirm={() => dispatch({ ...archiveOverAgents, stopRunningAgents: true })}
        />
      )}
      {restoreRequest && <RestoreWorkspaceDialog request={restoreRequest} dispatch={dispatch} onClose={closeRestore} />}
      <Toaster toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
