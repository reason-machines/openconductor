// The first workspace Quick start creates for a new project, per
// evidence/screens/create-project.md ("First workspace"). Conductor registers
// the repository without its automatic workspace, then creates one through
// the same path as a plain "New workspace": a generated name, branched from
// the repository's default branch, no first message, and the setup script.

import { buildCreateRequest, newDraft, type CreateRequest } from "../workspace/createFlow.ts";
import { generateWorkspaceNames, type Rng } from "../workspace/naming.ts";
import type { Workspace } from "../state/types.ts";

/** The registered repository the first workspace belongs to. */
export interface RegisteredRepo {
  /** Backend id from `add_repository`. */
  id: string;
  root: string;
  defaultBranch: string;
}

/** Agent fields of the draft; unused because the first workspace has no first message. */
const NO_FIRST_SESSION = { agent: "claude", model: "opus", effort: "high" };

/**
 * The create request for a fresh repository's first workspace: a generated
 * city name (nothing to collide with in a new repository except its default
 * branch), branched from the default branch with the user's branch prefix.
 */
export function firstWorkspaceRequest(repo: RegisteredRepo, prefix: string, rng: Rng): CreateRequest {
  const [generated] = generateWorkspaceNames(1, [repo.defaultBranch], rng);
  const draft = newDraft({ repoId: repo.id, defaultBranch: repo.defaultBranch, cityName: generated.name, ...NO_FIRST_SESSION });
  const built = buildCreateRequest(draft, prefix);
  if (!built.ok) throw new Error(Object.values(built.errors)[0] ?? "Invalid workspace");
  return built.request;
}

/** What `create_workspace` returned that the store needs. */
export interface CreatedWorkspaceInfo {
  workspace: { id: string; directoryName: string; branchName: string; path: string };
  number: number | null;
}

/** The store's `addWorkspace` payload for the created first workspace (as the New workspace dialog builds it). */
export type FirstWorkspace = Pick<Workspace, "id" | "name" | "branch" | "path" | "placeholderBranchName" | "userSetWorkspaceName" | "userSetBranchName" | "number">;

export function toStoreWorkspace(request: CreateRequest, created: CreatedWorkspaceInfo): FirstWorkspace {
  const { id, directoryName, branchName, path } = created.workspace;
  return {
    id,
    name: directoryName,
    branch: branchName,
    path,
    placeholderBranchName: request.naming.placeholder_branch_name === null ? null : branchName,
    userSetWorkspaceName: request.naming.user_set_workspace_name,
    userSetBranchName: request.naming.user_set_branch_name,
    number: created.number ?? null,
  };
}
