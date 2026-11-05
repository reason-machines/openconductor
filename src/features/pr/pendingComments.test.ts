import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPendingComments, newLocalComment, pendingForAgent, type DiffComment } from "../diff/comments.ts";
import { headerState } from "./api.ts";
import type { HeaderInputs } from "./types.ts";

const c = (over: Partial<DiffComment> = {}): DiffComment => ({
  ...newLocalComment({ id: crypto.randomUUID(), workspaceId: "w", filePath: "src/a.ts", side: "new", start: 3, body: "fix this", now: 1 }),
  ...over,
});

test("a pending comment counts unless it is outdated or resolved; sent ones never do (reference `Wus`)", () => {
  assert.equal(hasPendingComments([]), false);
  assert.equal(hasPendingComments([c({ state: "sent" })]), false);
  assert.equal(hasPendingComments([c({ is_outdated: true })]), false);
  assert.equal(hasPendingComments([c({ is_resolved: true })]), false);
  assert.equal(hasPendingComments([c({ state: "sent" }), c()]), true);
});

test("the header flag only counts comments 'Add all comments to chat' would send", () => {
  // A GitHub comment on the PR itself has no file, and an empty body has nothing to say:
  // pendingForAgent leaves both out, so the header must not offer a button that sends nothing.
  const prLevel = c({ id: "github-general-1", file_path: "", file_level: true, location: "file", line_number: 0, remote_url: "https://github.com/o/r/pull/1#issuecomment-1", author: "octo" });
  const empty = c({ body: "" });
  for (const set of [[prLevel], [empty], [prLevel, empty], [prLevel, c()], [c({ state: "sent" }), empty]]) {
    assert.equal(hasPendingComments(set), pendingForAgent(set).length > 0, JSON.stringify(set.map((x) => [x.file_path, x.body, x.state])));
  }
  assert.equal(hasPendingComments([prLevel, empty]), false);
  assert.equal(hasPendingComments([prLevel, c()]), true);
});

test("the browser preview's changes-requested header carries the caller's pending-comment flag", async () => {
  const store = new Map([["openconductor.pr.demo", "changes"]]);
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null };
  try {
    const inputs = { hasPendingComments: true } as HeaderInputs;
    assert.deepEqual((await headerState(inputs))?.action, { type: "changes_requested", hasPendingComments: true });
    assert.deepEqual((await headerState({ ...inputs, hasPendingComments: false }))?.action, { type: "changes_requested", hasPendingComments: false });
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
