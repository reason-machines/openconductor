import { useCallback, useEffect, useReducer } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppState, Repo, Selection, Workspace } from "./types";
import type { WorkspaceStatusValue } from "./workspaceStatus";
import type { RowPr, SessionStatus } from "./rowStatus";
import { newId, workspaceName } from "./names";
import { isSidebarVisible, startSelection } from "./selectors";
import { inTauri } from "../backend";
import { orderRepos, setRepoHidden } from "./repoOrder";
import { keepLive, parsePrefs, prefsOf, reposFromDb, validSelection, withSessionStatus, withoutLiveSessions, type DbRepoRow, type DbWorkspaceRow } from "./persisted";
import { sidebarWrite } from "./sidebarPersist";
import { sameRepoRecord } from "./addRepo";

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
      workspace: Pick<Workspace, "id" | "name" | "branch" | "path" | "targetBranch" | "placeholderBranchName" | "userSetWorkspaceName" | "userSetBranchName" | "number">;
    }
  /** `userSet` marks a rename the user made, which blocks the automatic first-message rename. */
  /** `keepPlaceholder`: a name-only rename from the Rename dialog leaves `placeholder_branch_name` alone. */
  | { type: "renameWorkspace"; repoId: string; workspaceId: string; name?: string; branch?: string; userSet?: boolean; keepPlaceholder?: boolean }
  | { type: "archiveWorkspace"; repoId: string; workspaceId: string }
  /** The workspace's pull request title or body changed on GitHub (`workspaces.pr_title`, `pr_description`). `prDescription` and `pr` left out keep what the row has. */
  | { type: "setWorkspacePr"; repoId: string; workspaceId: string; prTitle: string | null; prDescription?: string | null; pr?: RowPr | null }
  /** The open workspace's session status changed (working, cancelling, needs input, ...); the sidebar row and Home show it. */
  | { type: "setWorkspaceSessionStatus"; repoId: string; workspaceId: string; status: SessionStatus }
  /** Unarchive from the archive-on-merge toast: put the workspace back where it was. */
  | { type: "restoreWorkspace"; repoId: string; workspace: Workspace }
  /** The target-branch picker saved `intended_target_branch` (useTargetBranch writes the row). */
  | { type: "setWorkspaceTargetBranch"; repoId: string; workspaceId: string; branch: string }
  | { type: "toggleSidebar" }
  /** Sidebar repo menu: Hide / Unhide repository (`repos.hidden`). */
  | { type: "setRepoHidden"; repoId: string; hidden: boolean }
  /** Sidebar drag and drop: the full repo id list in its new order (`repos.display_order`). */
  | { type: "reorderRepos"; ids: string[] }
  | { type: "setSidebarVisible"; visible: boolean }
  /** Change repository icon (`repos.icon`); null falls back to favicon, avatar, initial. */
  | { type: "setRepoIcon"; repoId: string; icon: string | null }
  | { type: "reset"; state: AppState }
  /** Replace repos and workspaces with the conductor.db rows (desktop app). */
  | { type: "hydrate"; repos: Repo[] }
  /* sidebar: row actions (unread, pin, status) */
  | { type: "setWorkspaceUnread"; repoId: string; workspaceId: string; unread: boolean }
  | { type: "setWorkspacePinned"; repoId: string; workspaceId: string; pinned: boolean; at?: number }
  | { type: "setWorkspaceStatus"; repoId: string; workspaceId: string; status: WorkspaceStatusValue }
  /** A PR lookup derived a new status (`workspaces.derived_status`); like the reference, it drops the manual status. */
  | { type: "setWorkspaceDerivedStatus"; repoId: string; workspaceId: string; status: WorkspaceStatusValue };

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
      if (sameRepoRecord(state.repos, { id: action.id, path: action.repo.path })) return state;
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
              ...(action.keepPlaceholder ? {} : { placeholderBranchName: null }),
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
        const descriptionSame = action.prDescription === undefined || (w.prDescription ?? null) === action.prDescription;
        const prSame = action.pr === undefined || JSON.stringify(w.pr ?? null) === JSON.stringify(action.pr);
        if (titleSame && descriptionSame && prSame) return w;
        return {
          ...w,
          prTitle: action.prTitle,
          ...(action.prDescription === undefined ? {} : { prDescription: action.prDescription }),
          ...(action.pr === undefined ? {} : { pr: action.pr }),
        };
      };
      const repos = state.repos.map((r) => (r.id === action.repoId ? { ...r, workspaces: r.workspaces.map(set) } : r));
      return { ...state, repos };
    }
    case "restoreWorkspace": {
      const repos = state.repos.map((r) =>
        r.id === action.repoId && !r.workspaces.some((w) => w.id === action.workspace.id) ? { ...r, workspaces: [...r.workspaces, action.workspace] } : r,
      );
      return { ...state, repos };
    }
    case "setWorkspaceTargetBranch":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, targetBranch: action.branch }));
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
    case "setSidebarVisible":
      return isSidebarVisible(state) === action.visible ? state : { ...state, sidebarVisible: action.visible };
    case "setRepoIcon":
      return { ...state, repos: state.repos.map((r) => (r.id === action.repoId ? { ...r, icon: action.icon } : r)) };
    case "reset":
      return action.state;
    case "hydrate": {
      const collapsed = new Set(state.repos.filter((r) => r.collapsed).map((r) => r.id));
      // conductor.db has no PR or agent activity: keep what the open workspaces reported.
      const live = new Map(state.repos.flatMap((r) => r.workspaces).map((w) => [w.id, w]));
      const repos = action.repos.map((r) => ({ ...r, collapsed: r.collapsed || collapsed.has(r.id) || undefined, workspaces: r.workspaces.map((w) => keepLive(w, live.get(w.id))) }));
      return { ...state, repos, selection: validSelection(state.selection, repos) };
    }
    case "setWorkspaceUnread":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, unread: action.unread || undefined }));
    case "setWorkspacePinned":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, pinnedAt: action.pinned ? (action.at ?? Date.now()) : undefined }));
    case "setWorkspaceStatus":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, manualStatus: action.status }));
    case "setWorkspaceSessionStatus": {
      const ws = state.repos.find((r) => r.id === action.repoId)?.workspaces.find((w) => w.id === action.workspaceId);
      if (!ws || (ws.sessionStatus ?? "idle") === action.status) return state;
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => withSessionStatus(w, action.status));
    }
    case "setWorkspaceDerivedStatus":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, derivedStatus: action.status, manualStatus: undefined }));
  }
}

