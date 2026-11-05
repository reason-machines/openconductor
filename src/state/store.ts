import { useEffect, useReducer } from "react";
import type { AppState, Repo, Selection, Workspace } from "./types";
import { newId, workspaceName } from "./names";

const STORAGE_KEY = "openconductor.shell.v1";

export type Action =
  | { type: "select"; selection: Selection }
  | { type: "addRepo"; repo: Omit<Repo, "id" | "workspaces"> }
  | { type: "removeRepo"; repoId: string }
  | { type: "toggleRepo"; repoId: string }
  | { type: "newWorkspace"; repoId: string }
  | { type: "archiveWorkspace"; repoId: string; workspaceId: string }
  | { type: "reset"; state: AppState };

const EMPTY: AppState = { repos: [], selection: { kind: "home" } };

function makeWorkspace(repo: Repo): Workspace {
  const taken = new Set(repo.workspaces.map((w) => w.name));
  const name = workspaceName(taken);
  return { id: newId(), name, branch: name, status: "idle", diff: { added: 0, removed: 0 }, createdAt: Date.now() };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "select":
      return { ...state, selection: action.selection };
    case "addRepo": {
      const existing = state.repos.find((r) => (action.repo.path && r.path === action.repo.path) || (action.repo.remote && r.remote === action.repo.remote));
      if (existing) return state;
      const repo: Repo = { ...action.repo, id: newId(), workspaces: [] };
      const ws = makeWorkspace(repo);
      repo.workspaces.push(ws);
      return { repos: [...state.repos, repo], selection: { kind: "workspace", repoId: repo.id, workspaceId: ws.id } };
    }
    case "removeRepo": {
      const repos = state.repos.filter((r) => r.id !== action.repoId);
      const sel = state.selection.kind === "workspace" && state.selection.repoId === action.repoId ? { kind: "home" as const } : state.selection;
      return { repos, selection: sel };
    }
    case "toggleRepo":
      return { ...state, repos: state.repos.map((r) => (r.id === action.repoId ? { ...r, collapsed: !r.collapsed } : r)) };
    case "newWorkspace": {
      let selection: Selection = state.selection;
      const repos = state.repos.map((r) => {
        if (r.id !== action.repoId) return r;
        const ws = makeWorkspace(r);
        selection = { kind: "workspace", repoId: r.id, workspaceId: ws.id };
        return { ...r, collapsed: false, workspaces: [...r.workspaces, ws] };
      });
      return { repos, selection };
    }
    case "archiveWorkspace": {
      const repos = state.repos.map((r) =>
        r.id === action.repoId ? { ...r, workspaces: r.workspaces.filter((w) => w.id !== action.workspaceId) } : r,
      );
      const sel = state.selection.kind === "workspace" && state.selection.workspaceId === action.workspaceId ? { kind: "home" as const } : state.selection;
      return { repos, selection: sel };
    }
    case "reset":
      return action.state;
  }
}

/** Sample data for screenshots and demos: open the app with `?demo=1`. */
export function demoState(): AppState {
  const ws = (name: string, status: Workspace["status"], added: number, removed: number): Workspace => ({
    id: newId(), name, branch: name, status, diff: { added, removed }, createdAt: Date.now(),
  });
  const repos: Repo[] = [
    {
      id: newId(), name: "openconductor", path: "~/code/openconductor", remote: "https://github.com/example/openconductor", defaultBranch: "main",
      workspaces: [ws("amber-falcon", "working", 128, 14), ws("quiet-harbor", "needs-review", 42, 7), ws("lunar-reef", "idle", 0, 0)],
    },
    { id: newId(), name: "api-server", path: "~/code/api-server", defaultBranch: "main", workspaces: [ws("brisk-otter", "idle", 3, 1)] },
    { id: newId(), name: "design-system", path: "~/code/design-system", defaultBranch: "develop", workspaces: [] },
  ];
  return { repos, selection: { kind: "workspace", repoId: repos[0].id, workspaceId: repos[0].workspaces[0].id } };
}

function load(): AppState {
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1") {
    const s = demoState();
    if (params.get("view") === "home") s.selection = { kind: "home" };
    return s;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* ignore corrupt state */
  }
  return EMPTY;
}

export function useAppStore() {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);
  return [state, dispatch] as const;
}
