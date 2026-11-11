import { test } from "node:test";
import assert from "node:assert/strict";
import { emojiIcon, fitIcon, githubAvatarUrl, parseRepoIcon, uploadMimeType } from "./repoIcon.ts";

const known = (n: string) => n === "rocket";

test("parseRepoIcon decodes emoji, uploaded images and bundled icon names", () => {
  assert.deepEqual(parseRepoIcon("emoji:🚀", known), { kind: "emoji", emoji: "🚀" });
  assert.deepEqual(parseRepoIcon("data:image/png;base64,AAAA", known), { kind: "image", src: "data:image/png;base64,AAAA" });
  assert.deepEqual(parseRepoIcon("rocket", known), { kind: "icon", name: "rocket" });
  assert.equal(parseRepoIcon("not-an-icon", known), null);
  assert.equal(parseRepoIcon("emoji:", known), null);
  assert.equal(parseRepoIcon(null, known), null);
});

test("emojiIcon trims and refuses blank input", () => {
  assert.equal(emojiIcon(" 🐙 "), "emoji:🐙");
  assert.equal(emojiIcon("  "), undefined);
});

test("githubAvatarUrl reads the owner from github.com remotes only", () => {
  assert.equal(githubAvatarUrl("https://github.com/tide-labs/tide-web.git"), "https://github.com/tide-labs.png?size=64");
  assert.equal(githubAvatarUrl("git@github.com:ada-demo/dotfiles.git"), "https://github.com/ada-demo.png?size=64");
  assert.equal(githubAvatarUrl("ssh://git@github.com/ada/x"), "https://github.com/ada.png?size=64");
  assert.equal(githubAvatarUrl("https://gitlab.com/a/b"), null);
  assert.equal(githubAvatarUrl("file:///Users/a/b"), null);
  assert.equal(githubAvatarUrl(undefined), null);
});

test("uploads accept the five image types by extension", () => {
  assert.equal(uploadMimeType("Logo.PNG"), "image/png");
  assert.equal(uploadMimeType("a.jpeg"), "image/jpeg");
  assert.equal(uploadMimeType("icon.svg"), "image/svg+xml");
  assert.equal(uploadMimeType("doc.pdf"), undefined);
  assert.equal(uploadMimeType("noext"), undefined);
});

test("fitIcon scales the longest side to at most 128 and centers", () => {
  assert.deepEqual(fitIcon(512, 256), { canvas: 128, width: 128, height: 64, x: 0, y: 32 });
  assert.deepEqual(fitIcon(32, 32), { canvas: 32, width: 32, height: 32, x: 0, y: 0 });
  assert.deepEqual(fitIcon(0, 0), { canvas: 128, width: 128, height: 128, x: 0, y: 0 });
});

test("fitIcon preserves half-pixel centering for odd padding", () => {
  assert.deepEqual(fitIcon(300, 100), { canvas: 128, width: 128, height: 43, x: 0, y: 42.5 });
  assert.deepEqual(fitIcon(100, 300), { canvas: 128, width: 43, height: 128, x: 42.5, y: 0 });
  assert.deepEqual(fitIcon(32, 31), { canvas: 32, width: 32, height: 31, x: 0, y: 0.5 });
  assert.deepEqual(fitIcon(31, 32), { canvas: 32, width: 31, height: 32, x: 0.5, y: 0 });
});

test("fitIcon defaults a missing width to 128 independently of height", () => {
  assert.deepEqual(fitIcon(0, 64), { canvas: 128, width: 128, height: 64, x: 0, y: 32 });
  assert.deepEqual(fitIcon(0, 256), { canvas: 128, width: 64, height: 128, x: 32, y: 0 });
});

test("fitIcon defaults a missing height to 128 independently of width", () => {
  assert.deepEqual(fitIcon(64, 0), { canvas: 128, width: 64, height: 128, x: 32, y: 0 });
  assert.deepEqual(fitIcon(256, 0), { canvas: 128, width: 128, height: 64, x: 0, y: 32 });
});