const demoPr = (over: Partial<RowPr>): RowPr => ({
  number: 1, isMerged: false, isDraft: false, inMergeQueue: false, mergeState: "BLOCKED", checks: "passing", failingChecks: 0, viewerCanMerge: true, ...over,
});

/** Sample data for screenshots and demos: open the app with `?demo=1`. */
export function demoState(): AppState {
  const ws = (name: string, session: SessionStatus, added: number, removed: number): Workspace => ({
    id: newId(), name, branch: name, status: "idle", ...(session !== "idle" ? { sessionStatus: session } : {}), diff: { added, removed }, createdAt: Date.now(),
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
        ws("tidal-moss", "needs_user_input", 11, 3),
        ws("slate-heron", "needs_user_permission", 5, 0),
      ],
    },
    {
      id: newId(), name: "api-server", path: "~/code/api-server", defaultBranch: "main",
      workspaces: [ws("brisk-otter", "idle", 3, 1), ws("pale-cedar", "waiting", 2, 0), ws("dusk-finch", "cancelling", 0, 0)],
    },
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
    if (raw) return startSelection(withoutLiveSessions(JSON.parse(raw) as AppState), window.location.pathname);
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
      if (desktop && action.type === "restoreWorkspace") {
        invoke("db_unarchive_workspace", { workspaceId: action.workspace.id }).catch(rollback("unarchive workspace"));
      }
      if (desktop && action.type === "setRepoHidden") {
        invoke("db_set_repo_hidden", { repoId: action.repoId, hidden: action.hidden }).catch(rollback("hide repository"));
      }
      if (desktop && action.type === "setRepoIcon") {
        invoke("db_set_repo_icon", { repoId: action.repoId, icon: action.icon }).catch(rollback("change repository icon"));
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
