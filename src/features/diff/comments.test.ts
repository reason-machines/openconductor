// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteComment, formatForAgent, markSent, newLocalComment, pendingForAgent, refreshOutdated, setResolved, threadsAt, threadsOf } from "./comments.ts";
import { commentTargets, step, stepComment } from "./nav.ts";
import { buildReviewPrompt, DEFAULT_REVIEW_PROMPT } from "./review.ts";
import type { FileDiff } from "./types.ts";

const file: FileDiff = {
  path: "src/a.ts",
  old_path: null,
  status: "modified",
  binary: false,
  additions: 2,
  deletions: 1,
  hunks: [
    {
      old_start: 1,
      old_lines: 2,
      new_start: 1,
      new_lines: 3,
      section: "",
      lines: [
        { kind: "context", old_line: 1, new_line: 1, text: "const a = 1;" },
        { kind: "deletion", old_line: 2, new_line: null, text: "old();" },
        { kind: "addition", old_line: null, new_line: 2, text: "next();" },
        { kind: "addition", old_line: null, new_line: 3, text: "more();" },
      ],
    },
  ],
};

const base = { workspaceId: "w", filePath: "src/a.ts", body: " tighten this ", now: 1 };

test("new comments normalise ranges and trim the body", () => {
  const c = newLocalComment({ ...base, id: "c1", side: "new", start: 3, end: 2 });
  assert.equal(c.line_number, 2);
  assert.equal(c.end_line_number, 3);
  assert.equal(c.body, "tighten this");
  assert.equal(newLocalComment({ ...base, id: "c2", side: "new", start: 2, end: 2 }).end_line_number, null);
});

test("replies join their root's thread and threads anchor on the range end", () => {
  const root = newLocalComment({ ...base, id: "r", side: "new", start: 2, end: 3 });
  const reply = newLocalComment({ ...base, id: "x", side: "new", start: 2, now: 2, replyTo: root });
  const threads = threadsOf([reply, root]);
  assert.equal(threads.length, 1);
  assert.deepEqual(threads[0].replies.map((c) => c.id), ["x"]);
  assert.equal(threadsAt(threads, "src/a.ts", "new", 3).length, 1);
  assert.equal(threadsAt(threads, "src/a.ts", "new", 2).length, 0);
  assert.deepEqual(deleteComment([root, reply], "r"), []);
});

test("local comments go outdated when their lines leave the diff; GitHub ones keep their flag", () => {
  const ok = newLocalComment({ ...base, id: "a", side: "old", start: 2 });
  const gone = newLocalComment({ ...base, id: "b", side: "new", start: 9 });
  const remote = { ...newLocalComment({ ...base, id: "c", side: "new", start: 9 }), remote_url: "https://example.invalid/c" };
  const out = refreshOutdated([ok, gone, remote], [file]);
  assert.deepEqual(out.map((c) => c.is_outdated), [false, true, false]);
  assert.deepEqual(pendingForAgent(out).map((c) => c.id), ["a", "c"]);
});

test("agent text quotes the commented code; sent and resolved comments are not pending", () => {
  const c = newLocalComment({ ...base, id: "a", side: "new", start: 2, end: 3 });
  assert.equal(formatForAgent([c], [file]), "src/a.ts lines 2-3:\n```\nnext();\nmore();\n```\ntighten this");
  const del = newLocalComment({ ...base, id: "d", side: "old", start: 2 });
  assert.match(formatForAgent([del], [file]), /^src\/a\.ts line 2 \(removed code\):/);
  assert.deepEqual(pendingForAgent(markSent([c], new Set(["a"]), 5)), []);
  assert.deepEqual(pendingForAgent(setResolved([c], "a", true, 5)), []);
});

test("navigation wraps and orders comments by file then line", () => {
  assert.equal(step(-1, 3, 1), 0);
  assert.equal(step(-1, 3, -1), 2);
  assert.equal(step(2, 3, 1), 0);
  assert.equal(step(0, 0, 1), -1);
  const other: FileDiff = { ...file, path: "b.ts" };
  const cs = [
    newLocalComment({ ...base, id: "late", side: "new", start: 3 }),
    newLocalComment({ ...base, id: "early", side: "new", start: 1 }),
    newLocalComment({ ...base, id: "b", filePath: "b.ts", side: "new", start: 1 }),
  ];
  const targets = commentTargets(cs, [other, file]);
  assert.deepEqual(targets.map((t) => t.id), ["b", "early", "late"]);
  assert.equal(stepComment(targets, "late", 1)?.id, "b");
  assert.equal(stepComment(targets, null, -1)?.id, "late");
});

test("review prompt uses the repo override when set and names the scope", () => {
  assert.ok(buildReviewPrompt("all").startsWith(DEFAULT_REVIEW_PROMPT));
  assert.equal(buildReviewPrompt("uncommitted", "  Check perf. "), "Check perf.\n\nOnly the uncommitted changes are in scope.");
});

test("stored values match the REA-observed diff_comments values", () => {
  const line = newLocalComment({ ...base, id: "n", side: "new", start: 2 });
  assert.equal(line.state, "pending");
  assert.equal(line.location, "modified");
  assert.equal(line.file_level, false);
  assert.equal(newLocalComment({ ...base, id: "o", side: "old", start: 2 }).location, "base");
  const whole = newLocalComment({ ...base, id: "f", side: "new", fileLevel: true, start: 5, end: 9 });
  assert.equal(whole.location, "file");
  assert.equal(whole.file_level, true);
  assert.equal(whole.line_number, 0);
  assert.equal(whole.end_line_number, null);
  assert.equal(threadsAt(threadsOf([whole]), "src/a.ts", "new", 0).length, 0);
  assert.equal(refreshOutdated([whole], [file])[0].is_outdated, false);
  assert.equal(refreshOutdated([whole], [])[0].is_outdated, true);
  assert.equal(formatForAgent([whole], [file]), "src/a.ts:\ntighten this");
});
