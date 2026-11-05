import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveBlocker, archiveBlockedMessage, type GitOperation } from "./archiveGuard.ts";

const reads = (op: GitOperation | null) => {
  const asked: string[] = [];
  return { asked, read: async (w: string) => (asked.push(w), op) };
};

test("archive is refused while a merge or rebase is in progress", async () => {
  const merge = reads("merge");
  assert.equal(await archiveBlocker("/wt", merge.read), archiveBlockedMessage("merge"));
  assert.deepEqual(merge.asked, ["/wt"]);
  assert.match(archiveBlockedMessage("merge"), /while a merge is in progress/);
  assert.match((await archiveBlocker("/wt", reads("rebase").read)) ?? "", /while a rebase is in progress/);
  assert.match((await archiveBlocker("/wt", reads("cherry-pick").read)) ?? "", /cherry-pick/);
});

test("a clean checkout, no checkout, or an unreadable one may be archived", async () => {
  assert.equal(await archiveBlocker("/wt", reads(null).read), null);
  const none = reads("merge");
  assert.equal(await archiveBlocker(null, none.read), null);
  assert.deepEqual(none.asked, [], "no checkout, nothing to read");
  assert.equal(await archiveBlocker("/gone", async () => { throw new Error("not a git repository"); }), null);
});
