import type { AppState, Workspace } from "../state/types.ts";
import type { ActionEntry } from "./search/model.ts";

export type GitPanelTarget =
  | { tab: "changes"; scope: "all" | "uncommitted" }
  | { tab: "files" | "checks" };

export const GIT_PANEL_ACTIONS: readonly { entry: ActionEntry; target: GitPanelTarget }[] = [
  { entry: { id: "show-changes", title: "Show changes", group: "workspace-actions", keywords: ["show", "changes", "diff", "git"] }, target: { tab: "changes", scope: "all" } },
  { entry: { id: "show-uncommitted-changes", title: "Show uncommitted changes", group: "workspace-actions", keywords: ["show", "uncommitted", "changes", "diff", "git"] }, target: { tab: "changes", scope: "uncommitted" } },
  { entry: { id: "show-all-files", title: "Show all files", group: "workspace-actions", keywords: ["show", "all", "files", "tree"] }, target: { tab: "files" } },
  { entry: { id: "show-checks", title: "Show checks", group: "workspace-actions", keywords: ["show", "checks", "ci", "pull", "request"] }, target: { tab: "checks" } },
];

export function gitPanelWorkspace(state: AppState): Workspace | undefined {
  const sel = state.selection;
  if (sel.kind !== "workspace") return;
  const workspace = state.repos.find((repo) => repo.id === sel.repoId)?.workspaces.find((row) => row.id === sel.workspaceId);
  return workspace && workspace.status !== "archived" && workspace.state !== "archived" && workspace.state !== "unstarted" ? workspace : undefined;
}

const requests = new Map<string, GitPanelTarget>();
const listeners = new Set<(repoId: string, workspaceId: string) => void>();
const key = (repoId: string, workspaceId: string) => JSON.stringify([repoId, workspaceId]);

export function requestGitPanelAction(actionId: string, state: AppState): void {
  const command = GIT_PANEL_ACTIONS.find(({ entry }) => entry.id === actionId);
  const workspace = gitPanelWorkspace(state);
  if (!command || !workspace || state.selection.kind !== "workspace") return;
  const repoId = state.selection.repoId;
  requests.set(key(repoId, workspace.id), command.target);
  for (const listener of listeners) listener(repoId, workspace.id);
}

export function takeGitPanelRequest(repoId: string, workspaceId: string): GitPanelTarget | undefined {
  const requestKey = key(repoId, workspaceId);
  const request = requests.get(requestKey);
  requests.delete(requestKey);
  return request;
}

export function onGitPanelRequest(listener: (repoId: string, workspaceId: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
