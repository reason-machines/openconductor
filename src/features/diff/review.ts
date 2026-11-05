// parity:diff.review:ui parity:pr.ai-review:ui
// The Review action: a new chat that reviews the workspace's changes on the
// review model. Reference (evidence/pr/ai-review.md): Conductor opens a new
// chat session on `review_model` with its effort setting, sends a one-line
// message and attaches the review instructions as "Review request.md"; a
// repository's `custom_prompt_code_review` is appended to the instructions
// and wins over them. The instruction text below is our own.
// Pure: no Tauri, no React, so `review.test.ts` covers it.

import { agentForModel, AGENT_DEFAULT_MODEL, CLAUDE_ALIASES, modelLabel } from "../../settings/models.ts";
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

/** Reasoning levels a Reason Session offers (`reasoning_effort`). */
const REASON_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];

/** One Reason Session config option, as `reason_open_chat` takes it. */
export interface ConfigChoice {
  id: string;
  value: string;
}

export interface ReviewModel {
  /** The configured review model (a Conductor model id, or a Reason model id). */
  model: string;
  /** Reason's id for it, or null when Reason has no match and its default runs. */
  reasonModel: string | null;
  /** Reasoning level for the review, or null for Reason's default. */
  effort: string | null;
  /** Options for the review chat's Session. */
  config: ConfigChoice[];
  /** Readable name, e.g. "Opus 5". */
  label: string;
}

/** The review model setting with Conductor's fallback. */
export function reviewModelSetting(settings: Settings): string {
  return settings.models.review?.trim() || REVIEW_MODEL_FALLBACK;
}

/**
 * Reason's model id for a Conductor model id: Claude models run as
 * `byok:anthropic:claude-<name>` (Reason has no separate 1M-context ids),
 * Codex models as `byok:openai-codex:<id>`. An id that already names a
 * Reason model (`provider:model` or `provider/model`) is kept. Claude
 * aliases (`opus`, ...), Cursor and unknown ids have no fixed Reason id.
 */
export function reasonModelId(model: string): string | null {
  if (model.includes(":") || model.includes("/")) return model;
  if (CLAUDE_ALIASES.includes(model)) return null;
  switch (agentForModel(model)) {
    case "claude":
      return `byok:anthropic:claude-${model.replace(/-1m$/, "")}`;
    case "codex":
      return `byok:openai-codex:${model}`;
    default:
      return null;
  }
}

/** Reason's reasoning level for a Conductor effort setting; `ultracode` is beyond Reason's top level. */
function reasonEffort(level: unknown): string | null {
  if (typeof level !== "string") return null;
  if (level === "ultracode") return "max";
  return REASON_EFFORTS.includes(level) ? level : null;
}

/**
 * Model and effort for a review chat: `models.review` (Conductor's
 * `review_model`), and the effort setting of the agent that runs it,
 * `models.claude_code.review_effort_level` for Claude and
 * `models.codex.review_thinking_level` for Codex.
 */
export function reviewModel(settings: Settings): ReviewModel {
  const model = reviewModelSetting(settings);
  const reasonModel = reasonModelId(model);
  const agent = agentForModel(model) ?? (reasonModel?.includes("openai-codex") ? "codex" : reasonModel?.includes("anthropic") ? "claude" : null);
  const effort =
    agent === "claude"
      ? reasonEffort(settings.models.claude_code?.review_effort_level)
      : agent === "codex"
        ? reasonEffort(settings.models.codex.review_thinking_level)
        : null;
  const config: ConfigChoice[] = [];
  if (reasonModel) config.push({ id: "model", value: reasonModel });
  if (effort) config.push({ id: "reasoning_effort", value: effort });
  const label = agentForModel(model) ? modelLabel(model) : model;
  return { model, reasonModel, effort, config, label };
}

/** Tab title of the n-th review chat in a workspace (1-based). */
export function reviewTabTitle(n: number): string {
  return n <= 1 ? "Review" : `Review ${n}`;
}
