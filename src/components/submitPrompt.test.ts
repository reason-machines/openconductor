import { test } from "node:test";
import assert from "node:assert/strict";
import { promptSubmissionBody, promptSubmissionUrl } from "./submitPrompt.ts";

test("the body is Conductor's prompt submission text with the version footer", () => {
  assert.equal(
    promptSubmissionBody("  Add a dark mode toggle \n", "", "0.1.0", "macos 15.4"),
    "[PROMPT SUBMISSION]\n\nName: (anonymous)\nPrompt:\nAdd a dark mode toggle\n\n----\nApp Version: 0.1.0\nOS: macos 15.4",
  );
  assert.match(promptSubmissionBody("x", " Ada ", "0.1.0", "linux"), /^\[PROMPT SUBMISSION\]\n\nName: Ada\n/);
});

test("the URL opens a new issue on the repository with the prompt as title and body", () => {
  const url = new URL(promptSubmissionUrl("Add a dark mode toggle\nand more", "Ada", "0.1.0", "macos"));
  assert.equal(url.origin + url.pathname, "https://github.com/reason-machines/openconductor/issues/new");
  assert.equal(url.searchParams.get("title"), "Prompt: Add a dark mode toggle");
  assert.match(url.searchParams.get("body")!, /Name: Ada\nPrompt:\nAdd a dark mode toggle\nand more\n/);
});

test("long first lines are shortened in the title", () => {
  const title = new URL(promptSubmissionUrl("a".repeat(100), "", "0.1.0", "macos")).searchParams.get("title")!;
  assert.equal(title, `Prompt: ${"a".repeat(71)}…`);
});
