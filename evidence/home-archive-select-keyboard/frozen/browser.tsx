import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AllWorkspaces } from "../../src/components/AllWorkspaces";
import { KeybindingsProvider } from "../../src/keybindings/KeybindingsProvider";
import type { Repo } from "../../src/state/types";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";
import "../../src/home.css";
import "../../src/scroll.css";

const repos: Repo[] = ["Alpha", "Beta"].map((name) => ({
  id: "archive-fixture-" + name, name, path: "/fixture/" + name, defaultBranch: "main",
  workspaces: ["active", "archived"].map((status) => ({
    id: name + "-" + status, name: name + " " + status, userSetWorkspaceName: true,
    branch: name.toLowerCase() + "-" + status, status: status === "archived" ? "archived" : "idle",
    diff: { added: 0, removed: 0 }, createdAt: Date.now(),
  })),
}));
function Fixture() {
  const [generation, setGeneration] = useState(0);
  const [actions, setActions] = useState<unknown[]>([]);
  return <div style={{height:"100vh",display:"flex",flexDirection:"column"}}>
    <aside style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
      <strong>Conductor Rebuild · Home archive filter keyboard qualification</strong>
      <p>Synthetic Alpha/Beta active and archived workspaces. Real Home, archive filter and save path. No native, provider, package or original-app runtime claim.</p>
      <button type="button" onClick={() => {
        localStorage.removeItem("openconductor.home.filters.v1");
        setActions([]); setGeneration((value) => value + 1);
      }}>Reset fixture filters</button>
      <button type="button" style={{marginLeft:16}} onClick={() => {
        const current = document.documentElement.dataset.theme;
        document.documentElement.dataset.theme = current === "light" ? "dark" : "light";
      }}>Toggle fixture theme</button>
    </aside>
    <div style={{flex:1,minHeight:0}}>
      <AllWorkspaces key={generation} repos={repos} sidebarVisible dispatch={(action) => setActions((previous) => [...previous, action])} onCreateWorkspace={() => {}} />
    </div>
    <output aria-label="Fixture action count" style={{padding:12}}>Workspace actions: {actions.length}</output>
  </div>;
}
createRoot(document.getElementById("root")!).render(<KeybindingsProvider><Fixture /></KeybindingsProvider>);
