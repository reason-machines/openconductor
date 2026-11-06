import { useCallback, useEffect, useReducer, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppState, Repo, Selection, Workspace } from "./types";
import type { WorkspaceStatusValue } from "./workspaceStatus";
import type { RowPr, SessionStatus } from "./rowStatus";
import { newId, workspaceName } from "./names";
import { isSidebarVisible, startSelection } from "./selectors";
import { inTauri } from "../backend";
import { orderRepos, setRepoHidden } from "./repoOrder";
import { keepPr, parsePrefs, prefsOf, reposFromDb, validSelection, withoutLiveSessions, type DbRepoRow, type DbWorkspaceRow } from "./persisted";
import { sidebarWrite } from "./sidebarPersist";
import { withActivity } from "./nextUnread";
import { withChatUnread, withWorkspaceRead } from "./chatUnread";
import { assignWorkspace, createSection, deleteSection, editSection, nextUpdatedAt, reorderSection, sectionOf, sectionsFromDb, withoutWorkspace, type DbNavSection, type NavSection } from "./navigationSections";
import { sameRepoRecord } from "./addRepo";
import { archiveWorkspace, deleteWorkspace, emitArchiveEvent, startArchive, startUnarchive, rememberBrowserArchived, stopWorkspaceAgents, takeBrowserArchived, unarchiveWorkspace, workspaceAgentStatus, type ArchiveMode } from "../workspace/archive";
import { scriptsConfig, startSetup } from "../scripts/api";
import { workspaceRef } from "../scripts/model";
import { unwatchSetup, watchSetup } from "../workspace/setupWatch";

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
  /**
   * Full archive (`archive_workspace`). `mode` "discardGitOperationState" is the
   * retry from the Git-operation warning; `stopRunningAgents` the confirmed
   * "Stop agents and archive".
   */
  | { type: "archiveWorkspace"; repoId: string; workspaceId: string; mode?: ArchiveMode; stopRunningAgents?: boolean }
  /** The workspace's pull request title or body changed on GitHub (`workspaces.pr_title`, `pr_description`). `prDescription` and `pr` left out keep what the row has. */
  | { type: "setWorkspacePr"; repoId: string; workspaceId: string; prTitle: string | null; prDescription?: string | null; pr?: RowPr | null }
  /** Open an archived workspace from the archived list: read-only, with Unarchive. */
  | { type: "openArchivedWorkspace"; repoId: string; workspace: Workspace }
  /**
   * Unarchive by id (the archived list, the archived workspace's banner and
   * header, the restore dialog's "Restore to new branch" with `useNewBranch`).
   */
  | { type: "unarchiveWorkspace"; repoId: string; workspaceId: string; useNewBranch?: boolean }
  /** "Delete permanently" / "Delete anyway" after a failed archive: drop the row and its folder. */
  | { type: "deleteWorkspace"; repoId: string; workspaceId: string }
  /** The workspace is back in `repos`: stop showing it as archived. */
  | { type: "unarchivedWorkspace"; workspaceId: string }
  /** Put a workspace row back (reducer only; the browser stand-in for unarchive). */
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
  /** A chat's unread flag (`at`: when, ms; it orders Go to next unread). */
  | { type: "setChatUnread"; repoId: string; workspaceId: string; chatId: string; unread: boolean; at: number }
  /** Every chat of the workspace read (the row's "Mark as read"). */
  | { type: "markWorkspaceRead"; repoId: string; workspaceId: string }
  | { type: "setWorkspacePinned"; repoId: string; workspaceId: string; pinned: boolean; at?: number }
  | { type: "setWorkspaceStatus"; repoId: string; workspaceId: string; status: WorkspaceStatusValue }
  /** The user sent a message at `at`: last activity moves forward (chat_messages_save writes the same to conductor.db). */
  | { type: "touchWorkspace"; repoId: string; workspaceId: string; at: number }
  /* sidebar: user sections (navigationSections.ts) */
  | { type: "createSection"; section: NavSection; beforeSectionId?: string }
  | { type: "editSection"; sectionId: string; name: string; emoji?: string }
  | { type: "deleteSection"; sectionId: string }
  /** Drag a section header to `toIndex` (Conductor's `bY`). */
  | { type: "reorderSection"; sectionId: string; toIndex: number }
  /** Move a workspace into `sectionId`, or out of its section with null. */
  | { type: "assignSection"; workspaceId: string; sectionId: string | null }
  | { type: "hydrateSections"; sections: NavSection[]; updatedAt: number }
  /** A PR lookup derived a new status (`workspaces.derived_status`); like the reference, it drops the manual status. */
  | { type: "setWorkspaceDerivedStatus"; repoId: string; workspaceId: string; status: WorkspaceStatusValue };

