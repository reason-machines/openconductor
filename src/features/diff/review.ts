// parity:diff.review:ui
// The Review button asks an agent to review the workspace's changes. A repo
// can override the instructions (Conductor keeps them per repo as
// `custom_prompt_code_review`); this default text is our own.
import type { DiffScope } from "./types.ts";

export const DEFAULT_REVIEW_PROMPT =
  "Review the changes in this workspace. Look for bugs, missing tests and unclear code, " +
  "and list concrete findings with file and line. Do not modify files.";

export function buildReviewPrompt(scope: DiffScope, custom?: string | null): string {
  const base = custom?.trim() ? custom.trim() : DEFAULT_REVIEW_PROMPT;
  const what = scope === "uncommitted" ? "Only the uncommitted changes are in scope." : "All changes on this branch versus its base are in scope.";
  return `${base}\n\n${what}`;
}
