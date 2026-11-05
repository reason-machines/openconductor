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
  /** Non-fatal issues to show once the workspace is open ("Set upstream on plain git push"). */
  warnings: string[];
}

export async function createFirstWorkspace(repo: RegisteredRepo): Promise<FirstWorkspaceResult> {
  const { settings, githubUsername } = prefixSettingsFromInfo(await loadBranchPrefix());
  const request = firstWorkspaceRequest(repo, resolveBranchPrefix(settings, githubUsername), Math.random);
  const created = await createWorkspace(toCreateWorkspaceArgs(request));
  const workspace = toStoreWorkspace(request, created);
  await startSetupScript(repo, workspace, request.targetBranch);
  return { workspace, warnings: created.upstreamWarning ? [created.upstreamWarning] : [] };
}

/** Starts the repository's setup script in the new worktree; a setup that fails to start never blocks the workspace. */
async function startSetupScript(repo: RegisteredRepo, ws: FirstWorkspace, targetBranch: string): Promise<void> {
  const ref = workspaceRef({ id: repo.id, path: repo.root, defaultBranch: repo.defaultBranch }, { id: ws.id, name: ws.name, path: ws.path });
  if (!ref) return;
  const workspace = { ...ref, targetBranch: targetBranch || null };
  try {
    if (!(await scriptsConfig(workspace)).setup) return;
    watchSetup(ws.id);
    if (!(await startSetup(workspace))) unwatchSetup(ws.id);
  } catch {
    unwatchSetup(ws.id);
  }
}
