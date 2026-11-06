import assert from "node:assert/strict";
import { test } from "node:test";
import { thinkingChipText } from "./thinkingChip.ts";

test("the collapsed Thinking chip shows the bold title without its Markdown markers", () => {
  assert.equal(thinkingChipText("**Responding concisely** Keep the answer short."), "Responding concisely Keep the answer short.");
  assert.equal(thinkingChipText("  __Planning__\n\nBody  "), "Planning\n\nBody");
  assert.equal(thinkingChipText("plain text"), "plain text");
});
