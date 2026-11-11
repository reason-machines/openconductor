import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { LinkedDirectoryPicker } from "../../src/features/chat/LinkedDirectoryPicker";
import type { LinkedDirectoryServices } from "../../src/features/chat/linkedDirectoryApi";
import type { Repo, Workspace } from "../../src/state/types";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "dark";
document.documentElement.dataset.colorPalette = "stone";
const workspace = (id: string, branch: string): Workspace => ({ id, name: id, directoryName: id, branch, status: "idle", createdAt: 0, diff: { added: 0, removed: 0 }, path: `/isolated/linked-directory/${id}` });
const repos: Repo[] = [
  { id: "web", name: "tide-web", path: "/isolated/web", defaultBranch: "main", workspaces: [workspace("lisbon", "ada/fix-login-redirect")] },
  { id: "api", name: "tide-api", path: "/isolated/api", defaultBranch: "main", workspaces: [workspace("accra", "ada/pagination-cursor"), workspace("tallinn", "ada/rate-limit-headers")] },
  { id: "dot", name: "dotfiles", path: "/isolated/dotfiles", defaultBranch: "main", workspaces: [workspace("bergen", "ada/zsh-prompt")] },
];
if (params.has("many")) repos[1].workspaces.push(...Array.from({ length: 40 }, (_, i) => workspace(`fixture-${i}`, `ada/fixture-${i}`)));
function Demo() {
  const [open, setOpen] = useState(!params.has("closed"));
  const [chosen, setChosen] = useState("");
  const [inspections, setInspections] = useState<string[]>([]);
  const [services] = useState<LinkedDirectoryServices>(() => ({
    async browse() {
      if (params.get("browse") === "cancel") return null;
      return params.get("browse") === "invalid" ? "https://example.invalid/remote" : "/isolated/browsed-directory";
    },
    async isDirectory(path) {
      setInspections((current) => [...current, path]);
      if (params.get("browse") === "slow") await new Promise((resolve) => setTimeout(resolve, 500));
      if (params.get("browse") === "error") throw new Error("Permission denied");
      return params.get("browse") !== "gone";
    },
  }));
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open picker</button>
    <output data-testid="chosen">{chosen}</output><output data-testid="inspections" hidden>{JSON.stringify(inspections)}</output>
    {open ? <LinkedDirectoryPicker repos={repos} repositoryId="web" onChoose={(path) => { setChosen(path); setOpen(false); }} onClose={() => setOpen(false)} services={services} /> : null}
  </>;
}
ReactDOM.createRoot(document.getElementById("root")!).render(<Demo />);
