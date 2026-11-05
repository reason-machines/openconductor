import { useEffect, useMemo, useState, type Dispatch } from "react";
import type { Action } from "../state/store";
import type { AppState } from "../state/types";
import type { DialogKind } from "../components/Dialogs";
import { CommandPalette } from "./CommandPalette.tsx";
import { useKeybindings } from "../keybindings/KeybindingsProvider.tsx";
import type { CommandHandlers } from "../keybindings/bind.ts";
import { paletteDataFromState, sidebarOrder, stepWorkspace, type WorkspaceRef } from "./fromAppState.ts";
import type { ResultItem } from "./search/model.ts";

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

  const data = useMemo(() => paletteDataFromState(state, recents), [state, recents]);

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
  for (let i = 1; i <= 9; i++) handlers[`workspace.switchTo${i}`] = () => go(sidebarOrder(state)[i - 1]);
  useKeybindings(handlers);

  function onSelect(item: ResultItem) {
    if (item.kind === "workspace") {
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
  return <CommandPalette data={data} onSelect={onSelect} onClose={() => onOpenChange(false)} />;
}
