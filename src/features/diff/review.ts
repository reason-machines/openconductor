// parity:diff.review:ui
// The Review button asks an agent to review the workspace's changes. The
// effective `prompts.code_review` (user, then repository settings files) is
// appended after the default, as Conductor's `gue` does; this default text is
// our own.
import type { DiffScope } from "./types.ts";
import { withUserPreferences } from "../../settings/prompts.ts";

export const DEFAULT_REVIEW_PROMPT =
  "Review the changes in this workspace. Look for bugs, missing tests and unclear code, " +
  "and list concrete findings with file and line. Do not modify files.";

export function buildReviewPrompt(scope: DiffScope, custom?: string | null): string {
  const what = scope === "uncommitted" ? "Only the uncommitted changes are in scope." : "All changes on this branch versus its base are in scope.";
  return withUserPreferences(`${DEFAULT_REVIEW_PROMPT}\n\n${what}`, custom);
}
