import { test } from "node:test";
import assert from "node:assert/strict";
import { withGeneralPreferences, withRenameBranch, withUserPreferences } from "./prompts.ts";

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

test("withRenameBranch appends branch-naming instructions on the first message", () => {
  assert.equal(withRenameBranch("Fix login.", null), "Fix login.");
  assert.equal(withRenameBranch("Fix login.", "  "), "Fix login.");
  assert.equal(
    withRenameBranch("Fix login.", "Use format: fix/JIRA-123-short-desc."),
    "Fix login.\n<branch-naming-preferences>\nUse format: fix/JIRA-123-short-desc.\n</branch-naming-preferences>",
  );
  // Composes with withGeneralPreferences: rename_branch block appears after general block.
  const withBoth = withRenameBranch(
    withGeneralPreferences("Fix login.", "Use pnpm."),
    "Prefix with username.",
  );
  assert.ok(withBoth.includes("<user-preferences>"), withBoth);
  assert.ok(withBoth.includes("<branch-naming-preferences>"), withBoth);
  const gnrlIdx = withBoth.indexOf("<user-preferences>");
  const rnIdx = withBoth.indexOf("<branch-naming-preferences>");
  assert.ok(gnrlIdx < rnIdx, "general block precedes branch-naming block");
});
