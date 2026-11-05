import { useEffect, useState } from "react";
import { getAppInfo, type AppInfo } from "./lib/tauri";
import { Sidebar } from "./shell/Sidebar";

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    getAppInfo().then(setInfo, () => setInfo(null));
  }, []);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <div className="empty-state">
          <h1>OpenConductor</h1>
          <p>Run coding agents in parallel, each in its own workspace.</p>
          {info && <p className="muted">v{info.version}</p>}
        </div>
      </main>
    </div>
  );
}
