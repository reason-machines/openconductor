// Run: node --experimental-strip-types --test src/features/diff/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentName, attachmentText, bodyParts, canDeleteComment, commentSource, commentTags, fileThreads, isRemoteThread, pendingForAgent, prThreads, suggestionRows, threadsAt, threadsOf, type DiffComment } from "./comments.ts";

const base: DiffComment = {
  id: "c",
  workspace_id: "w",
  file_path: "src/a.ts",
  line_number: 2,
  end_line_number: null,
  body: "b",
  state: "pending",
  location: "modified",
  file_level: false,
  created_at: 1,
  updated_at: null,
  remote_url: null,
  author: null,
  author_avatar_url: null,
  thread_id: null,
  reply_to_comment_id: null,
  is_outdated: false,
  is_resolved: false,
  suggestion_base_code: null,
};

const gh = (over: Partial<DiffComment>): DiffComment => ({ ...base, remote_url: "https://github.com/a/b/pull/1#r1", author: "octo", thread_id: "T1", ...over });

test("source tells GitHub, agent and user comments apart", () => {
  assert.equal(commentSource(gh({})), "remote");
  assert.equal(commentSource({ ...base, author: "Claude" }), "agent-local");
  assert.equal(commentSource(base), "user-local");
});

test("GitHub threads group by thread id and are resolvable there", () => {
  const root = gh({ id: "github-T1-1" });
  const reply = gh({ id: "github-T1-2", reply_to_comment_id: "github-T1-1", created_at: 2 });
  const threads = threadsOf([reply, root]);
  assert.equal(threads.length, 1);
  assert.deepEqual(threads[0].replies.map((c) => c.id), ["github-T1-2"]);
  assert.ok(isRemoteThread(threads[0]));
  assert.ok(!isRemoteThread(threadsOf([base])[0]));
  assert.equal(threadsAt(threads, "src/a.ts", "new", 2).length, 1);
  assert.equal(threadsAt(threadsOf([gh({ id: "x", location: "original" })]), "src/a.ts", "old", 2).length, 1);
});

test("outdated threads without a line sit on the file; PR comments sit on the PR", () => {
  const outdated = gh({ id: "o", file_level: true, line_number: 0, is_outdated: true });
  const general = gh({ id: "github-general-5", file_path: "", file_level: true, line_number: 0, thread_id: null, location: "file" });
  const threads = threadsOf([outdated, general, base]);
  assert.deepEqual(fileThreads(threads, "src/a.ts").map((t) => t.root.id), ["o"]);
  assert.deepEqual(prThreads(threads).map((t) => t.root.id), ["github-general-5"]);
  assert.deepEqual(threadsAt(threads, "src/a.ts", "new", 0), []);
});

test("resolved wins over outdated; Add all sends live GitHub and PR comments, not resolved or outdated ones", () => {
  assert.deepEqual(commentTags({ is_resolved: true, is_outdated: true }), ["Resolved"]);
  assert.deepEqual(commentTags({ is_resolved: false, is_outdated: true }), ["Outdated"]);
  assert.deepEqual(commentTags(base), []);
  const cs = [gh({ id: "live" }), gh({ id: "r", is_resolved: true }), gh({ id: "o", is_outdated: true }), gh({ id: "pr", file_path: "", file_level: true }), gh({ id: "sent", state: "sent" })];
  assert.deepEqual(pendingForAgent(cs).map((c) => c.id), ["live", "pr"]);
});

test("GitHub comments go to the agent with author, thread and URL; PR comments say so", () => {
  const reply = gh({ id: "github-T1-2", reply_to_comment_id: "github-T1-1", end_line_number: 4 });
  const text = attachmentText(reply);
  assert.match(text, /^GitHub review comment ID: github-T1-2\nFile: src\/a\.ts\nLines: 2-4\n/);
  assert.match(text, /^This comment was left on GitHub by @octo\.$/m);
  assert.match(text, /^This comment is a reply in GitHub thread T1 to comment github-T1-1\.$/m);
  assert.match(text, /^Remote URL: https:\/\/github\.com\/a\/b\/pull\/1#r1$/m);
  const general = gh({ id: "github-general-5", file_path: "", file_level: true, line_number: 0, thread_id: null, location: "file", body: "Looks good overall, thanks!" });
  assert.equal(attachmentName(general), "@octo");
  assert.equal(attachmentName({ ...general, author: null }), "Looks good overall, thanks!");
  assert.equal(attachmentName({ ...general, author: null, body: "x".repeat(40) }), `${"x".repeat(30)}...`);
  const t = attachmentText(general);
  assert.ok(!/^File:/m.test(t) && !/^Lines:/m.test(t));
  assert.match(t, /^This comment was left on the pull request itself, not on a file\.$/m);
});

test("suggestion blocks become changes only when the original code is known", () => {
  const body = "Rename it:\n```suggestion\nconst total = 1;\n```\nThanks";
  assert.deepEqual(bodyParts(body, null), [{ kind: "text", text: body }]);
  assert.deepEqual(bodyParts(body, "const sum = 1;"), [
    { kind: "text", text: "Rename it:" },
    { kind: "suggestion", code: "const total = 1;" },
    { kind: "text", text: "Thanks" },
  ]);
  assert.deepEqual(bodyParts("```suggestion\n```", "x"), [{ kind: "suggestion", code: "" }]);
  assert.deepEqual(bodyParts("plain", "x"), [{ kind: "text", text: "plain" }]);
  assert.deepEqual(bodyParts("```ts\ncode\n```", "x"), [{ kind: "text", text: "```ts\ncode\n```" }]);
});

test("suggestion rows: old lines removed, new lines added; empty means delete", () => {
  assert.deepEqual(suggestionRows("a\nb", "c"), [
    { kind: "del", text: "a" },
    { kind: "del", text: "b" },
    { kind: "add", text: "c" },
  ]);
  assert.deepEqual(suggestionRows("a", ""), [{ kind: "del", text: "a" }]);
});

test("Delete: always on your own comments; on GitHub and agent comments once they are no longer pending", () => {
  assert.equal(canDeleteComment(base), true);
  assert.equal(canDeleteComment({ ...base, state: "sent" }), true);
  assert.equal(canDeleteComment(gh({})), false);
  assert.equal(canDeleteComment(gh({ state: "sent" })), true);
  assert.equal(canDeleteComment({ ...base, author: "agent" }), false);
  assert.equal(canDeleteComment({ ...base, author: "agent", state: "sent" }), true);
});
