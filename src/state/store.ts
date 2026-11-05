import { useCallback, useEffect, useReducer } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppState, Repo, Selection, Workspace } from "./types";
import type { WorkspaceStatusValue } from "./workspaceStatus";
import { newId, workspaceName } from "./names";
import { isSidebarVisible } from "./selectors";
import { inTauri } from "../backend";
import { parsePrefs, prefsOf, reposFromDb, validSelection, type DbRepoRow, type DbWorkspaceRow } from "./persisted";
import { sidebarWrite } from "./sidebarPersist";

/** Browser (vite dev, previews): the whole shell state lives here. */
const STORAGE_KEY = "openconductor.shell.v1";
/** Desktop app: UI preferences only; repos and workspaces come from conductor.db. */
const PREFS_KEY = "openconductor.shell.prefs.v1";

export type Action =
  | { type: "select"; selection: Selection }
  /** `id` is the backend repository id; with it no placeholder workspace is made. */
  | { type: "addRepo"; repo: Omit<Repo, "id" | "workspaces">; id?: string }
  | { type: "removeRepo"; repoId: string }
  | { type: "toggleRepo"; repoId: string }
  | { type: "newWorkspace"; repoId: string }
  | {
      type: "addWorkspace";
      repoId: string;
      workspace: Pick<Workspace, "id" | "name" | "branch" | "path" | "placeholderBranchName" | "userSetWorkspaceName" | "userSetBranchName">;
    }
  /** `userSet` marks a rename the user made, which blocks the automatic first-message rename. */
  | { type: "renameWorkspace"; repoId: string; workspaceId: string; name?: string; branch?: string; userSet?: boolean }
  | { type: "archiveWorkspace"; repoId: string; workspaceId: string }
  /** The workspace's pull request title changed on GitHub (`workspaces.pr_title`). */
  | { type: "setWorkspacePr"; repoId: string; workspaceId: string; prTitle: string | null }
  | { type: "toggleSidebar" }
  | { type: "reset"; state: AppState }
  /** Replace repos and workspaces with the conductor.db rows (desktop app). */
  | { type: "hydrate"; repos: Repo[] }
  /* sidebar: row actions (unread, pin, status) */
  | { type: "setWorkspaceUnread"; repoId: string; workspaceId: string; unread: boolean }
  | { type: "setWorkspacePinned"; repoId: string; workspaceId: string; pinned: boolean; at?: number }
  | { type: "setWorkspaceStatus"; repoId: string; workspaceId: string; status: WorkspaceStatusValue };

