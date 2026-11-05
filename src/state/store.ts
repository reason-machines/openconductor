import { useCallback, useEffect, useReducer } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppState, Repo, Selection, Workspace } from "./types";
import type { WorkspaceStatusValue } from "./workspaceStatus";
import type { RowPr } from "./rowStatus";
import { newId, workspaceName } from "./names";
import { isSidebarVisible, startSelection } from "./selectors";
import { inTauri } from "../backend";
import { orderRepos, setRepoHidden } from "./repoOrder";
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
      workspace: Pick<Workspace, "id" | "name" | "branch" | "path" | "placeholderBranchName" | "userSetWorkspaceName" | "userSetBranchName" | "number">;
    }
  /** `userSet` marks a rename the user made, which blocks the automatic first-message rename. */
  | { type: "renameWorkspace"; repoId: string; workspaceId: string; name?: string; branch?: string; userSet?: boolean }
  | { type: "archiveWorkspace"; repoId: string; workspaceId: string }
  /** The workspace's pull request title changed on GitHub (`workspaces.pr_title`). */
  | { type: "setWorkspacePr"; repoId: string; workspaceId: string; prTitle: string | null; pr?: RowPr | null }
  /** The open workspace's agent started or finished a turn; the sidebar row shows it working. */
  | { type: "setWorkspaceWorking"; repoId: string; workspaceId: string; working: boolean }
  | { type: "toggleSidebar" }
  /** Sidebar repo menu: Hide / Unhide repository (`repos.hidden`). */
  | { type: "setRepoHidden"; repoId: string; hidden: boolean }
  /** Sidebar drag and drop: the full repo id list in its new order (`repos.display_order`). */
  | { type: "reorderRepos"; ids: string[] }
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

const EMPTY: AppState = { repos: [], selection: { kind: "root" } };

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
      const sel = state.selection.kind === "workspace" && state.selection.repoId === action.repoId ? { kind: "root" as const } : state.selection;
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
      const set = (w: Workspace): Workspace => {
        if (w.id !== action.workspaceId) return w;
        const titleSame = (w.prTitle ?? null) === action.prTitle;
        const prSame = action.pr === undefined || JSON.stringify(w.pr ?? null) === JSON.stringify(action.pr);
        if (titleSame && prSame) return w;
        return { ...w, prTitle: action.prTitle, ...(action.pr === undefined ? {} : { pr: action.pr }) };
      };
      const repos = state.repos.map((r) => (r.id === action.repoId ? { ...r, workspaces: r.workspaces.map(set) } : r));
      return { ...state, repos };
    }
    case "archiveWorkspace": {
      const repos = state.repos.map((r) =>
        r.id === action.repoId ? { ...r, workspaces: r.workspaces.filter((w) => w.id !== action.workspaceId) } : r,
      );
      const sel = state.selection.kind === "workspace" && state.selection.workspaceId === action.workspaceId ? { kind: "root" as const } : state.selection;
      return { ...state, repos, selection: sel };
    }
    case "toggleSidebar":
      return { ...state, sidebarVisible: !isSidebarVisible(state) };
    case "setRepoHidden":
      return { ...state, repos: setRepoHidden(state.repos, action.repoId, action.hidden) };
    case "reorderRepos":
      return { ...state, repos: orderRepos(state.repos, action.ids) };
    case "reset":
      return action.state;
    case "hydrate": {
      const collapsed = new Set(state.repos.filter((r) => r.collapsed).map((r) => r.id));
      // conductor.db has no PR or agent activity: keep what the open workspaces reported.
      const live = new Map(state.repos.flatMap((r) => r.workspaces).map((w) => [w.id, w]));
      const keepLive = (w: Workspace): Workspace => {
        const old = live.get(w.id);
        return old ? { ...w, status: old.status, ...(old.pr !== undefined ? { pr: old.pr } : {}) } : w;
      };
      const repos = action.repos.map((r) => ({ ...r, collapsed: r.collapsed || collapsed.has(r.id) || undefined, workspaces: r.workspaces.map(keepLive) }));
      return { ...state, repos, selection: validSelection(state.selection, repos) };
    }
    case "setWorkspaceUnread":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, unread: action.unread || undefined }));
    case "setWorkspacePinned":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, pinnedAt: action.pinned ? (action.at ?? Date.now()) : undefined }));
    case "setWorkspaceStatus":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, manualStatus: action.status }));
    case "setWorkspaceWorking": {
      const status: Workspace["status"] = action.working ? "working" : "idle";
      const ws = state.repos.find((r) => r.id === action.repoId)?.workspaces.find((w) => w.id === action.workspaceId);
      if (!ws || ws.status === status) return state;
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, status }));
    }
  }
}

