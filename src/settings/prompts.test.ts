import { test } from "node:test";
import assert from "node:assert/strict";
import { withGeneralPreferences, withUserPreferences } from "./prompts.ts";

test("action prompts append the instructions after their own text", () => {
  assert.equal(withUserPreferences("Review.", undefined), "Review.");
  assert.equal(withUserPreferences("Review.", "   "), "Review.");
  const out = withUserPreferences("Review.", "  Check perf.\n");
  assert.ok(out.startsWith("Review.\n\nIMPORTANT:"), out);
  assert.ok(out.endsWith("<user-preferences>\nCheck perf.\n</user-preferences>"), out);
});

test("the first message carries the general instructions like Conductor's runtime", () => {
  assert.equal(withGeneralPreferences("Fix the login bug", null), "Fix the login bug");
  assert.equal(withGeneralPreferences("Fix the login bug", " \n"), "Fix the login bug");
  assert.equal(
    withGeneralPreferences("Fix the login bug", "Use pnpm."),
    "Fix the login bug\n<user-preferences>\nUse pnpm.\n</user-preferences>",
  );
});
