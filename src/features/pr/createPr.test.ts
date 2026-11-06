import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrRequest, type CreatePrSources } from "./createPr.ts";

const base = { branch: "sven/x", remote: "origin", targetBranch: "main", draft: false, repoId: "r1", repoPath: "/repo" };

test("Create PR sends the checkout's template, the repo's createPR prompt and the stored title and description", async () => {
  const asked: string[] = [];
  const sources: CreatePrSources = {
    template: async (w) => (asked.push(`template:${w}`), "## Summary"),
    customInstructions: async (id) => (asked.push(`custom:${id}`), "Link the Linear issue."),
  };
  const r = await createPrRequest({ ...base, draft: true, worktree: "/wt", title: "Add PR template", description: "Body" }, sources);
  assert.deepEqual(asked.sort(), ["custom:r1", "template:/wt"]);
  assert.deepEqual(r, {
    branch: "sven/x",
    remote: "origin",
    targetBranch: "main",
    draft: true,
    title: "Add PR template",
    description: "Body",
    template: "## Summary",
    customInstructions: "Link the Linear issue.",
    repoPath: "/repo",
    workspacePath: "/wt",
  });
});

test("with no createPR prompt in the repository row, the request carries the paths for the prompts.create_pr settings fallback", async () => {
  const r = await createPrRequest({ ...base, worktree: "/wt" }, { template: async () => null, customInstructions: async () => null });
  // pr_create_prompt only reads the settings files when customInstructions is null and repoPath is set.
  assert.equal(r.customInstructions, null);
  assert.equal(r.repoPath, "/repo");
  assert.equal(r.workspacePath, "/wt");
});

test("an unknown repository checkout sends no repoPath, so no settings files are read", async () => {
  const r = await createPrRequest({ ...base, repoPath: "", worktree: null }, { template: async () => null, customInstructions: async () => null });
  assert.equal(r.repoPath, null);
  assert.equal(r.workspacePath, null);
});

test("without a checkout there is no template to read, and unset fields go as null", async () => {
  let templateRead = false;
  const r = await createPrRequest({ ...base, worktree: null }, {
    template: async () => ((templateRead = true), "x"),
    customInstructions: async () => null,
  });
  assert.equal(templateRead, false);
  assert.equal(r.template, null);
  assert.equal(r.customInstructions, null);
  assert.equal(r.title, null);
  assert.equal(r.description, null);
});
