import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "./state/store";
import { isSidebarVisible } from "./state/selectors";
import { isToggleLeftSidebar, isTypingTarget } from "./state/shortcuts";
import { Sidebar } from "./components/Sidebar";
import { HomeScreen } from "./components/HomeScreen";
import { WorkspaceView } from "./components/WorkspaceView";
import { CloneDialog, QuickStartDialog, type DialogKind } from "./components/Dialogs";
import { CreateWorkspaceDialog } from "./components/CreateWorkspaceDialog";
import { loadBranchPrefix } from "./workspace/api";
import { prefixSettingsFromInfo, type BranchPrefixSettings } from "./workspace/naming";
import { Toaster, useToasts } from "./components/Toast";
import { QuickOpenDialog, QUICK_OPEN_DIALOG_ID } from "./components/QuickOpenDialog";
import { resolveCommand } from "./keybindings/resolve";
import { addRepository, appInfo, inspectProjectFolder, inTauri, pickFolder, type AppInfo } from "./backend";
import { decideOpenProject, failedToAddMessage } from "./state/openProject";
import { PaletteHost } from "./palette/PaletteHost";

export default function App() {
  const [state, dispatch] = useAppStore();
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

  // Open project: native picker straight away, then the backend folder checks.
  const openProject = useCallback(async () => {
    if (!inTauri()) return show("info", "Open project needs the desktop app.");
    try {
      const path = await pickFolder("Select project directory");
      if (!path) return;
      const outcome = decideOpenProject(path, await inspectProjectFolder(path));
      if (outcome.kind === "error") return show("error", failedToAddMessage(outcome.message));
      if (outcome.kind === "needsGitHubRepo") {
        // The "Create a private GitHub repo?" dialog lands in the next PR.
        return show("info", outcome.needsGitInit ? `${outcome.name} is not a git repository yet.` : `${outcome.name} has no origin remote yet.`);
      }
      const registered = await addRepository(outcome.path);
      dispatch({ type: "addRepo", repo: { name: outcome.name, path: registered.root, remote: outcome.remote, defaultBranch: registered.defaultBranch } });
    } catch (err) {
      show("error", failedToAddMessage(err));
    }
  }, [dispatch, show]);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !isToggleLeftSidebar(e, isTypingTarget(document.activeElement as HTMLElement | null))) return;
      e.preventDefault();
      dispatch({ type: "toggleSidebar" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  const sel = state.selection;
  const repo = sel.kind === "workspace" ? state.repos.find((r) => r.id === sel.repoId) : undefined;
  const workspace = sel.kind === "workspace" ? repo?.workspaces.find((w) => w.id === sel.workspaceId) : undefined;
  // Quick open needs an active (not archived) workspace, like the reference.
  const canQuickOpen = !!workspace && workspace.status !== "archived";
  const workspacePath = workspace?.path || repo?.path || (inTauri() ? null : "/demo");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(document.activeElement as HTMLElement | null);
      const ctx = { activeDialogId: quickOpen ? QUICK_OPEN_DIALOG_ID : dialog, typing, inTerminal: false };
      if (resolveCommand(e, ctx, ["nav.quickOpen"]) !== "nav.quickOpen") return;
      e.preventDefault();
      setQuickOpen((open) => !open && canQuickOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickOpen, dialog, canQuickOpen]);

  const [prefix, setPrefix] = useState<{ settings: BranchPrefixSettings; githubUsername: string | null }>({ settings: {}, githubUsername: null });
  // Re-read each time the dialog opens so a settings change applies to the next create.
  useEffect(() => {
    if (dialog !== "create") return;
    loadBranchPrefix().then((info) => setPrefix(prefixSettingsFromInfo(info))).catch(() => {});
  }, [dialog]);

  useEffect(() => {
    appInfo().then(setInfo).catch(() => setInfo(null));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setDialog("create");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  return (
    <div className={`app ${isSidebarVisible(state) ? "" : "sidebar-hidden"}`}>
      {isSidebarVisible(state) && <Sidebar state={state} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} info={info} />}
      <main className="main">
        {repo && workspace ? (
          <WorkspaceView repo={repo} workspace={workspace} dispatch={dispatch} />
        ) : (
          <HomeScreen repos={state.repos} sidebarVisible={isSidebarVisible(state)} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} />
        )}
      </main>
      {dialog === "clone" && <CloneDialog onClose={() => setDialog(null)} dispatch={dispatch} />}
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
      <PaletteHost state={state} dispatch={dispatch} onOpenDialog={openDialog} onOpenProject={openProject} />
      <Toaster toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
