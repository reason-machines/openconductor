import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantDisplayText } from "./assistantText.ts";

for (const prefix of [
  "You're absolutely right! ",
  "You're absolutely right.\n\n",
  "You're absolutely right -\t",
  "You're absolutely right –\n",
  "You're absolutely right ",
]) {
  test(`enabled display strips the anchored prefix ${JSON.stringify(prefix)}`, () => {
    assert.equal(assistantDisplayText(`${prefix}Keep this.`, true), "Keep this.");
  });
  test(`disabled display keeps ${JSON.stringify(prefix)} byte-identical`, () => {
    const original = `${prefix}Keep this.`;
    assert.equal(assistantDisplayText(original, false), original);
  });
}

test("enabled display preserves case-insensitive matching", () => {
  assert.equal(assistantDisplayText("yOu'RE aBsOlUtElY rIgHt!\nKeep this.", true), "Keep this.");
});

for (const text of [
  "Leading sentence. You're absolutely right! Keep this.",
  " You're absolutely right! Keep this.",
  "You’re absolutely right! Keep this.",
  "**You're absolutely right!** Keep this.",
  "A different answer.",
]) {
  test(`enabled display keeps nonmatching source boundary ${JSON.stringify(text)}`, () => {
    assert.equal(assistantDisplayText(text, true), text);
  });
}

test("the five replacements remain ordered rather than collapsed into a global expression", () => {
  assert.equal(assistantDisplayText("You're absolutely right! You're absolutely right. Keep this.", true), "Keep this.");
  assert.equal(assistantDisplayText("You're absolutely right! You're absolutely right! Keep this.", true), "! Keep this.");
  assert.equal(assistantDisplayText("You're absolutely righteous", true), "eous");
});

test("a prefix-only block yields an empty display string", () => {
  assert.equal(assistantDisplayText("You're absolutely right!\n\t", true), "");
});