function updateWorkspace(state: AppState, repoId: string, workspaceId: string, fn: (w: Workspace) => Workspace): AppState {
  const repos = state.repos.map((r) => (r.id !== repoId ? r : { ...r, workspaces: r.workspaces.map((w) => (w.id === workspaceId ? fn(w) : w)) }));
  return { ...state, repos };
}

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
      if (action.id) {
        const repo: Repo = { ...action.repo, id: action.id, workspaces: [] };
        return { ...state, repos: [...state.repos.filter((r) => r.id !== action.id), repo] };
      }
      const repo: Repo = { ...action.repo, id: newId(), workspaces: [] };
      const ws = makeWorkspace(repo);
      repo.workspaces.push(ws);
      return { ...state, repos: [...state.repos, repo], selection: { kind: "workspace", repoId: repo.id, workspaceId: ws.id } };
    }
    case "removeRepo": {
      const repos = state.repos.filter((r) => r.id !== action.repoId);
      const sel = state.selection.kind === "workspace" && state.selection.repoId === action.repoId ? { kind: "home" as const } : state.selection;
      return { ...state, repos, selection: sel };
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
      return { ...state, repos, selection };
    }
    case "addWorkspace": {
      const ws: Workspace = { ...action.workspace, status: "idle", diff: { added: 0, removed: 0 }, createdAt: Date.now() };
      const repos = state.repos.map((r) => (r.id === action.repoId ? { ...r, collapsed: false, workspaces: [...r.workspaces, ws] } : r));
      return { repos, selection: { kind: "workspace", repoId: action.repoId, workspaceId: ws.id } };
    }
    case "renameWorkspace": {
      const rename = (w: Workspace): Workspace =>
        w.id !== action.workspaceId
          ? w
          : {
              ...w,
              name: action.name ?? w.name,
              branch: action.branch ?? w.branch,
              placeholderBranchName: null,
              ...(action.userSet && action.name !== undefined ? { userSetWorkspaceName: true } : {}),
              ...(action.userSet && action.branch !== undefined ? { userSetBranchName: true } : {}),
            };
      const repos = state.repos.map((r) => (r.id === action.repoId ? { ...r, workspaces: r.workspaces.map(rename) } : r));
      return { ...state, repos };
    }
    case "setWorkspacePr": {
      const set = (w: Workspace): Workspace => (w.id === action.workspaceId && (w.prTitle ?? null) !== action.prTitle ? { ...w, prTitle: action.prTitle } : w);
      const repos = state.repos.map((r) => (r.id === action.repoId ? { ...r, workspaces: r.workspaces.map(set) } : r));
      return { ...state, repos };
    }
    case "archiveWorkspace": {
      const repos = state.repos.map((r) =>
        r.id === action.repoId ? { ...r, workspaces: r.workspaces.filter((w) => w.id !== action.workspaceId) } : r,
      );
      const sel = state.selection.kind === "workspace" && state.selection.workspaceId === action.workspaceId ? { kind: "home" as const } : state.selection;
      return { ...state, repos, selection: sel };
    }
    case "toggleSidebar":
      return { ...state, sidebarVisible: !isSidebarVisible(state) };
    case "reset":
      return action.state;
    case "hydrate": {
      const collapsed = new Set(state.repos.filter((r) => r.collapsed).map((r) => r.id));
      const repos = action.repos.map((r) => ({ ...r, collapsed: r.collapsed || collapsed.has(r.id) || undefined }));
      return { ...state, repos, selection: validSelection(state.selection, repos) };
    }
    case "setWorkspaceUnread":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, unread: action.unread || undefined }));
    case "setWorkspacePinned":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, pinnedAt: action.pinned ? (action.at ?? Date.now()) : undefined }));
    case "setWorkspaceStatus":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, manualStatus: action.status }));
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
    if (params.get("sidebar") === "0") s.sidebarVisible = false;
    return s;
  }
  if (inTauri()) {
    // Repos arrive from conductor.db after mount; collapsed ids wait on placeholder rows.
    // First run after the switch: keep the selection and layout the old shell state had.
    const prefs = parsePrefs(localStorage.getItem(PREFS_KEY) ?? legacyPrefs(localStorage.getItem(STORAGE_KEY)));
    const repos = prefs.collapsed.map((id) => ({ id, name: "", path: "", defaultBranch: "", workspaces: [], collapsed: true }));
    return { repos, selection: prefs.selection, sidebarVisible: prefs.sidebarVisible };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* ignore corrupt state */
  }
  return EMPTY;
}

/** UI prefs carried over from the pre-database shell state, as `PREFS_KEY` JSON. */
function legacyPrefs(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(prefsOf(JSON.parse(raw) as AppState));
  } catch {
    return null;
  }
}

/** Repos and workspaces from conductor.db, in sidebar order. */
export async function loadReposFromDb(collapsed: Iterable<string> = []): Promise<Repo[]> {
  const [repos, workspaces] = await Promise.all([
    invoke<DbRepoRow[]>("db_list_repos"),
    invoke<DbWorkspaceRow[]>("db_list_workspaces"),
  ]);
  return reposFromDb(repos, workspaces, collapsed);
}

export function useAppStore() {
  const [state, rawDispatch] = useReducer(reducer, undefined, load);
  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  const desktop = inTauri() && !demo;
  useEffect(() => {
    if (!desktop) return;
    loadReposFromDb().then(
      (repos) => rawDispatch({ type: "hydrate", repos }),
      (err) => console.error("conductor.db: could not list repositories", err),
    );
  }, [desktop]);
  useEffect(() => {
    if (demo) return;
    if (desktop) localStorage.setItem(PREFS_KEY, JSON.stringify(prefsOf(state)));
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, demo, desktop]);
  // Writes the backend does not already record when its command runs.
  const dispatch = useCallback(
    (action: Action) => {
      rawDispatch(action);
      if (desktop && action.type === "archiveWorkspace") {
        invoke("db_archive_workspace", { workspaceId: action.workspaceId }).catch((err) =>
          console.error("conductor.db: could not archive workspace", err),
        );
      }
      const write = desktop ? sidebarWrite(action) : undefined;
      if (write) invoke(write.command, write.args).catch((err) => console.error(`conductor.db: ${write.command} failed`, err));
    },
    [desktop],
  );
  return [state, dispatch] as const;
}
