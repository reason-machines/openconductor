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

const repos: Repo[] = ["Alpha", "Beta", "Bravo"].map((name) => ({
  id: "keyboard-" + name, name, path: "/fixture/" + name, defaultBranch: "main",
  workspaces: [{ id: "workspace-" + name, name: "Working " + name, userSetWorkspaceName: true,
    branch: "work-" + name, status: "idle", diff: { added: 0, removed: 0 }, createdAt: Date.now() }],
}));
function Fixture() {
  const [actions, setActions] = useState<unknown[]>([]);
  const [focus, setFocus] = useState("");
  return <div onFocusCapture={(event) => {
    const target = event.target as HTMLElement;
    setFocus(target.getAttribute("aria-label") ?? target.textContent ?? target.tagName);
  }}>
    <aside style={{ padding: 16, borderBottom: "1px solid var(--border)", fontSize: 12, lineHeight: 1.8 }}>
      <strong>Conductor Rebuild · bounded Projects keyboard fixture</strong>
      <p>Focus Projects, then use ↑/↓, Home/End and case-insensitive prefix typing. Enter/Space toggle projects without closing the menu. Supplied repositories/archive adapter; real Home component and filter save path. Not native, installed persistence, reference-interaction or package acceptance.</p>
      <span aria-label="Fixture focus readback">Focus: {focus}</span>
    </aside>
    <AllWorkspaces repos={repos} sidebarVisible dispatch={(action) => setActions((previous) => [...previous, action])} onCreateWorkspace={() => {}} />
    <pre aria-label="Fixture selection log" style={{ padding: 16, whiteSpace: "pre-wrap" }}>{JSON.stringify(actions, null, 2)}</pre>
  </div>;
}
createRoot(document.getElementById("root")!).render(<KeybindingsProvider><Fixture /></KeybindingsProvider>);
