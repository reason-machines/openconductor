import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, type Settings } from "../../settings/types.ts";
import { buildReviewPrompt, reasonModelId, reviewDraft, REVIEW_MODEL_FALLBACK, reviewModel, reviewModelSetting, reviewTabTitle } from "./review.ts";

const withModels = (models: Partial<Settings["models"]>): Settings => ({ ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, ...models } });

test("the prompt diffs against the merge base with the target branch, uncommitted work included", () => {
  const p = buildReviewPrompt({ remote: "origin", targetBranch: "release/2.0" });
  assert.match(p, /git merge-base origin\/release\/2\.0 HEAD/);
  assert.match(p, /git diff \$MERGE_BASE HEAD/);
  assert.match(p, /git diff HEAD/);
  assert.match(p, /git status --short/);
  assert.match(p, /Do not edit files/);
  assert.match(p, /file and line/);
  assert.doesNotMatch(p, /review-preferences/, "no preferences section without a custom prompt");
});

test("the repository's review prompt is appended last, trimmed, and wins over the defaults", () => {
  const p = buildReviewPrompt({ remote: "upstream", targetBranch: "main", custom: "  Focus on SQL injection.\n" });
  const tail = p.slice(p.indexOf("## Repository review preferences"));
  assert.ok(p.indexOf("## Answer") < p.indexOf("## Repository review preferences"));
  assert.match(tail, /take precedence/);
  assert.match(tail, /<review-preferences>\nFocus on SQL injection\.\n<\/review-preferences>$/);
  assert.equal(buildReviewPrompt({ remote: "o", targetBranch: "m", custom: "   " }), buildReviewPrompt({ remote: "o", targetBranch: "m" }));
});

test("an unset review model falls back to Conductor's built-in review default, not the chat default", () => {
  assert.equal(REVIEW_MODEL_FALLBACK, "opus-5-1m");
  assert.equal(reviewModelSetting(withModels({ default: "gpt-5.6-sol", review: null })), "opus-5-1m");
  assert.equal(reviewModelSetting(withModels({ review: "  " })), "opus-5-1m");
  assert.equal(reviewModelSetting(withModels({ review: "sonnet-4-6" })), "sonnet-4-6");
});

test("Conductor model ids map to Reason model ids", () => {
  assert.equal(reasonModelId("opus-5-5-1m"), "byok:anthropic:claude-opus-5-5");
  assert.equal(reasonModelId("opus-5-1m"), "byok:anthropic:claude-opus-5");
  assert.equal(reasonModelId("fable-5-1"), "byok:anthropic:claude-fable-5-1");
  assert.equal(reasonModelId("haiku-4-5"), "byok:anthropic:claude-haiku-4-5");
  assert.equal(reasonModelId("gpt-5.6-sol"), "byok:openai-codex:gpt-5.6-sol");
  assert.equal(reasonModelId("byok:anthropic:claude-opus-5-5"), "byok:anthropic:claude-opus-5-5", "a Reason id is kept");
  assert.equal(reasonModelId("openai/gpt-6.1-sol"), "openai/gpt-6.1-sol");
  assert.equal(reasonModelId("opus"), null, "an alias has no fixed Reason id");
  assert.equal(reasonModelId("composer-2.5"), null, "Cursor models do not run on Reason");
  assert.equal(reasonModelId("something-else"), null);
});

test("Claude reviews use the Claude review effort, Codex reviews the Codex one", () => {
  const claude = reviewModel(withModels({ review: "opus-5-5-1m", claude_code: { review_effort_level: "xhigh" } }));
  assert.deepEqual(claude.config, [
    { id: "model", value: "byok:anthropic:claude-opus-5-5" },
    { id: "reasoning_effort", value: "xhigh" },
  ]);
  assert.equal(claude.label, "Opus 5.5");

  const codex = reviewModel(withModels({ review: "gpt-5.6-sol", claude_code: { review_effort_level: "low" }, codex: { default_thinking_level: "low", review_thinking_level: "high" } }));
  assert.deepEqual(codex.config, [
    { id: "model", value: "byok:openai-codex:gpt-5.6-sol" },
    { id: "reasoning_effort", value: "high" },
  ]);
});

test("no effort setting leaves Reason's default; ultracode becomes Reason's top level", () => {
  assert.deepEqual(reviewModel(withModels({})).config, [{ id: "model", value: "byok:anthropic:claude-opus-5" }]);
  assert.equal(reviewModel(withModels({ claude_code: { review_effort_level: "ultracode" } })).effort, "max");
});

test("a model Reason cannot name runs on Reason's default with no options set", () => {
  const r = reviewModel(withModels({ review: "opus" }));
  assert.equal(r.reasonModel, null);
  assert.deepEqual(r.config, []);
  assert.equal(r.label, "Opus 4.8");
  const reason = reviewModel(withModels({ review: "byok:openai-codex:gpt-6-sol", codex: { default_thinking_level: "medium", review_thinking_level: "minimal" } }));
  assert.deepEqual(reason.config, [
    { id: "model", value: "byok:openai-codex:gpt-6-sol" },
    { id: "reasoning_effort", value: "minimal" },
  ]);
});

test("review tabs are numbered after the first", () => {
  assert.equal(reviewTabTitle(1), "Review");
  assert.equal(reviewTabTitle(3), "Review 3");
});

test("edit before sending puts the whole instructions in the draft, without pointing at an attachment", () => {
  const prompt = buildReviewPrompt({ remote: "origin", targetBranch: "main" });
  const draft = reviewDraft(prompt);
  assert.ok(draft.endsWith(prompt));
  assert.doesNotMatch(draft.slice(0, draft.indexOf(prompt)), /attach/i);
});
