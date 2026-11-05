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
import { REPO_EXISTS, findExistingRepo } from "./workspace/repoPicker";
import { loadBranchPrefix } from "./workspace/api";
import { prefixSettingsFromInfo, type BranchPrefixSettings } from "./workspace/naming";
import { Toaster, useToasts } from "./components/Toast";
import { useSetupWatch } from "./workspace/useSetupWatch";
import { QuickOpenDialog } from "./components/QuickOpenDialog";
import { FEEDBACK_URL } from "./components/helpMenuItems";
import { addRepository, appInfo, inspectProjectFolder, inTauri, openUrl, pickFolder, type AppInfo } from "./backend";
import { decideOpenProject, failedToAddMessage } from "./state/openProject";
import { createFailedMessage } from "./state/githubRepoDialog";
import { GitHubRepoDialog, type GitHubRepoTarget } from "./components/GitHubRepoDialog";
import { PaletteHost } from "./palette/PaletteHost";
import { useKeybindingOverrides, useKeybindings } from "./keybindings/KeybindingsProvider";
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
  const openDialog = (d: DialogKind, repoId?: string) => {
    setCreateRepoId(repoId ?? (state.selection.kind === "workspace" ? state.selection.repoId : null));
    setDialog(d);
  };
  const [info, setInfo] = useState<AppInfo | null>(null);
  const { toasts, show, dismiss } = useToasts();
  // A setup script the create flow started reports its failure here, after the dialog closed.
  useSetupWatch(useCallback((message: string) => show("error", message), [show]));
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
  const openProject = useCallback(async () => {
    if (!inTauri()) return show("info", "Open project needs the desktop app.");
    try {
      const path = await pickFolder("Select project directory");
      if (!path) return;
      const outcome = decideOpenProject(path, await inspectProjectFolder(path));
      if (outcome.kind === "error") return show("error", failedToAddMessage(outcome.message));
      if (outcome.kind === "needsGitHubRepo") return setGithubRepo({ path: outcome.path, name: outcome.name, needsGitInit: outcome.needsGitInit });
      const registered = await addRepository(outcome.path);
      const existing = findExistingRepo(state.repos, { path: registered.root, remote: outcome.remote });
      // Adding a hidden repository again unhides it (the backend's record_repository does the same).
      if (existing?.hidden) return dispatch({ type: "setRepoHidden", repoId: existing.id, hidden: false });
      if (existing) return show("error", REPO_EXISTS);
      dispatch({ type: "addRepo", id: registered.id, repo: { name: outcome.name, path: registered.root, remote: outcome.remote, defaultBranch: registered.defaultBranch } });
    } catch (err) {
      show("error", failedToAddMessage(err));
    }
  }, [dispatch, show, state.repos]);
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
      {isSidebarVisible(state) && <Sidebar state={state} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} onOpenSettings={openSettings} onOpenShortcuts={toggleShortcuts} onSearch={() => setPaletteOpen(true)} nav={nav} info={info} onError={(message) => show("error", message)} />}
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
      <Toaster toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
