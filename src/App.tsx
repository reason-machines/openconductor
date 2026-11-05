import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "./state/store";
import { isSidebarVisible } from "./state/selectors";
import { isToggleLeftSidebar, isTypingTarget } from "./state/shortcuts";
import { Sidebar } from "./components/Sidebar";
import { HomeScreen } from "./components/HomeScreen";
import { WorkspaceView } from "./components/WorkspaceView";
import { CloneDialog, QuickStartDialog, type DialogKind } from "./components/Dialogs";
import { Toaster, useToasts } from "./components/Toast";
import { addRepository, appInfo, inspectProjectFolder, inTauri, pickFolder, type AppInfo } from "./backend";
import { decideOpenProject, failedToAddMessage } from "./state/openProject";

export default function App() {
  const [state, dispatch] = useAppStore();
  const initialDialog = new URLSearchParams(window.location.search).get("dialog") as DialogKind | null;
  const [dialog, setDialog] = useState<DialogKind | null>(initialDialog);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !isToggleLeftSidebar(e, isTypingTarget(document.activeElement as HTMLElement | null))) return;
      e.preventDefault();
      dispatch({ type: "toggleSidebar" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  useEffect(() => {
    appInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  const sel = state.selection;
  const repo = sel.kind === "workspace" ? state.repos.find((r) => r.id === sel.repoId) : undefined;
  const workspace = sel.kind === "workspace" ? repo?.workspaces.find((w) => w.id === sel.workspaceId) : undefined;

  return (
    <div className={`app ${isSidebarVisible(state) ? "" : "sidebar-hidden"}`}>
      {isSidebarVisible(state) && <Sidebar state={state} dispatch={dispatch} onOpenProject={openProject} info={info} />}
      <main className="main">
        {repo && workspace ? (
          <WorkspaceView repo={repo} workspace={workspace} dispatch={dispatch} />
        ) : (
          <HomeScreen repos={state.repos} sidebarVisible={isSidebarVisible(state)} dispatch={dispatch} onOpenDialog={setDialog} onOpenProject={openProject} />
        )}
      </main>
      {dialog === "clone" && <CloneDialog onClose={() => setDialog(null)} dispatch={dispatch} />}
      {dialog === "quickstart" && <QuickStartDialog onClose={() => setDialog(null)} dispatch={dispatch} />}
      <Toaster toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
