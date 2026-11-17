// Run: node --test src/lib/local-storage/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalStorageClient, browserLocalStorage, persistStorage, type Invoke } from "./client.ts";
import { memoryInvoke } from "./memory.ts";
import {
  BROWSER_LOCAL_STORAGE,
  PERSIST_NAMES,
  SUBSYSTEMS,
  TERMINAL,
  preWorkspaceCompletionId,
  routeStateKey,
  subsystemStoreFileName,
  turnChangesId,
} from "./subsystems.ts";

function clock() {
  let t = Date.UTC(2026, 10, 5, 10, 0, 0);
  return () => new Date((t += 1000)).toISOString();
}

test("the 11 subsystems have the reference names, files and limits", () => {
  const MiB = 1024 * 1024;
  assert.deepEqual(
    SUBSYSTEMS.map((s) => [subsystemStoreFileName(s.name), s.sizeLimit]),
    [
      ["local-storage.subsystem.browser-local-storage.json", 5 * MiB],
      ["local-storage.subsystem.claude-context-windows.json", 64 * 1024],
      ["local-storage.subsystem.composer-drafts.json", 5 * MiB],
      ["local-storage.subsystem.dispatcher-state.json", 1 * MiB],
      ["local-storage.subsystem.model-picker-configs-v1.json", 64 * 1024],
      ["local-storage.subsystem.opencode-model-discovery-v1.json", 4 * MiB],
      ["local-storage.subsystem.pre-workspace-completions-v1.json", 5 * MiB],
      ["local-storage.subsystem.route-user-state.json", 5 * MiB],
      ["local-storage.subsystem.run-script-history.json", 5 * MiB],
      ["local-storage.subsystem.terminal.json", 100 * MiB],
      ["local-storage.subsystem.turn-changes-cache.json", 5 * MiB],
    ],
  );
  assert.equal(PERSIST_NAMES.terminalTabs, "terminal-panel-tabs-v1");
});

test("entry ids are built the reference's way", () => {
  assert.equal(turnChangesId({ sessionId: "s", turnId: "t" }), '["s","t"]');
  assert.equal(preWorkspaceCompletionId("k"), "completion:k");
  assert.equal(routeStateKey({ routeId: "/settings", scope: ["a b", "c/d"] }), "%2Fsettings/a%20b/c%2Fd");
  assert.equal(routeStateKey({ routeId: "home" }), "home");
});

test("values cross as JSON text with the command argument names", async () => {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const inner = memoryInvoke(clock());
  const spy: Invoke = (cmd, args) => {
    calls.push([cmd, args]);
    return inner(cmd, args);
  };
  const c = new LocalStorageClient(spy);
  const draft = { message: "hä", attachments: [] };
  assert.deepEqual(await c.setEntry({ subsystem: "composer-drafts", sizeLimit: 100, id: "s1", content: draft }), {
    success: true,
  });
  assert.deepEqual(calls[0], [
    "local_storage_set_entry",
    { args: { subsystem: "composer-drafts", sizeLimit: 100, id: "s1", content: JSON.stringify(draft) } },
  ]);
  assert.deepEqual(await c.getEntry({ subsystem: "composer-drafts", id: "s1" }), draft);
  assert.equal(await c.getEntry({ subsystem: "composer-drafts", id: "nope" }), undefined);
  const [listed] = await c.listEntries("composer-drafts");
  assert.deepEqual(listed.content, draft);
  assert.equal(listed.size, new TextEncoder().encode(JSON.stringify(draft)).byteLength);
  assert.deepEqual(calls.at(-1), ["local_storage_list_entries", { args: { subsystem: "composer-drafts" } }]);
  await c.removeEntry({ subsystem: "composer-drafts", id: "s1" });
  assert.deepEqual(calls.at(-1), ["local_storage_remove_entry", { args: { subsystem: "composer-drafts", id: "s1" } }]);
  assert.deepEqual(await c.listEntries("composer-drafts"), []);
  await c.removeSubsystem("composer-drafts");
  assert.equal(inner.subsystem("composer-drafts"), undefined);
});

test("unserializable values fail without a call", async () => {
  let called = false;
  const c = new LocalStorageClient(async () => {
    called = true;
    return undefined as never;
  });
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.deepEqual(await c.setEntry({ subsystem: "x", sizeLimit: 10, id: "a", content: cyclic }), {
    success: false,
    reason: "notJsonSerializable",
  });
  assert.deepEqual(await c.setEntry({ subsystem: "x", sizeLimit: 10, id: "a", content: undefined }), {
    success: false,
    reason: "notJsonSerializable",
  });
  assert.equal(called, false);
});

test("the stand-in evicts like the backend store", async () => {
  const c = new LocalStorageClient(memoryInvoke(clock()));
  // Each value is 3 bytes of JSON ("a"); the fourth evicts the oldest other one.
  const put = (id: string) => c.setEntry({ subsystem: "t", sizeLimit: 9, id, content: id });
  await put("a");
  await put("b");
  await put("c");
  await put("a");
  assert.deepEqual(await put("d"), { success: true });
  assert.deepEqual(
    (await c.listEntries("t")).map((e) => e.id),
    ["c", "a", "d"],
  );
  assert.deepEqual(await c.setEntry({ subsystem: "t", sizeLimit: 9, id: "e", content: "0123456789" }), {
    success: false,
    reason: "entryTooLarge",
  });
  assert.deepEqual(await c.setEntry({ subsystem: "terminal-history", sizeLimit: 9, id: "a", content: 1 }), {
    success: false,
    reason: "entryStorageMismatch",
  });
});

test("persist storage keeps one entry per persist name", async () => {
  const backend = memoryInvoke(clock());
  const c = new LocalStorageClient(backend);
  const s = persistStorage(c, TERMINAL);
  assert.equal(await s.getItem(PERSIST_NAMES.terminalTabs), null);
  const state = JSON.stringify({ state: { terminals: [] }, version: 0 });
  await s.setItem(PERSIST_NAMES.terminalTabs, state);
  assert.equal(await s.getItem(PERSIST_NAMES.terminalTabs), state);
  assert.equal(backend.subsystem("terminal")?.sizeLimit, 100 * 1024 * 1024);
  await s.removeItem(PERSIST_NAMES.terminalTabs);
  assert.equal(await s.getItem(PERSIST_NAMES.terminalTabs), null);
  const small = persistStorage(c, { name: "tiny", sizeLimit: 2 });
  await assert.rejects(small.setItem("x", "long"), /Failed to persist local storage entry tiny:x: entryTooLarge/);
});

test("browser storage behaves like an async Storage", async () => {
  const c = new LocalStorageClient(memoryInvoke(clock()));
  const s = browserLocalStorage(c, BROWSER_LOCAL_STORAGE);
  await s.setItem("a", "1");
  await s.setItem("b", "2");
  assert.equal(await s.getItem("a"), "1");
  assert.equal(await s.getItem("zz"), null);
  assert.equal(await s.key(1), "b");
  assert.equal(await s.key(-1), null);
  assert.equal(await s.length, 2);
  await s.removeItem("a");
  assert.equal(await s.length, 1);
  await s.clear();
  assert.equal(await s.length, 0);
  await c.setEntry({ subsystem: BROWSER_LOCAL_STORAGE.name, sizeLimit: 100, id: "n", content: 5 });
  await assert.rejects(s.getItem("n"), /Invalid browser local storage value for n/);
});
