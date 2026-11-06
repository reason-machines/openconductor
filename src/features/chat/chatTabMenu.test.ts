// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { chatTabMenu, renamedChatTitle, type ChatTabMenuInput } from "./chatTabMenu.ts";

const base: ChatTabMenuInput = { unread: false, canRename: true, archived: false, forkEnabled: true, forking: false, closable: true, hasOtherTabs: true };
const labels = (i: ChatTabMenuInput) => chatTabMenu(i).map((e) => (e.kind === "separator" ? "---" : e.label));

test("a closable chat tab has Conductor's full menu in its order", () => {
  assert.deepEqual(labels(base), [
    "Mark as unread",
    "Rename chat",
    "Fork to new tab",
    "---",
    "Copy concise transcript",
    "Copy full transcript",
    "Copy link",
    "---",
    "Close tab",
    "Close others",
  ]);
  const items = chatTabMenu(base).filter((e) => e.kind === "item");
  assert.deepEqual(
    items.filter((e) => e.shortcut).map((e) => [e.label, e.shortcut]),
    [
      ["Fork to new tab", "⌘⌥↩"],
      ["Copy concise transcript", "⌘⌥C"],
      ["Close tab", "⌘W"],
    ],
  );
});

test("an unread chat offers Mark as read", () => {
  assert.equal(labels({ ...base, unread: true })[0], "Mark as read");
});

test("Fork to new tab needs the experimental setting, a renamable chat and a live workspace", () => {
  assert.ok(!labels({ ...base, forkEnabled: false }).includes("Fork to new tab"));
  assert.ok(!labels({ ...base, archived: true }).includes("Fork to new tab"));
  assert.ok(!labels({ ...base, canRename: false }).includes("Fork to new tab"));
  const fork = chatTabMenu({ ...base, forking: true }).find((e) => e.kind === "item" && e.id === "fork");
  assert.equal(fork?.kind === "item" && fork.disabled, true);
});

test("Rename chat is only offered when the chat can be renamed", () => {
  assert.ok(!labels({ ...base, canRename: false }).includes("Rename chat"));
});

test("the workspace's own chat has no Close tab; Close others is disabled without other tabs", () => {
  const main = chatTabMenu({ ...base, closable: false, hasOtherTabs: false });
  assert.ok(!main.some((e) => e.kind === "item" && e.id === "close"));
  const others = main.find((e) => e.kind === "item" && e.id === "close-others");
  assert.equal(others?.kind === "item" && others.disabled, true);
});

test("renaming: an empty or unchanged title just closes; the new one is trimmed", () => {
  assert.equal(renamedChatTitle("Untitled", "  "), null);
  assert.equal(renamedChatTitle("Untitled", " Untitled "), null);
  assert.equal(renamedChatTitle("Untitled", "  Fix login loop "), "Fix login loop");
});
