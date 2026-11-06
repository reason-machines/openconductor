import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSendMode } from "../features/chat/queue.ts";
import { createOverrideStore, currentSendKeyMode, effectiveShortcuts, migrateLegacySendKey, parseOverrides, serializeOverrides, type OverrideUpdate } from "../keybindings/overrides.ts";
import { matchesEvent, type KeyEventLike } from "../keybindings/shortcut.ts";
import type { SendKeyMode } from "../keybindings/registry.ts";
import { logical } from "../keybindings/types.ts";
import { chooseSendKey } from "./composerSettings.ts";
import { enumPref, withEnumPref } from "./prefs.ts";
import { DEFAULT_SETTINGS, type Settings } from "./types.ts";

const press = (key: string, mods: { meta?: boolean; shift?: boolean; alt?: boolean } = {}): KeyEventLike => ({
  key,
  code: key,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
  ctrlKey: false,
});

/** Which composer command a key press runs, the way Composer's onKeyDown checks them. */
function composerAction(raw: string | undefined, e: KeyEventLike): "opposite" | "submit" | "newline" | "none" {
  const overrides = parseOverrides(raw);
  const hit = (id: string) => effectiveShortcuts(id, overrides).some((s) => matchesEvent(s, e));
  if (hit("chat.submitOppositeFollowUp")) return "opposite";
  if (hit("chat.submitMessage")) return "submit";
  if (hit("chat.newLine")) return "newline";
  return "none";
}

function memoryStore(initial?: string) {
  let raw = initial;
  const store = createOverrideStore({ read: async () => raw, write: async (next) => ((raw = next), true) });
  return { store, raw: () => raw };
}

test("Send messages with: Enter is the default, ⌘ Enter makes Enter a new line", async () => {
  const { store, raw } = memoryStore();
  assert.equal(composerAction(raw(), press("Enter")), "submit");
  assert.equal(composerAction(raw(), press("Enter", { shift: true })), "newline");
  assert.equal(currentSendKeyMode(parseOverrides(raw())), "enter");

  const legacy: SendKeyMode[] = [];
  assert.equal(await chooseSendKey("cmd-enter", store.updateMany, async (m) => legacy.push(m)), true);
  assert.deepEqual(legacy, ["cmd-enter"], "the legacy key is written after the overrides");
  assert.equal(composerAction(raw(), press("Enter")), "newline");
  assert.equal(composerAction(raw(), press("Enter", { meta: true })), "submit");
  assert.equal(composerAction(raw(), press("Enter", { alt: true })), "opposite");
  assert.equal(currentSendKeyMode(parseOverrides(raw())), "cmd-enter");

  await chooseSendKey("enter", store.updateMany, async (m) => legacy.push(m));
  assert.equal(composerAction(raw(), press("Enter")), "submit");
  assert.equal(composerAction(raw(), press("Enter", { meta: true })), "opposite");
});

test("Send messages with: a refused override write leaves the legacy key alone", async () => {
  const legacy: SendKeyMode[] = [];
  const refuse = async (_: readonly OverrideUpdate[]) => false;
  assert.equal(await chooseSendKey("cmd-enter", refuse, async (m) => legacy.push(m)), false);
  assert.deepEqual(legacy, []);
});

test("Send messages with: a customised send command reads as Custom (no preset)", () => {
  const raw = serializeOverrides({}, [{ commandId: "chat.submitMessage", shortcuts: [logical("j", ["meta"])] }]);
  assert.equal(currentSendKeyMode(parseOverrides(raw)), undefined);
});

test("a legacy ⌘ Enter send key migrates into overrides, keeping commands the user set", () => {
  assert.equal(migrateLegacySendKey(undefined, "enter"), undefined, "enter needs nothing");
  assert.equal(migrateLegacySendKey(undefined, undefined), undefined);

  const migrated = migrateLegacySendKey(undefined, "cmd-enter");
  assert.equal(composerAction(migrated, press("Enter")), "newline");
  assert.equal(composerAction(migrated, press("Enter", { meta: true })), "submit");

  const own = serializeOverrides({}, [{ commandId: "chat.submitMessage", shortcuts: [logical("j", ["meta"])] }]);
  const kept = migrateLegacySendKey(own, "cmd-enter");
  assert.deepEqual(parseOverrides(kept)["chat.submitMessage"], [logical("j", ["meta"])]);
  assert.equal(composerAction(kept, press("Enter")), "newline");

  assert.equal(migrateLegacySendKey(migrated, "cmd-enter"), migrated, "already migrated: no write");
});

test("Follow-up behavior: Steer by default, Queue makes a mid-turn send queue", () => {
  // What ChatPanel passes the composer: enumPref(settings, "default_message_send_mode").
  const send = (settings: Settings = DEFAULT_SETTINGS, opposite = false) =>
    resolveSendMode({ canSteer: true, defaultMode: enumPref(settings, "default_message_send_mode"), opposite });
  assert.equal(send(), "steer");
  assert.equal(send(DEFAULT_SETTINGS, true), "queue");

  const queued = withEnumPref(DEFAULT_SETTINGS, "default_message_send_mode", "queued");
  assert.equal(send(queued), "queue");
  assert.equal(send(queued, true), "steer");
  assert.equal(resolveSendMode({ canSteer: false, defaultMode: "steering" }), "queue", "agents that cannot steer always queue");
});
