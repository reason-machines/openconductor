import { useEffect, useState } from "react";
import { isSidebarVisible, useAppStore } from "./state/store";
import { Sidebar } from "./components/Sidebar";
import { HomeScreen } from "./components/HomeScreen";
import { WorkspaceView } from "./components/WorkspaceView";
import { OpenProjectDialog, CloneDialog, QuickStartDialog, type DialogKind } from "./components/Dialogs";
import { appInfo, type AppInfo } from "./backend";

export default function App() {
  const [state, dispatch] = useAppStore();
  const initialDialog = new URLSearchParams(window.location.search).get("dialog") as DialogKind | null;
  const [dialog, setDialog] = useState<DialogKind | null>(initialDialog);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    appInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  const sel = state.selection;
  const repo = sel.kind === "workspace" ? state.repos.find((r) => r.id === sel.repoId) : undefined;
  const workspace = sel.kind === "workspace" ? repo?.workspaces.find((w) => w.id === sel.workspaceId) : undefined;

  return (
    <div className={`app ${isSidebarVisible(state) ? "" : "sidebar-hidden"}`}>
      {isSidebarVisible(state) && <Sidebar state={state} dispatch={dispatch} onOpenDialog={setDialog} info={info} />}
      <main className="main">
        {repo && workspace ? (
          <WorkspaceView repo={repo} workspace={workspace} dispatch={dispatch} />
        ) : (
          <HomeScreen repos={state.repos} sidebarVisible={isSidebarVisible(state)} dispatch={dispatch} onOpenDialog={setDialog} />
        )}
      </main>
      {dialog === "open" && <OpenProjectDialog onClose={() => setDialog(null)} dispatch={dispatch} />}
      {dialog === "clone" && <CloneDialog onClose={() => setDialog(null)} dispatch={dispatch} />}
      {dialog === "quickstart" && <QuickStartDialog onClose={() => setDialog(null)} dispatch={dispatch} />}
    </div>
  );
}