/** Apply a section edit and stamp the layout, as Conductor's `tve` does. */
function withSections(state: AppState, sections: NavSection[]): AppState {
  return { ...state, sections, sectionsUpdatedAt: nextUpdatedAt(state.sectionsUpdatedAt) };
}

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
      return { ...state, repos, selection: { kind: "workspace", repoId: action.repoId, workspaceId: ws.id } };
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
    case "openArchivedWorkspace":
      return { ...state, archivedOpen: { repoId: action.repoId, workspace: action.workspace }, selection: { kind: "workspace", repoId: action.repoId, workspaceId: action.workspace.id } };
    case "unarchiveWorkspace":
      return state;
    case "unarchivedWorkspace":
      return state.archivedOpen?.workspace.id === action.workspaceId ? { ...state, archivedOpen: undefined } : state;
    case "setWorkspaceTargetBranch":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, targetBranch: action.branch }));
    case "archiveWorkspace":
    case "deleteWorkspace": {
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
      const repos = action.repos.map((r) => ({ ...r, collapsed: r.collapsed || collapsed.has(r.id) || undefined, workspaces: r.workspaces.map((w) => keepPr(w, live.get(w.id))) }));
      const viewingArchived = state.selection.kind === "workspace" && state.archivedOpen?.workspace.id === state.selection.workspaceId;
      return { ...state, repos, selection: viewingArchived ? state.selection : validSelection(state.selection, repos) };
    }
    case "setChatUnread":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => withChatUnread(w, action.chatId, action.unread, action.at));
    case "markWorkspaceRead":
      return updateWorkspace(state, action.repoId, action.workspaceId, withWorkspaceRead);
    case "setWorkspacePinned": {
      const next = updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, pinnedAt: action.pinned ? (action.at ?? Date.now()) : undefined }));
      // Conductor's pin mutation unassigns the workspace from its section first (index-BGEQ8YjU.js @3315700).
      return action.pinned && sectionOf(state.sections, action.workspaceId) ? withSections(next, withoutWorkspace(state.sections ?? [], action.workspaceId)) : next;
    }
    case "setWorkspaceStatus":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, manualStatus: action.status }));
    case "touchWorkspace":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => withActivity(w, action.at));
    case "createSection":
      return withSections(state, createSection(state.sections ?? [], action.section, action.beforeSectionId));
    case "editSection":
      return withSections(state, editSection(state.sections ?? [], { id: action.sectionId, name: action.name, emoji: action.emoji }));
    case "deleteSection":
      return withSections(state, deleteSection(state.sections ?? [], action.sectionId));
    case "reorderSection":
      return withSections(state, reorderSection(state.sections ?? [], action.sectionId, action.toIndex));
    case "assignSection": {
      const next = withSections(state, assignWorkspace(state.sections ?? [], action.workspaceId, action.sectionId));
      if (action.sectionId === null) return next;
      // Conductor unpins a workspace once it is assigned to a section (index `k$t`).
      return { ...next, repos: next.repos.map((r) => ({ ...r, workspaces: r.workspaces.map((w) => (w.id === action.workspaceId && w.pinnedAt !== undefined ? { ...w, pinnedAt: undefined } : w)) })) };
    }
    case "hydrateSections":
      return { ...state, sections: action.sections, sectionsUpdatedAt: action.updatedAt };
    case "setWorkspaceDerivedStatus":
      return updateWorkspace(state, action.repoId, action.workspaceId, (w) => ({ ...w, derivedStatus: action.status, manualStatus: undefined }));
  }
}

