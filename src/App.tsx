import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "./state/store";
import { destroyWorkspaceTerminals } from "./features/terminal/session";
import { isSidebarVisible, removedWorkspaceIds } from "./state/selectors";
import { Sidebar } from "./components/Sidebar";
import { HomeScreen } from "./components/HomeScreen";
import { AllWorkspaces } from "./components/AllWorkspaces";
import "./home.css";
import { WorkspaceView } from "./components/WorkspaceView";
import type { DialogKind } from "./components/Dialogs";
import { CreateProjectDialog } from "./components/CreateProjectDialog";
import { OPEN_IN_GITHUB, SUCCESS_TOAST } from "./state/createProject";
import { CloneGitHubRepoDialog } from "./components/CloneGitHubRepoDialog";
import { CreateWorkspaceDialog } from "./components/CreateWorkspaceDialog";
import { loadBranchPrefix } from "./workspace/api";
import { prefixSettingsFromInfo, type BranchPrefixSettings } from "./workspace/naming";
import { Toaster, useToasts } from "./components/Toast";
import { useArchiveOnMergeWatcher } from "./features/pr/useArchiveOnMerge";
import { useSetupWatch } from "./workspace/useSetupWatch";
import { ArchiveRunningDialog } from "./components/ArchiveRunningDialog";
import { failureToast, onArchiveEvent, unarchiveFailedMessage } from "./workspace/archive";
import type { Action } from "./state/store";
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
import { keptSearch, resolveSettingsUrl, settingsPath, type RouteContext, type SettingsLocation } from "./settings/routes";
import { changeZoom } from "./settings/useSettings";
import { applyAppearance } from "./settings/appearance";
import { errorText, getSettings } from "./settings/api";
import { KeyboardShortcutsDialog } from "./components/KeyboardShortcutsDialog";
import { listen } from "@tauri-apps/api/event";
import { useNavHistory } from "./state/useNavHistory";
import { toggleGarryMode, toggleRightPanel, toggleZenMode, useSidebarVisiblePref, useSidebarWidth } from "./components/panelPrefs";

export default function App() {
  const [state, dispatch] = useAppStore();
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
  // `/create` (or `?dialog=create`) opens the Create-workspace dialog directly.
  const initialDialog = window.location.pathname === "/create" ? "create" : (new URLSearchParams(window.location.search).get("dialog") as DialogKind | null);
  const [dialog, setDialog] = useState<DialogKind | null>(initialDialog);
  const [createRepoId, setCreateRepoId] = useState<string | null>(null);
  const [createSectionId, setCreateSectionId] = useState<string | undefined>(undefined);
  const openDialog = (d: DialogKind, repoId?: string, sectionId?: string) => {
    setCreateRepoId(repoId ?? (state.selection.kind === "workspace" ? state.selection.repoId : null));
    setCreateSectionId(sectionId);
    setDialog(d);
  };
  const [info, setInfo] = useState<AppInfo | null>(null);
  const { toasts, show, dismiss } = useToasts();
  // A setup script the create flow started reports its failure here, after the dialog closed.
  useSetupWatch(useCallback((message: string) => show("error", message), [show]));
  // Archive on merge for workspaces that are not open (the open one reports through its own PR lookup).
  useArchiveOnMergeWatcher({ repos: state.repos, openWorkspaceId: state.selection.kind === "workspace" ? state.selection.workspaceId : null, dispatch, notify: show });
  // Full archive (src/workspace/archive.ts): the running-agents question and
  // what the archive reports, wherever it was started from.
  const [archiveOverAgents, setArchiveOverAgents] = useState<Extract<Action, { type: "archiveWorkspace" }> | null>(null);
  useEffect(
    () =>
      onArchiveEvent<Action>((e) => {
        if (e.type === "agents-running" && e.action.type === "archiveWorkspace") setArchiveOverAgents(e.action);
        if (e.type === "archived" || e.type === "unarchived") for (const n of e.result.notices) show(n.kind, n.message, { sticky: n.kind === "error" });
        if (e.type === "unarchive-failed") show("error", unarchiveFailedMessage(e.error), { sticky: true });
        if (e.type === "failed" && e.action.type === "archiveWorkspace") {
          const retry = { ...e.action, mode: "discardGitOperationState" as const };
          const t = failureToast(e.error, e.mode);
          if (t.kind === "git-operation") {
            show("error", t.message, { sticky: true, action: { label: "Archive", onClick: () => dispatch(retry) } });
          } else {
            show("error", t.message, { sticky: true });
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
  const workspace = sel.kind === "workspace" ? repo?.workspaces.find((w) => w.id === sel.workspaceId) : undefined;
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
    "workspace.create": () => setDialog("create"),
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
  // Re-read each time the dialog opens so a settings change applies to the next create.
  useEffect(() => {
    if (dialog !== "create") return;
    loadBranchPrefix().then((info) => setPrefix(prefixSettingsFromInfo(info))).catch(() => {});
  }, [dialog]);

  useEffect(() => {
    appInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  if (settingsLocation) return <SettingsView location={settingsLocation} repos={state.repos} onNavigate={navigateSettings} onClose={closeSettings} />;

  return (
    <div className={`app ${isSidebarVisible(state) ? "" : "sidebar-hidden"}`} style={sidebarWidth.style}>
      {isSidebarVisible(state) && sidebarWidth.resizer}
      {isSidebarVisible(state) && <Sidebar state={state} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} onAddProjectAt={addProjectAt} onOpenSettings={openSettings} onOpenShortcuts={toggleShortcuts} onSearch={() => setPaletteOpen(true)} nav={nav} info={info} onCopyWorkspaceLink={(ws) => copyLink(ws.id)} onError={(message) => show("error", message)} />}
      <main className="main">
        {repo && workspace ? (
          <WorkspaceView repo={repo} workspace={workspace} dispatch={dispatch} notify={show} />
        ) : sel.kind === "home" ? (
          <AllWorkspaces repos={state.repos} sidebarVisible={isSidebarVisible(state)} dispatch={dispatch} onCreateWorkspace={() => openDialog("create")} />
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
            for (const warning of first.warnings) show("error", warning, { sticky: true });
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
      <Toaster toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
