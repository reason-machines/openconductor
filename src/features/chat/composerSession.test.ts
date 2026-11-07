import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ComposerSession, composerSessionFor } from "./composerSession.ts";
import type { StoredDraft } from "../../lib/local-storage/composerDrafts.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function storage() {
  const saved = new Map<string, StoredDraft>();
  const writes: string[] = [];
  return {
    saved, writes,
    async load(id: string): Promise<StoredDraft> { return saved.get(id) ?? ""; },
    async save(id: string, message: string, attachments: readonly unknown[] = []) {
      writes.push(id);
      saved.set(id, attachments.length ? { message, attachments: [...attachments] } : message);
      return true;
    },
    async clear(id: string) { writes.push(id); saved.delete(id); },
  };
}
const chip = (name = "binary.png") => ({ name: `.context/attachments/abc123/${name}`, text: "File is in the workspace", staged: `.context/attachments/abc123/${name}` });
const file = (read = async () => new Uint8Array([0, 1]).buffer) => ({ name: "binary.png", size: 2, arrayBuffer: read });

test("same-workspace chat tabs retain independent text/chips before and after debounce", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const store = storage();
  const a = new ComposerSession("workspace", store);
  const b = new ComposerSession("chat-b", store);
  await a.connect();
  a.setDraft("A"); a.setAttachments([chip()]);
  a.disconnect();
  await b.connect();
  assert.equal(b.snapshot().draft, "");
  assert.deepEqual(b.snapshot().attachments, []);
  b.setDraft("B"); b.setAttachments([{ name: "note", text: "B note" }]);
  t.mock.timers.tick(301);
  b.disconnect();
  await a.connect();
  assert.equal(a.snapshot().draft, "A");
  assert.equal(a.snapshot().attachments[0]?.staged, chip().staged);
  a.disconnect();
  const restoredA = new ComposerSession("workspace", store);
  const restoredB = new ComposerSession("chat-b", store);
  await restoredA.connect(); await restoredB.connect();
  assert.equal(restoredA.snapshot().draft, "A");
  assert.equal(restoredB.snapshot().draft, "B");
  assert.equal(restoredB.snapshot().attachments[0]?.text, "B note");
  restoredA.disconnect(); restoredB.disconnect();
});

test("delayed hydration cannot overwrite typing, clearing or injected draft chips, even after leaving", async () => {
  const store = storage();
  const load = deferred<StoredDraft>();
  const a = new ComposerSession("a", { ...store, load: () => load.promise });
  const ready = a.connect();
  a.setDraft(""); a.setAttachments([{ name: "fork", text: "new" }]);
  a.disconnect();
  load.resolve({ message: "stale", attachments: [chip()] });
  await ready;
  assert.equal(a.snapshot().draft, "");
  assert.deepEqual(a.snapshot().attachments, [{ name: "fork", text: "new" }]);
  assert.deepEqual(store.saved.get("a"), { message: "", attachments: [{ name: "fork", text: "new" }] });
});

test("typing before hydration still restores untouched saved attachments", async () => {
  const store = storage(); const load = deferred<StoredDraft>();
  const a = new ComposerSession("a", { ...store, load: () => load.promise });
  const ready = a.connect(); a.setDraft("typed");
  load.resolve({ message: "old", attachments: [chip()] }); await ready;
  assert.equal(a.snapshot().draft, "typed"); assert.deepEqual(a.snapshot().attachments, [chip()]);
  a.disconnect();
});

for (const phase of ["read", "write"] as const) {
  test(`late ${phase} completion stays with originating chat and blocks premature send`, async () => {
    const store = storage(); const gate = deferred<ArrayBuffer>(); const written = deferred<void>();
    const a = new ComposerSession("a", store); const b = new ComposerSession("b", store);
    await a.connect(); a.setDraft("keep");
    const adding = a.attach([file(phase === "read" ? () => gate.promise : undefined)], async () => { if (phase === "write") await written.promise; });
    let sends = 0;
    assert.equal(await a.send(async () => {}, () => { sends++; }), false);
    a.disconnect(); await b.connect(); b.setDraft("B");
    gate.resolve(new Uint8Array([0]).buffer); written.resolve(); await adding;
    assert.equal(sends, 0); assert.equal(b.snapshot().draft, "B"); assert.deepEqual(b.snapshot().attachments, []);
    await a.connect(); assert.equal(a.snapshot().attachments.length, 1);
    assert.equal(await a.send(async () => {}, () => { sends++; }), true);
    assert.equal(sends, 1); assert.equal(a.snapshot().draft, ""); assert.deepEqual(a.snapshot().attachments, []);
    a.disconnect(); b.disconnect();
  });
}

