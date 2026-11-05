import { useEffect, useMemo, useState, type Dispatch } from "react";
import type { Action } from "../state/store";
import type { AppState } from "../state/types";
import type { DialogKind } from "../components/Dialogs";
import { CommandPalette } from "./CommandPalette.tsx";
import { useKeybindings } from "../keybindings/KeybindingsProvider.tsx";
import type { CommandHandlers } from "../keybindings/bind.ts";
import { paletteDataFromState, shortcutOrder, sidebarOrder, stepWorkspace, type WorkspaceRef } from "./fromAppState.ts";
import type { ResultItem } from "./search/model.ts";
import { listArchivedWorkspaces, type ArchivedWorkspace } from "../workspace/archive";

const RECENT_LIMIT = 8;

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onOpenDialog: (kind: DialogKind) => void;
  /** Native folder picker flow for adding a project. */
  onOpenProject: () => void;
  /** Open state lives in App so the sidebar's Search row can open the palette too. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Owns the palette's open state, recent workspaces and the app's global shortcuts. */
export function PaletteHost({ state, dispatch, onOpenDialog, onOpenProject, open, onOpenChange }: Props) {
  const [recents, setRecents] = useState<string[]>([]);
  const sel = state.selection;
  const selectedId = sel.kind === "workspace" ? sel.workspaceId : null;

  useEffect(() => {
    if (selectedId) setRecents((r) => [selectedId, ...r.filter((id) => id !== selectedId)].slice(0, RECENT_LIMIT));
  }, [selectedId]);

  // parity:sidebar.archived-view: archived workspaces are not in the sidebar
  // state; read them from conductor.db each time the palette opens.
  const [archived, setArchived] = useState<ArchivedWorkspace[]>([]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    listArchivedWorkspaces().then(
      (rows) => live && setArchived(rows),
      (err) => console.error("conductor.db: could not list archived workspaces", err),
    );
    return () => {
      live = false;
    };
  }, [open, state.repos]);
  const data = useMemo(() => paletteDataFromState(state, recents, archived), [state, recents, archived]);
  const archivedById = (id: string) => archived.find((a) => a.id === id);

  const go = (ref: WorkspaceRef | undefined) =>
    ref && dispatch({ type: "select", selection: { kind: "workspace", repoId: ref.repoId, workspaceId: ref.workspace.id } });
  const activeRepoId = sel.kind === "workspace" ? sel.repoId : state.repos[0]?.id;

  const actions: Record<string, () => void> = {
    "archive-workspace": () => sel.kind === "workspace" && dispatch({ type: "archiveWorkspace", repoId: sel.repoId, workspaceId: sel.workspaceId }),
    "new-workspace": () => (activeRepoId ? onOpenDialog("create") : onOpenProject()),
    "add-project": () => onOpenProject(),
    "clone-project": () => onOpenDialog("clone"),
    "quick-start": () => onOpenDialog("quickstart"),
    "go-home": () => dispatch({ type: "select", selection: { kind: "home" } }),
    "next-workspace": () => go(stepWorkspace(state, 1)),
    "previous-workspace": () => go(stepWorkspace(state, -1)),
  };

  // Cmd+N (workspace.create) is bound in App, which owns the Create-workspace dialog.
  const handlers: CommandHandlers = {
    toggleCommandPalette: () => onOpenChange(!open),
    "nav.home": actions["go-home"],
    "workspace.archive": actions["archive-workspace"],
    "workspace.next": actions["next-workspace"],
    "workspace.previous": actions["previous-workspace"],
  };
  for (let i = 1; i <= 9; i++) handlers[`workspace.switchTo${i}`] = () => go(shortcutOrder(state)[i - 1]);
  useKeybindings(handlers);

  function onSelect(item: ResultItem) {
    const gone = item.kind === "workspace" && item.workspace.archived ? archivedById(item.workspace.id) : undefined;
    if (gone) {
      // An archived workspace opens read-only, with Unarchive.
      dispatch({ type: "openArchivedWorkspace", repoId: gone.repoId, workspace: gone.workspace });
    } else if (item.kind === "workspace") {
      const ref = sidebarOrder(state).find((w) => w.workspace.id === item.workspace.id);
      go(ref);
    } else if (item.kind === "project") {
      const repo = state.repos.find((r) => r.id === item.project.id);
      const first = repo?.workspaces[0];
      if (repo && first) go({ repoId: repo.id, workspace: first });
      else if (repo) dispatch({ type: "newWorkspace", repoId: repo.id });
    } else if (item.kind === "action") {
      actions[item.action.id]?.();
    }
  }

  if (!open) return null;
  const unarchive = (id: string) => {
    const a = archivedById(id);
    if (a) dispatch({ type: "unarchiveWorkspace", repoId: a.repoId, workspaceId: a.id });
  };
  return <CommandPalette data={data} onSelect={onSelect} onUnarchive={unarchive} onClose={() => onOpenChange(false)} />;
}
