// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIPBOARD_ATTR, clipboardHtml, copySource, isTextPath, newFileText } from "./copyFile.ts";
import type { FileDiff } from "./types.ts";

function file(path: string, over: Partial<FileDiff> = {}): FileDiff {
  return {
    path,
    old_path: null,
    status: "modified",
    binary: false,
    additions: 1,
    deletions: 1,
    hunks: [
      {
        old_start: 1,
        old_lines: 2,
        new_start: 1,
        new_lines: 2,
        section: "",
        lines: [
          { kind: "context", old_line: 1, new_line: 1, text: "keep" },
          { kind: "deletion", old_line: 2, new_line: null, text: "old" },
          { kind: "addition", old_line: null, new_line: 2, text: "new" },
        ],
      },
    ],
    ...over,
  };
}

const loadText = async () => "loaded";

test("text files are those that are not images, videos or PDFs", () => {
  for (const p of ["src/a.ts", "README", "Makefile", "x.svg", "x.PNG.txt"]) assert.equal(isTextPath(p), true, p);
  for (const p of ["a.png", "b.JPEG", "c.webp", "d.mov", "e.pdf", "f.avif"]) assert.equal(isTextPath(p), false, p);
});

test("no copy button for deleted, binary or non-text files", () => {
  assert.equal(copySource(file("a.ts", { status: "deleted" }), { loadText }), null);
  assert.equal(copySource(file("a.ts", { binary: true }), { loadText }), null);
  assert.equal(copySource(file("logo.png"), { loadText }), null);
  assert.equal(copySource(file("doc.pdf"), { draft: () => "x" }), null);
});

test("copies the editor draft when there is one, else loads the whole new file", async () => {
  assert.equal(await copySource(file("a.ts"), { draft: () => "draft", loadText })!(), "draft");
  assert.equal(await copySource(file("a.ts"), { loadText })!(), "loaded");
  assert.equal(await copySource(file("a.ts", { status: "added" }), { loadText })!(), "loaded");
});

for (const { label, oldText, newText } of [
  { label: "adding trailing spaces", oldText: "new", newText: "new  " },
  { label: "removing old-side whitespace", oldText: "\tnew  ", newText: "new" },
  { label: "changing whitespace on both sides", oldText: "  new\t", newText: "\tnew  " },
]) {
  test(`whitespace-hidden files copy exact new-side text when ${label}`, async () => {
    assert.notEqual(oldText, newText);
    assert.equal(oldText.replace(/\s/g, ""), newText.replace(/\s/g, ""), "the fixture must be a whitespace-only change");
    const unfiltered = file("a.ts");
    unfiltered.hunks[0].lines = [
      { kind: "context", old_line: 1, new_line: 1, text: "keep" },
      { kind: "deletion", old_line: 2, new_line: null, text: oldText },
      { kind: "addition", old_line: null, new_line: 2, text: newText },
    ];
    const hidden = { ...unfiltered, hunks: [] };
    let loads = 0;
    const read = copySource(hidden, {
      loadText: async () => {
        loads += 1;
        return newFileText(unfiltered);
      },
    });
    assert.ok(read, "a whitespace-only diff must retain its copy action");
    assert.equal(loads, 0, "copying loads contents only when invoked");
    assert.equal(await read(), `keep\n${newText}\n`);
    assert.equal(loads, 1);
  });
}

test("metadata-only changes without text hunks or a missing loader have nothing to copy", () => {
  assert.equal(copySource(file("a.ts", { status: "renamed", additions: 0, deletions: 0, hunks: [] }), { loadText }), null);
  assert.equal(copySource(file("a.ts", { additions: 0, deletions: 0, hunks: [] }), { loadText }), null);
  assert.equal(copySource(file("a.ts"), {}), null);
});

test("the new file's text comes from a whole-file diff", () => {
  assert.equal(newFileText(file("a.ts")), "keep\nnew\n");
  assert.throws(() => newFileText(file("a.ts", { status: "deleted" })), /unavailable/);
});

test("the HTML flavour names the path in Conductor's clipboard payload and escapes the text", () => {
  const html = clipboardHtml("src/a&b.ts", "if (a < b && c > d) {}");
  const m = html.match(new RegExp(`^<pre ${CLIPBOARD_ATTR}="([^"]+)">(.*)</pre>$`, "s"));
  assert.ok(m, html);
  assert.deepEqual(JSON.parse(decodeURIComponent(m[1])), { schemaVersion: 1, kind: "file-contents", path: "src/a&b.ts" });
  assert.equal(m[2], "if (a &lt; b &amp;&amp; c &gt; d) {}");
});