test("failed binary copy sends nothing, retains text/chips, and retries already copied files without their removed staging", async () => {
  const store = storage(); const a = new ComposerSession("a", store); await a.connect();
  a.setDraft("keep me"); a.setAttachments([chip("one.png"), chip("two.png")]);
  let sends = 0; const copies: string[] = [];
  assert.equal(await a.send(async (path) => { copies.push(path); if (path.endsWith("two.png")) throw Error("copy refused"); }, () => { sends++; }), false);
  assert.equal(sends, 0); assert.equal(a.snapshot().draft, "keep me");
  assert.equal(a.snapshot().attachments.length, 2);
  assert.equal(a.snapshot().attachments[0]?.staged, undefined);
  assert.equal(a.snapshot().attachments[1]?.staged, chip("two.png").staged);
  assert.match(a.snapshot().error!, /Message not sent.*copy refused/);
  assert.equal(await a.send(async (path) => { copies.push(path); }, (attachments) => { sends++; assert.equal(attachments.length, 2); }), true);
  assert.deepEqual(copies, [chip("one.png").name, chip("two.png").name, chip("two.png").name]);
  assert.equal(sends, 1); assert.equal(a.snapshot().draft, ""); assert.deepEqual(a.snapshot().attachments, []);
  a.disconnect();
});

test("switch during copy cancels delivery, persists successful copy and retains retry on return", async () => {
  const store = storage(); const a = new ComposerSession("a", store); await a.connect();
  a.setDraft("keep"); a.setAttachments([chip()]); const copy = deferred<void>(); let sends = 0;
  const sending = a.send(() => copy.promise, () => { sends++; });
  a.disconnect(); await a.connect(); copy.resolve();
  assert.equal(await sending, false); assert.equal(sends, 0);
  assert.equal(a.snapshot().draft, "keep"); assert.equal(a.snapshot().attachments[0]?.staged, undefined);
  a.disconnect(); const restored = new ComposerSession("a", store); await restored.connect();
  assert.equal(await restored.send(async () => { assert.fail("stage already consumed"); }, () => { sends++; }), true);
  assert.equal(sends, 1); restored.disconnect();
});

test("duplicate submits are inhibited and edits during copy survive successful send", async () => {
  const a = new ComposerSession("a", storage()); await a.connect(); a.setDraft("first"); a.setAttachments([chip()]);
  const copy = deferred<void>(); let sends = 0;
  const sending = a.send(() => copy.promise, () => { sends++; });
  assert.equal(await a.send(async () => {}, () => { sends++; }), false);
  a.setDraft("next"); await a.attach([file()]);
  assert.match(a.snapshot().error!, /attach the files again/);
  copy.resolve(); assert.equal(await sending, true);
  assert.equal(sends, 1); assert.equal(a.snapshot().draft, "next"); a.disconnect();
});

test("late read errors remain on the originating chat", async () => {
  const store = storage(); const a = new ComposerSession("a", store); const b = new ComposerSession("b", store);
  await a.connect(); const read = deferred<ArrayBuffer>(); const adding = a.attach([file(() => read.promise)]);
  a.disconnect(); await b.connect(); read.reject(Error("read refused")); await adding;
  assert.match(a.snapshot().error!, /read refused.*retry/); assert.equal(b.snapshot().error, null);
  b.disconnect();
});

test("unmount and remount during file write retain one owner and cannot orphan staged data", async () => {
  const store = storage(); const a = composerSessionFor("a", store); await a.connect();
  const write = deferred<void>(); const adding = a.attach([file()], () => write.promise);
  a.disconnect();
  const remounted = composerSessionFor("a", store); assert.equal(remounted, a); await remounted.connect();
  write.resolve(); await adding;
  assert.equal(remounted.snapshot().attachments.length, 1);
  assert.ok(remounted.snapshot().attachments[0]?.staged);
  remounted.disconnect(); assert.ok(store.saved.has("a"));
});

test("read/write rejection releases pending admission and failed copy releases send admission", async () => {
  const a = new ComposerSession("a", storage()); await a.connect(); a.setDraft("text");
  await a.attach([file(async () => { throw Error("read failure"); })]);
  assert.match(a.snapshot().error!, /read failure/);
  assert.equal(await a.send(async () => {}, () => {}), true);
  a.setDraft("retry");
  await a.attach([file()], async () => { throw Error("write failure"); });
  assert.match(a.snapshot().error!, /write failure/);
  assert.equal(await a.send(async () => {}, () => {}), true);
  a.setDraft("copy"); a.setAttachments([chip()]);
  assert.equal(await a.send(async () => { throw Error("copy failure"); }, () => assert.fail()), false);
  assert.equal(a.sending, false);
  assert.equal(await a.send(async () => {}, () => {}), true);
  a.disconnect();
});

test("React uses the tested session owner, chat identity, and workspace-native staging identity", () => {
  const workspace = readFileSync(new URL("../../components/WorkspaceView.tsx", import.meta.url), "utf8");
  const composer = readFileSync(new URL("./Composer.tsx", import.meta.url), "utf8");
  assert.match(workspace, /composerSessionFor\(chatId, composerDrafts\(\)\)/);
  assert.match(workspace, /useSyncExternalStore\(session.subscribe, session.snapshot\)/);
  assert.match(workspace, /session\.attach\(files/); assert.match(workspace, /await session\.send\(/);
  assert.match(workspace, /draftWorkspaceId: workspace.id/); assert.match(workspace, /localWorkspaceId: workspace.id/);
  assert.match(workspace, /clearOnSubmit=\{planWaiting !== undefined\}/);
  assert.match(composer, /if \(clearOnSubmit\) setDraft\(""\)/);
});
