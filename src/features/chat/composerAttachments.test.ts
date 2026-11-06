// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentPath, inlineText, MAX_ATTACHMENT_BYTES, MAX_INLINE_TEXT_BYTES, promptText, randomDir, rejectReason, safeFileName } from "./composerAttachments.ts";

test("an attached file goes to .context/attachments/<random 6>/<name> in the workspace", () => {
  assert.equal(attachmentPath("notes.md", "a1b2c3"), ".context/attachments/a1b2c3/notes.md");
  assert.match(randomDir(), /^[a-z0-9]{6}$/);
  assert.equal(randomDir(() => 0), "aaaaaa");
});

test("file names cannot leave their folder or hide", () => {
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName("C:\\Users\\me\\shot.png"), "shot.png");
  assert.equal(safeFileName(".env"), "env");
  assert.equal(safeFileName("a:b*c?.txt"), "a-b-c-.txt");
  assert.equal(safeFileName(".."), "attachment");
  assert.equal(safeFileName(""), "attachment");
  assert.equal(safeFileName("Screen Shot 2026-11-05.png"), "Screen Shot 2026-11-05.png");
});

test("UTF-8 text goes inline; binary and oversized files are pointed at by path", () => {
  const enc = new TextEncoder();
  assert.equal(inlineText(enc.encode("héllo\n")), "héllo\n");
  assert.equal(inlineText(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])), null);
  assert.equal(inlineText(new Uint8Array([0xff, 0xfe, 0x41])), null, "invalid UTF-8");
  assert.equal(inlineText(new Uint8Array(MAX_INLINE_TEXT_BYTES + 1).fill(0x41)), null);
  const png = promptText(new Uint8Array([0x89, 0x50, 0x00]), ".context/attachments/abcdef/shot.png");
  assert.match(png, /3 bytes/);
  assert.match(png, /\.context\/attachments\/abcdef\/shot\.png/);
  assert.equal(promptText(enc.encode("plain"), "x"), "plain");
});

test("files over the size limit are refused with a reason", () => {
  assert.equal(rejectReason({ name: "a.txt", size: 10 }), null);
  assert.match(rejectReason({ name: "big.mov", size: MAX_ATTACHMENT_BYTES + 1 }) ?? "", /big\.mov is larger than 25 MB/);
});
