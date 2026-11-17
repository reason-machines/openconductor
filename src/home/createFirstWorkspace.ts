// Creates a new project's first workspace through the workspace lifecycle
// backend (`create_workspace`, then the repository's setup script), as
// Conductor's Quick start does after "Creating workspace...". The pure parts
// live in firstWorkspace.ts.

import { createWorkspace, loadBranchPrefix } from "../workspace/api";
import { prefixSettingsFromInfo, resolveBranchPrefix } from "../workspace/naming";
import { toCreateWorkspaceArgs } from "../workspace/createFlow";
import { scriptsConfig, startSetup } from "../scripts/api";
import { workspaceRef } from "../scripts/model";
import { unwatchSetup, watchSetup } from "../workspace/setupWatch";
import { firstWorkspaceRequest, toStoreWorkspace, type FirstWorkspace, type RegisteredRepo } from "./firstWorkspace";

export interface FirstWorkspaceResult {
  workspace: FirstWorkspace;
  /** True when the repository's setup script was started; false when no script is configured or the start failed. */
  setupStarted: boolean;
}

export async function createFirstWorkspace(repo: RegisteredRepo): Promise<FirstWorkspaceResult> {
  const { settings, githubUsername } = prefixSettingsFromInfo(await loadBranchPrefix());
  const request = firstWorkspaceRequest(repo, resolveBranchPrefix(settings, githubUsername), Math.random);
  const created = await createWorkspace(toCreateWorkspaceArgs(request));
  const workspace = toStoreWorkspace(request, created);
  const setupStarted = await startSetupScript(repo, workspace, request.targetBranch);
  // Non-fatal initialization issues reach the toast through createWorkspace (initIssues).
  return { workspace, setupStarted };
}

/**
 * Starts the repository's setup script in the new worktree.
 * Returns true when the script was started, false when no setup is configured,
 * the workspace ref is unresolvable, or the start call failed.
 * A setup that fails to start never blocks the workspace.
 */
export async function startSetupScript(repo: RegisteredRepo, ws: Pick<FirstWorkspace, "id" | "name" | "path">, targetBranch: string): Promise<boolean> {
  const ref = workspaceRef({ id: repo.id, path: repo.root, defaultBranch: repo.defaultBranch }, { id: ws.id, name: ws.name, path: ws.path });
  if (!ref) return false;
  const workspace = { ...ref, targetBranch: targetBranch || null };
  try {
    if (!(await scriptsConfig(workspace)).setup) return false;
    watchSetup(ws.id);
    const started = await startSetup(workspace);
    if (!started) unwatchSetup(ws.id);
    return started;
  } catch {
    unwatchSetup(ws.id);
    return false;
  }
}
