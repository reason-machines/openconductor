import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReviewPrompt } from "../features/diff/review.ts";
import { fixErrorsInstructions } from "../features/pr/checks/fixErrors.ts";
import { withRenameBranch } from "./prompts.ts";

// Runs all seven frozen mounted regression bodies, unchanged, with documented loader ports.
const dependencies = createRequire(import.meta.url);
const { act } = dependencies("react-test-renderer");
const { mount } = dependencies("../../evidence/settings/action-preview/mounted.cjs");

for (const draft of ["", "  \n ", "  Synthetic action preferences.\nKeep the final line.  "]) {
  test(`preview uses the real TS builders with draft ${JSON.stringify(draft)}`, async () => {
    const f = await mount();
    try {
      const { actionPromptPreview } = f.loadPreview();
      assert.equal(await actionPromptPreview("code_review", draft), buildReviewPrompt({ remote: "origin", targetBranch: "${TARGET_BRANCH}", custom: draft }));
      assert.equal(await actionPromptPreview("fix_errors", draft), fixErrorsInstructions(draft));
      assert.equal(await actionPromptPreview("rename_branch", draft), withRenameBranch("${YOUR_MESSAGE}", draft));
      assert.equal(await actionPromptPreview("general", draft), "");
      assert.equal(f.previewCalls.length, 0, "TS-only previews do not call IPC");
      assert.equal(f.saves.length, 0);
      assert.equal(f.launches.length, 0);
    } finally { await f.close(); }
  });
}

for (const kind of ["create_pr", "resolve_merge_conflicts"]) {
  test(`${kind}: bridge only sends the current draft and kind, never repository context`, async () => {
    const f = await mount();
    try {
      await f.open(kind);
      await f.change(kind, "  Synthetic unsaved native draft.  ");
      await f.click(f.previews(kind)[0]);
      assert.equal(JSON.stringify(f.previewCalls), JSON.stringify([{ command: "pr_action_prompt_preview", args: { kind, custom: "  Synthetic unsaved native draft.  " } }]));
      const dialog = f.renderer.root.findByProps({ role: "dialog" });
      assert.ok(dialog.findByProps({ "data-preview-markdown": true }).children.join("").includes("Synthetic unsaved native draft."));
      await f.click(dialog.findByProps({ "aria-label": "Close preview" }));
      assert.equal(f.renderer.root.findAllByProps({ role: "dialog" }).length, 0);
      assert.equal(f.saves.length, 0);
      assert.equal(f.launches.length, 0);
    } finally { await f.close(); }
  });
}

test("preview shows an IPC failure without action fallback, saving or stale Markdown", async () => {
  const f = await mount({ native: () => Promise.reject(new Error("Synthetic IPC failure")) });
  try {
    await f.open("create_pr");
    await f.click(f.previews("create_pr")[0]);
    assert.equal(f.renderer.root.findByProps({ role: "alert" }).children.join(""), "Failed to load prompt preview.");
    assert.equal(f.renderer.root.findAllByProps({ "data-preview-markdown": true }).length, 0);
    assert.equal(f.previewCalls.length, 1);
    assert.equal(f.saves.length, 0);
    assert.equal(f.launches.length, 0);
  } finally { await f.close(); }
});

test("closing and reopening isolates pending preview responses and uses the latest draft", async () => {
  const pending: ((text: string) => void)[] = [];
  const f = await mount({ native: () => new Promise<string>((resolve) => pending.push(resolve)) });
  try {
    await f.open("create_pr");
    await f.change("create_pr", "First draft");
    await f.click(f.previews("create_pr")[0]);
    let dialog = f.renderer.root.findByProps({ role: "dialog" });
    assert.equal(dialog.findByProps({ role: "status" }).children.join(""), "Loading preview…");
    await f.click(dialog.findByProps({ "aria-label": "Close preview" }));
    await f.change("create_pr", "Second draft");
    await f.click(f.previews("create_pr")[0]);
    await act(async () => { pending[1]("Second draft result"); });
    await act(async () => { pending[0]("STALE first draft result"); });
    dialog = f.renderer.root.findByProps({ role: "dialog" });
    assert.equal(dialog.findByProps({ "data-preview-markdown": true }).children.join(""), "Second draft result");
    assert.equal(f.previewCalls[1].args.custom, "Second draft");
    assert.equal(f.saves.length, 0);
    assert.equal(f.launches.length, 0);
  } finally { await f.close(); }
});
