import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "./state/store";
import { isSidebarVisible } from "./state/selectors";
import { Sidebar } from "./components/Sidebar";
import { HomeScreen } from "./components/HomeScreen";
import { WorkspaceView } from "./components/WorkspaceView";
import { QuickStartDialog, type DialogKind } from "./components/Dialogs";
import { CloneGitHubRepoDialog } from "./components/CloneGitHubRepoDialog";
import { CreateWorkspaceDialog } from "./components/CreateWorkspaceDialog";
import { REPO_EXISTS, findExistingRepo } from "./workspace/repoPicker";
import { loadBranchPrefix } from "./workspace/api";
import { prefixSettingsFromInfo, type BranchPrefixSettings } from "./workspace/naming";
import { Toaster, useToasts } from "./components/Toast";
import { useSetupWatch } from "./workspace/useSetupWatch";
import { QuickOpenDialog } from "./components/QuickOpenDialog";
import { addRepository, appInfo, inspectProjectFolder, inTauri, pickFolder, type AppInfo } from "./backend";
import { decideOpenProject, failedToAddMessage } from "./state/openProject";
import { createFailedMessage } from "./state/githubRepoDialog";
import { GitHubRepoDialog, type GitHubRepoTarget } from "./components/GitHubRepoDialog";
import { PaletteHost } from "./palette/PaletteHost";
import { useKeybindingOverrides, useKeybindings } from "./keybindings/KeybindingsProvider";
import { SettingsView } from "./settings/SettingsView";
import { pageFromPath, type SettingsPage } from "./settings/pages";
import { changeZoom } from "./settings/useSettings";
import { applyAppearance } from "./settings/appearance";
import { errorText, getSettings } from "./settings/api";
import { KeyboardShortcutsDialog } from "./components/KeyboardShortcutsDialog";
import { listen } from "@tauri-apps/api/event";
import { useNavHistory } from "./state/useNavHistory";

export default function App() {
  const [state, dispatch] = useAppStore();
  const nav = useNavHistory(state, dispatch);
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
  // `/settings` or `/settings/user/<page>` starts on that settings page.
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(() => pageFromPath(window.location.pathname));
  const openSettings = useCallback(() => setSettingsPage((p) => p ?? "general"), []);
  const closeSettings = useCallback(() => setSettingsPage(null), []);

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
    dispatch({ type: "addRepo", repo: { name: target.name, path: registered.root, remote, defaultBranch: registered.defaultBranch } });
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
      if (findExistingRepo(state.repos, { path: registered.root, remote: outcome.remote })) return show("error", REPO_EXISTS);
      dispatch({ type: "addRepo", repo: { name: outcome.name, path: registered.root, remote: outcome.remote, defaultBranch: registered.defaultBranch } });
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
    "view.zoomIn": () => void changeZoom("in").catch((e) => show("error", errorText(e))),
    "view.zoomOut": () => void changeZoom("out").catch((e) => show("error", errorText(e))),
    "view.resetZoom": () => void changeZoom("reset").catch((e) => show("error", errorText(e))),
    "nav.back": nav.onBack,
    "nav.forward": nav.onForward,
    "view.toggleLeftSidebar": () => dispatch({ type: "toggleSidebar" }),
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

  if (settingsPage) return <SettingsView page={settingsPage} onNavigate={setSettingsPage} onClose={closeSettings} />;

  return (
    <div className={`app ${isSidebarVisible(state) ? "" : "sidebar-hidden"}`}>
      {isSidebarVisible(state) && <Sidebar state={state} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} onOpenSettings={openSettings} onOpenShortcuts={toggleShortcuts} onSearch={() => setPaletteOpen(true)} nav={nav} info={info} />}
      <main className="main">
        {repo && workspace ? (
          <WorkspaceView repo={repo} workspace={workspace} dispatch={dispatch} />
        ) : (
          <HomeScreen repos={state.repos} sidebarVisible={isSidebarVisible(state)} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} />
        )}
      </main>
      {dialog === "clone" && (
        <CloneGitHubRepoDialog
          onClose={() => setDialog(null)}
          onCloned={(cloned, remote, name) => dispatch({ type: "addRepo", repo: { name, path: cloned.root, remote, defaultBranch: cloned.defaultBranch } })}
        />
      )}
      {dialog === "quickstart" && <QuickStartDialog onClose={() => setDialog(null)} dispatch={dispatch} />}
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
