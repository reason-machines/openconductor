// Pure helpers behind the prompt, git and environment rows (no React, no IPC).
import type { RepoLocalKey } from "../repoSettings.ts";
import type { PromptKind } from "../types.ts";

/** A repository Actions row: Conductor's copy (renderApp registry, `S6e` and the General row). */
export interface PromptRowSpec {
  kind: PromptKind;
  title: string;
  description: string;
  placeholder?: string;
}

/**
 * The Actions prompt rows, in Conductor 0.87.6's order (renderApp registry
 * `Q3a`: five `S6e` rows, then General). Review and Create PR (pr/prompt.rs),
 * Fix errors (fixErrors.ts), Resolve conflicts (`resolve_merge_conflicts_prompt`)
 * and General read the repository value; branch-name generation does not read
 * `prompts.rename_branch` yet, so that row only stores it.
 */
export const PROMPT_ROWS: PromptRowSpec[] = [
  {
    kind: "code_review",
    title: "Code review preferences",
    description: "Add custom instructions sent to the agent when you click the Review button.",
  },
  {
    kind: "create_pr",
    title: "Create PR preferences",
    description: "Add custom instructions sent to the agent when you click the Create PR button.",
  },
  {
    kind: "fix_errors",
    title: "Fix errors preferences",
    description: "Add custom instructions sent to the agent when you click the Fix errors button.",
  },
  {
    kind: "resolve_merge_conflicts",
    title: "Resolve conflicts preferences",
    description: "Add custom instructions sent to the agent when you click the Resolve conflicts button.",
  },
  {
    kind: "rename_branch",
    title: "Branch rename preferences",
    description: "Add custom instructions for generating branch names from your messages.",
  },
  {
    kind: "general",
    title: "General preferences",
    description: "Add custom instructions sent to the agent at the start of every new chat.",
    placeholder: "Add custom instructions for all agents working in this repo.",
  },
];

/** Conductor's default placeholder for the prompt textareas (`vzi`). */
export const PROMPT_PLACEHOLDER =
  "Add your preferences here. The agent will be told to prioritize these instructions over its default instructions.";

/**
 * What saving a prompt textarea writes to the repository local file: the
 * trimmed text, or `null` to remove the key when it is blank (Conductor
 * deletes a blank string setting). `null` result: nothing to write.
 */
export function promptWrite(kind: PromptKind, saved: string | undefined, draft: string): { key: RepoLocalKey; value: string | null } | null {
  const next = draft.trim();
  if (next === (saved ?? "").trim()) return null;
  return { key: `prompts.${kind}`, value: next === "" ? null : next };
}
