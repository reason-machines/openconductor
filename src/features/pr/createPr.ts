// parity:pr.create:ui
// What Create PR asks the agent for, gathered as the reference does
// (index @ ~3,212,900, `gNt`, REA-extracted, read as data): the workspace's
// stored PR title and description, the repository's PR template from the
// checkout, and the repository's Create PR custom instructions. When the
// repository row has no Create PR prompt, `repoPath` / `workspacePath` let
// `pr_create_prompt` fall back to the effective `prompts.create_pr` of the
// settings files (user, repository, workspace).
import { prTemplate, repoPrompt } from "./api.ts";
import type { CreatePrPrompt } from "./types.ts";

export interface CreatePrInputs {
  branch: string;
  remote: string;
  targetBranch: string;
  draft: boolean;
  /** Workspace checkout, where the PR template is read; null before it exists. */
  worktree: string | null;
  /** Repository id in conductor.db, for `custom_prompt_create_pr`. */
  repoId: string;
  /** The repository's main checkout, where `pr_create_prompt` reads its settings files. */
  repoPath: string | null;
  /** `workspaces.pr_title` / `pr_description`; used verbatim when set. */
  title?: string | null;
  description?: string | null;
}

export interface CreatePrSources {
  template: (worktree: string) => Promise<string | null>;
  customInstructions: (repoId: string) => Promise<string | null>;
}

const defaultSources: CreatePrSources = {
  template: prTemplate,
  customInstructions: (repoId) => repoPrompt(repoId, "createPR"),
};

/** The `pr_create_prompt` request for Create PR. */
export async function createPrRequest(i: CreatePrInputs, sources: CreatePrSources = defaultSources): Promise<CreatePrPrompt> {
  const [template, customInstructions] = await Promise.all([
    i.worktree ? sources.template(i.worktree) : Promise.resolve(null),
    sources.customInstructions(i.repoId),
  ]);
  return {
    branch: i.branch,
    remote: i.remote,
    targetBranch: i.targetBranch,
    draft: i.draft,
    title: i.title ?? null,
    description: i.description ?? null,
    template,
    customInstructions,
    repoPath: i.repoPath || null,
    workspacePath: i.worktree,
  };
}