const demoPr = (over: Partial<RowPr>): RowPr => ({
  number: 1, isMerged: false, isDraft: false, inMergeQueue: false, mergeState: "BLOCKED", checks: "passing", failingChecks: 0, viewerCanMerge: true, ...over,
});

/** Sample data for screenshots and demos: open the app with `?demo=1`. */
export function demoState(): AppState {
  let number = 0;
  const ws = (name: string, session: SessionStatus, added: number, removed: number): Workspace => ({
    id: newId(), name, branch: name, status: "idle", ...(session !== "idle" ? { sessionStatus: session } : {}), diff: { added, removed }, createdAt: Date.now(), number: ++number,
    // A worktree path so the right panel's All files tab has a tree (demo files outside Tauri).
    path: `/Users/you/conductor/workspaces/openconductor/${name}`,
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
    if (params.get("view") === "dashboard") {
      // The board's columns: PR workspaces derive in-review / done (Conductor's `XDt`), one is in the backlog.
      const derived: Record<string, Workspace["derivedStatus"]> = { "quiet-harbor": "in-review", "copper-wren": "in-review", "misty-larch": "done" };
      s.repos = s.repos.map((r) => ({
        ...r,
        workspaces: r.workspaces.map((w, i) => ({
          ...w,
          derivedStatus: derived[w.name],
          manualStatus: w.name === "brisk-otter" ? "backlog" : undefined,
          updatedAt: Date.now() - (i + 1) * 37 * 60_000,
        })),
      }));
      const repo = params.get("repo");
      s.selection = repo ? { kind: "dashboard", repo } : { kind: "dashboard" };
    }
    if (params.get("sidebar") === "0") s.sidebarVisible = false;
    return s;
  }
  if (inTauri()) {
    // Repos arrive from conductor.db after mount; collapsed ids wait on placeholder rows.
    // First run after the switch: keep the selection and layout the old shell state had.
    const prefs = parsePrefs(localStorage.getItem(PREFS_KEY) ?? legacyPrefs(localStorage.getItem(STORAGE_KEY)));
    const repos = prefs.collapsed.map((id) => ({ id, name: "", path: "", defaultBranch: "", workspaces: [], collapsed: true }));
    return startSelection({ repos, selection: prefs.selection, sidebarVisible: prefs.sidebarVisible }, window.location.pathname, window.location.search);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return startSelection(withoutLiveSessions(JSON.parse(raw) as AppState), window.location.pathname, window.location.search);
  } catch {
    /* ignore corrupt state */
  }
  return startSelection(EMPTY, window.location.pathname, window.location.search);
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

/** The sidebar section layout from conductor.db, or none stored yet. */
export async function loadSectionsFromDb(): Promise<{ sections: NavSection[]; updatedAt: number }> {
  const layout = await invoke<{ sections: DbNavSection[]; updatedAt: number } | null>("db_read_navigation_sections");
  return { sections: sectionsFromDb(layout?.sections ?? []), updatedAt: layout?.updatedAt ?? 0 };
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
  // Sections: read once, then write the whole layout whenever an edit restamps it
  // (Conductor's local backend `WIr` does the same through `tve`).
  const sectionsWrittenAt = useRef<number | undefined>(undefined);
  const reloadSections = useCallback(() => {
    loadSectionsFromDb().then(
      ({ sections, updatedAt }) => {
        sectionsWrittenAt.current = updatedAt;
        rawDispatch({ type: "hydrateSections", sections, updatedAt });
      },
      (err) => console.error("conductor.db: could not read sidebar sections", err),
    );
  }, []);
  useEffect(() => {
    if (desktop) reloadSections();
  }, [desktop, reloadSections]);
  useEffect(() => {
    const at = state.sectionsUpdatedAt;
    if (!desktop || at === undefined || at === sectionsWrittenAt.current) return;
    sectionsWrittenAt.current = at;
    invoke<boolean>("db_write_navigation_sections", { sections: state.sections ?? [], updatedAt: at }).then(
      (written) => {
        // A newer layout is stored (another window wrote it): show that one.
        if (!written) reloadSections();
      },
      (err) => {
        console.error("conductor.db: could not save sidebar sections", err);
        reloadSections();
      },
    );
  }, [desktop, state.sections, state.sectionsUpdatedAt, reloadSections]);
  useEffect(() => {
    if (demo) return;
    if (desktop) localStorage.setItem(PREFS_KEY, JSON.stringify(prefsOf(state)));
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, demo, desktop]);
  // Writes the backend does not already record when its command runs.
  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatch = useCallback(
    (action: Action) => {
      if (action.type === "archiveWorkspace") {
        const ws = stateRef.current.repos.find((r) => r.id === action.repoId)?.workspaces.find((w) => w.id === action.workspaceId);
        void startArchive(action, {
          status: workspaceAgentStatus(action.workspaceId),
          hide: () => {
            if (!desktop && ws) rememberBrowserArchived(action.repoId, ws);
            rawDispatch(action);
          },
          stopAgents: () => stopWorkspaceAgents(action.workspaceId),
          run: desktop ? (mode) => archiveWorkspace(action.workspaceId, mode) : null,
          reload: () => void loadReposFromDb().then((repos) => rawDispatch({ type: "hydrate", repos }), () => undefined),
          emit: emitArchiveEvent,
        });
        return;
      }
      if (action.type === "deleteWorkspace") {
        rawDispatch(action);
        if (desktop)
          deleteWorkspace(action.workspaceId).then(
            () => undefined,
            (err) => {
              console.error("delete_workspace failed", err);
              void loadReposFromDb().then((repos) => rawDispatch({ type: "hydrate", repos }), () => undefined);
            },
          );
        return;
      }
      if (action.type === "unarchiveWorkspace") {
        const { repoId, workspaceId } = action;
        const done = () => rawDispatch({ type: "unarchivedWorkspace", workspaceId });
        if (!desktop) {
          // Browser stand-in: put the archived row back.
          const a = takeBrowserArchived(workspaceId) ?? (stateRef.current.archivedOpen?.workspace.id === workspaceId ? stateRef.current.archivedOpen : undefined);
          void startUnarchive(action, {
            show: () => {
              if (a) rawDispatch({ type: "restoreWorkspace", repoId, workspace: { ...a.workspace, status: "idle", state: "ready" } });
              done();
            },
            run: null,
            setup: () => undefined,
            reload: () => undefined,
            emit: emitArchiveEvent,
          });
          return;
        }
        void startUnarchive(action, {
          show: () => undefined,
          run: () => unarchiveWorkspace(workspaceId, { useNewBranch: action.useNewBranch }),
          // Restored: reload the rows (the workspace is `ready` again, maybe on a new branch), then rerun setup.
          setup: () =>
            void loadReposFromDb().then((repos) => {
              rawDispatch({ type: "hydrate", repos });
              done();
              const repo = repos.find((r) => r.id === repoId);
              const ws = repo?.workspaces.find((w) => w.id === workspaceId);
              if (ws) void rerunSetup(repo, ws);
            }, () => undefined),
          reload: () => void loadReposFromDb().then((repos) => rawDispatch({ type: "hydrate", repos }), () => undefined),
          emit: emitArchiveEvent,
        });
        return;
      }
      rawDispatch(action);
      // Optimistic, as in Conductor: on a failed write, reload the rows the database has.
      const rollback = (what: string) => (err: unknown) => {
        console.error(`conductor.db: could not ${what}`, err);
        loadReposFromDb().then((repos) => rawDispatch({ type: "hydrate", repos }), () => undefined);
      };
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

/** Conductor reruns the setup script after an unarchive; a failure shows through the setup watch. */
async function rerunSetup(repo: Repo | undefined, ws: Workspace): Promise<void> {
  const ref = repo && workspaceRef({ id: repo.id, path: repo.path, defaultBranch: repo.defaultBranch }, { id: ws.id, name: ws.name, path: ws.path });
  if (!ref) return;
  const workspace = { ...ref, targetBranch: ws.targetBranch ?? null };
  try {
    if (!(await scriptsConfig(workspace)).setup) return;
    watchSetup(ws.id);
    if (!(await startSetup(workspace))) unwatchSetup(ws.id);
  } catch {
    unwatchSetup(ws.id);
  }
}
