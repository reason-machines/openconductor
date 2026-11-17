import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CommandPalette } from "../../../src/palette/CommandPalette";
import type { PaletteData } from "../../../src/palette/search/model";
import type { Repo, Workspace } from "../../../src/state/types";
import type { ArchivedWorkspace } from "../../../src/workspace/archivedList";
import "../../../src/theme/tokens.css";
import "../../../src/styles.css";

const workspace = (id: string, archived = false): Workspace => ({
  id, name: id, userSetWorkspaceName: true, branch: `feature/${id}`, status: archived ? "archived" : "idle",
  diff: { added: 0, removed: 0 }, createdAt: Date.now() - 3600000,
});
const repos: Repo[] = ["Atlas", "Boreal"].map((name) => ({
  id: name.toLowerCase(), name, path: `/synthetic/${name}`, defaultBranch: "main", workspaces: [workspace(`${name} active`)],
}));
const archived: ArchivedWorkspace[] = repos.map((repo) => {
  const ws = workspace(`${repo.name} archived`, true);
  return { id: ws.id, repoId: repo.id, name: ws.name, branch: ws.branch, createdAt: ws.createdAt, workspace: ws };
});
const data: PaletteData = {
  actions: [{ id: "view-archived-workspaces", title: "View archived workspaces", group: "navigation" }],
  settings: [], workspaces: [], projects: [], recentWorkspaceIds: [], activeWorkspaceId: "Atlas active",
};

function Fixture() {
  const [open, setOpen] = useState(true);
  return <>
    <main style={{ padding: 32 }}>
      <h1>Archived workspace filter regression</h1>
      <p>Isolated actual CommandPalette component with two synthetic local projects. No native backend.</p>
      <button type="button" onClick={() => setOpen(true)}>Open palette</button>
    </main>
    {open && <CommandPalette data={data} repos={repos} archived={archived} onSelect={() => setOpen(false)} onClose={() => setOpen(false)} />}
  </>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Fixture root missing");
createRoot(root).render(<Fixture />);
