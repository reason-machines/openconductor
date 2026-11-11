import { useState, type Dispatch, type SyntheticEvent } from "react";
import { createRoot } from "react-dom/client";
import { AllWorkspaces } from "../../src/components/AllWorkspaces";
import type { Action } from "../../src/state/store";
import type { Repo, Workspace } from "../../src/state/types";
import { emitArchiveEvent, rememberBrowserArchived } from "../../src/workspace/archive";
import "../../src/theme/tokens.css";
import "../../src/styles.css";
import "../../src/home.css";

// Production Home and archive events; controlled dispatch never restores a worktree.
const archived: Workspace = {
  id: "home-unarchive", name: "Archived Home fixture", userSetWorkspaceName: true,
  branch: "archived-home", status: "archived", state: "archived",
  diff: { added: 0, removed: 0 }, createdAt: 1794268800000,
};
const repo: Repo = {
  id: "home-repo", name: "Home fixture", path: "/fixture/home", defaultBranch: "main",
  workspaces: [],
};
for (const workspace of [archived, { ...archived, id: "other-archive", name: "Other archived fixture" }]) {
  rememberBrowserArchived(repo.id, workspace);
}
const action = (workspaceId = archived.id, repoId = repo.id): Extract<Action, { type: "unarchiveWorkspace" }> => ({
  type: "unarchiveWorkspace", repoId, workspaceId,
});

function Fixture() {
  const [actions, setActions] = useState<Action[]>([]);
  const [bubbled, setBubbled] = useState<string[]>([]);
  const dispatch: Dispatch<Action> = (next) => setActions((previous) => [...previous, next]);
  const fail = (workspaceId: string, repoId = repo.id) => emitArchiveEvent<Action>({
    type: "unarchive-failed", action: action(workspaceId, repoId), error: new Error("Controlled fixture failure"),
  });
  const complete = () => emitArchiveEvent<Action>({
    type: "unarchived", action: action(),
    result: { restored: false, branch: null, recreatedBranch: false, restoredChanges: false, notices: [], scenario: null },
  });
  const recordBubble = (event: SyntheticEvent) => {
    if (event.target instanceof Element && event.target.closest(".allws-row")) {
      setBubbled((previous) => [...previous, event.type]);
    }
  };
  return <>
    <section aria-label="Fixture controls">
      <button onClick={() => fail(archived.id)}>Fail matching unarchive</button>
      <button onClick={() => fail("other-archive")}>Fail unrelated unarchive</button>
      <button onClick={() => fail(archived.id, "other-repo")}>Fail other repository unarchive</button>
      <button onClick={complete}>Complete matching unarchive</button>
      <output data-testid="actions">{JSON.stringify(actions)}</output>
      <output data-testid="bubbled">{JSON.stringify(bubbled)}</output>
    </section>
    <main onClick={recordBubble} onKeyDown={(event) => { if (event.key === "Enter") recordBubble(event); }}>
      <AllWorkspaces repos={[repo]} sidebarVisible dispatch={dispatch} onCreateWorkspace={() => undefined} />
    </main>
  </>;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Fixture />);
