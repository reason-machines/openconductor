import { test } from "node:test";
import assert from "node:assert/strict";
import { promptWrite, PROMPT_ROWS } from "./rowModel.ts";

test("prompt rows show only prompts something here sends", () => {
  assert.deepEqual(PROMPT_ROWS.map((r) => r.kind), ["code_review", "create_pr", "general"]);
});

test("prompt saves write trimmed text, remove blanks and skip no-ops", () => {
  assert.deepEqual(promptWrite("general", undefined, "  Use pnpm. \n"), { key: "prompts.general", value: "Use pnpm." });
  assert.deepEqual(promptWrite("code_review", "Strict.", "   "), { key: "prompts.code_review", value: null });
  assert.equal(promptWrite("create_pr", "Same", " Same "), null);
  assert.equal(promptWrite("create_pr", undefined, ""), null);
});
