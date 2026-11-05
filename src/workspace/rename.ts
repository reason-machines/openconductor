// Pure first-message rename: turns the first message into a branch-like name and
// plans the placeholder -> generated rename for a workspace in the app state.
// Evidence and our own choices: evidence/create-workspace/README.md.

import type { Repo, Workspace } from "../state/types.ts";
import { planFirstMessageRename, slugify, type RenamePlan, type WorkspaceNaming } from "./naming.ts";

const FILLER = /^(?:please|pls|hey|hi|ok|okay|so|can you|could you|would you|will you|i want to|i'd like to|i need to|we need to|let's|lets|help me|help us|go ahead and|try to)(?:[\s,.!:;]+|$)/i;

const STOPWORDS = new Set([
  "a", "an", "the", "to", "of", "for", "in", "on", "at", "by", "and", "or", "with", "from", "into",
  "my", "our", "your", "this", "that", "these", "those", "it", "its", "is", "are", "be", "some", "please",
]);

/** Most words kept in a generated branch name. */
export const MAX_NAME_WORDS = 4;

/**
 * Branch-like name from the first message, e.g. "Can you fix the login redirect
 * bug?" -> `fix-login-redirect-bug`. Uses the first line with words, drops
 * URLs, code, filler and stopwords. Empty when nothing usable is left.
 */
export function branchNameFromMessage(message: string): string {
  const line =
    message
      .replace(/```[\s\S]*?(```|$)/g, " ")
      .split("\n")
      .map((l) => l.replace(/`[^`]*`/g, " ").replace(/\bhttps?:\/\/\S+/g, " ").trim())
      .find((l) => /[\p{L}\p{N}]/u.test(l)) ?? "";
  let text = line.replace(/^[#>*\-\s]+/, "");
  for (let prev = ""; prev !== text; ) {
    prev = text;
    text = text.replace(FILLER, "");
  }
  const words = slugify(text)
    .split("-")
    .filter((w) => w && !STOPWORDS.has(w));
  return words.slice(0, MAX_NAME_WORDS).join("-");
}

/** The `workspaces` naming columns for a workspace in the app state. */
export function namingOf(ws: Workspace): WorkspaceNaming {
  return {
    workspace_name: ws.name,
    branch: ws.branch,
    placeholder_branch_name: ws.placeholderBranchName ?? null,
    user_set_workspace_name: !!ws.userSetWorkspaceName,
    user_set_branch_name: !!ws.userSetBranchName,
  };
}

/** Prefix the placeholder branch was created with, so the rename keeps it: `sven/petra` -> `sven/`. */
export function prefixOf(placeholderBranch: string): string {
  return placeholderBranch.slice(0, placeholderBranch.lastIndexOf("/") + 1);
}

/**
 * Rename to apply after `ws` gets its first message. Names and branches of the
 * repo's other workspaces stay unique (`-v1`, `-v2`, ...). Empty when the
 * workspace is no longer a placeholder or the message gives no name.
 */
export function planWorkspaceRename(repo: Repo, ws: Workspace, message: string, autoRenameWorkspace = true): RenamePlan {
  const naming = namingOf(ws);
  if (naming.placeholder_branch_name === null) return {};
  const others = repo.workspaces.filter((w) => w.id !== ws.id);
  return planFirstMessageRename(naming, {
    generated: branchNameFromMessage(message),
    prefix: prefixOf(naming.placeholder_branch_name),
    autoRenameWorkspace,
    takenBranches: others.map((w) => w.branch),
    takenWorkspaceNames: others.map((w) => w.name),
  });
}