const demoPr = (over: Partial<RowPr>): RowPr => ({
  number: 1, isMerged: false, isDraft: false, inMergeQueue: false, mergeState: "BLOCKED", checks: "passing", failingChecks: 0, viewerCanMerge: true, ...over,
});

/** Sample data for screenshots and demos: open the app with `?demo=1`. */
export function demoState(): AppState {
  const ws = (name: string, status: Workspace["status"], added: number, removed: number): Workspace => ({
    id: newId(), name, branch: name, status, diff: { added, removed }, createdAt: Date.now(),
  });
  const repos: Repo[] = [
    {
      id: newId(), name: "openconductor", path: "~/code/openconductor", remote: "https://github.com/example/openconductor", defaultBranch: "main",
      workspaces: [
        ws("amber-falcon", "working", 128, 14),
        { ...ws("quiet-harbor", "idle", 42, 7), pr: demoPr({ number: 12, mergeState: "CLEAN" }) },
        { ...ws("copper-wren", "idle", 18, 2), pr: demoPr({ number: 14, checks: "failing", failingChecks: 1 }) },
        { ...ws("misty-larch", "idle", 6, 0), pr: demoPr({ number: 9, isMerged: true }) },
        ws("lunar-reef", "working", 0, 0),
      ],
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
    if (params.get("view") === "root") s.selection = { kind: "root" };
    if (params.get("sidebar") === "0") s.sidebarVisible = false;
    return s;
  }
  if (inTauri()) {
    // Repos arrive from conductor.db after mount; collapsed ids wait on placeholder rows.
    // First run after the switch: keep the selection and layout the old shell state had.
    const prefs = parsePrefs(localStorage.getItem(PREFS_KEY) ?? legacyPrefs(localStorage.getItem(STORAGE_KEY)));
    const repos = prefs.collapsed.map((id) => ({ id, name: "", path: "", defaultBranch: "", workspaces: [], collapsed: true }));
    return startSelection({ repos, selection: prefs.selection, sidebarVisible: prefs.sidebarVisible }, window.location.pathname);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return startSelection(JSON.parse(raw) as AppState, window.location.pathname);
  } catch {
    /* ignore corrupt state */
  }
  return startSelection(EMPTY, window.location.pathname);
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
      // Optimistic, as in Conductor: on a failed write, reload the rows the database has.
      const rollback = (what: string) => (err: unknown) => {
        console.error(`conductor.db: could not ${what}`, err);
        loadReposFromDb().then((repos) => rawDispatch({ type: "hydrate", repos }), () => undefined);
      };
      if (desktop && action.type === "setRepoHidden") {
        invoke("db_set_repo_hidden", { repoId: action.repoId, hidden: action.hidden }).catch(rollback("hide repository"));
      }
      if (desktop && action.type === "reorderRepos") {
        invoke("db_reorder_repos", { ids: action.ids }).catch(rollback("reorder repositories"));
      }
      const write = desktop ? sidebarWrite(action) : undefined;
      if (write) invoke(write.command, write.args).catch((err) => console.error(`conductor.db: ${write.command} failed`, err));
    },
    [desktop],
  );
  return [state, dispatch] as const;
}
