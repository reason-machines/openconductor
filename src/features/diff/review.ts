// parity:diff.review:ui parity:pr.ai-review:ui
// The Review action: a new chat that reviews the workspace's changes on the
// review model. Reference (evidence/pr/ai-review.md): Conductor opens a new
// chat session on `review_model` with its effort setting, sends a one-line
// message and attaches the review instructions as "Review request.md"; a
// repository's `custom_prompt_code_review` is appended to the instructions
// and wins over them. The instruction text below is our own.
// Pure: no Tauri, no React, so `review.test.ts` covers it.

import { AGENT_DEFAULT_MODEL } from "../../settings/models.ts";
import { sessionModel, type SessionModel } from "../chat/sessionModel.ts";

export { reasonModelId, type ConfigChoice } from "../chat/sessionModel.ts";
import type { Settings } from "../../settings/types.ts";

/** The user message of a review chat; the instructions go along as an attachment. */
export const REVIEW_MESSAGE = "Review the changes in this workspace, following the attached instructions.";

/** "Edit before sending": the instructions go into the composer as text, so the user can change them. */
export function reviewDraft(prompt: string): string {
  return `Review the changes in this workspace.\n\n${prompt}`;
}

/** File name the instructions are attached under, as in Conductor. */
export const REVIEW_ATTACHMENT = "Review request.md";

export interface ReviewPromptInput {
  /** Remote the target branch lives on, e.g. `origin`. */
  remote: string;
  /** Branch the workspace merges into, e.g. `main`. */
  targetBranch: string;
  /** The repository's code review prompt (`custom_prompt_code_review`), if any. */
  custom?: string | null;
}

/** The review instructions: what to flag, how to get the diff, how to answer, then the repository's preferences. */
export function buildReviewPrompt({ remote, targetBranch, custom }: ReviewPromptInput): string {
  const base = `${remote}/${targetBranch}`;
  const parts = [
    `# Code review

You are reviewing a change another engineer made on this branch, which is meant to merge into \`${base}\`. Do not edit files, commit or push: report findings only.

## What to report

Report a problem only when all of these hold:

- This change introduced it; problems that were already there are out of scope.
- It affects correctness, security, performance or maintainability in a way the author would want to fix.
- It is one concrete, fixable issue, not a general remark about the codebase.
- You can point at the code it breaks. A guess that something elsewhere might be affected is not enough.
- It is not an obvious, intended choice by the author, and fixing it does not ask for more rigor than the rest of the codebase has.

Skip style preferences and nitpicks unless they hide a bug.

## Getting the changes

The review covers every commit on this branch since it left \`${base}\`, plus uncommitted and untracked work:

\`\`\`sh
MERGE_BASE=$(git merge-base ${base} HEAD)
git diff --stat $MERGE_BASE      # what changed, committed and uncommitted
git diff $MERGE_BASE HEAD        # committed changes
git diff HEAD                    # uncommitted changes, staged and unstaged
git status --short               # untracked files (lines starting with ??)
\`\`\`

Read the surrounding code where a change depends on it.

## Answer

List findings by priority, numbered, each with:

- a short title,
- the file and line (\`path/to/file.ts:42\`),
- what goes wrong and when,
- a suggested fix.

If there is nothing worth reporting, say so plainly. End with a one-line verdict on whether the change is ready to merge.`,
  ];
  const own = custom?.trim();
  if (own) {
    parts.push(`## Repository review preferences

These come from the repository's review settings and take precedence over everything above when they disagree.

<review-preferences>
${own}
</review-preferences>`);
  }
  return parts.join("\n\n");
}

/** Conductor's review model when `review_model` is unset (its built-in default, not the chat default). */
export const REVIEW_MODEL_FALLBACK = AGENT_DEFAULT_MODEL.claude;

/** Model, effort and Session options of a review chat. */
export type ReviewModel = SessionModel;

/** The review model setting with Conductor's fallback. */
export function reviewModelSetting(settings: Settings): string {
  return settings.models.review?.trim() || REVIEW_MODEL_FALLBACK;
}

/**
 * Model and effort for a review chat: `models.review` (Conductor's
 * `review_model`), and the effort setting of the agent that runs it,
 * `models.claude_code.review_effort_level` for Claude and
 * `models.codex.review_thinking_level` for Codex.
 */
export function reviewModel(settings: Settings): ReviewModel {
  return sessionModel(reviewModelSetting(settings), (agent) =>
    agent === "claude" ? settings.models.claude_code?.review_effort_level : agent === "codex" ? settings.models.codex.review_thinking_level : null,
  );
}

/** Tab title of the n-th review chat in a workspace (1-based). */
export function reviewTabTitle(n: number): string {
  return n <= 1 ? "Review" : `Review ${n}`;
}
