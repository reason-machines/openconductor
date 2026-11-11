import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { composerPrompt } from "./composerDocument.ts";
import { submittedUserPrompt, type UserPrompt } from "./userContent.ts";
import type { SendMode } from "./queue.ts";

function deferred() {
  let resolve = () => {};
  let reject = (_error: Error) => {};
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(deliver: (input: UserPrompt, mode: SendMode, clear: () => void) => void | Promise<void>) {
  const source = readFileSync(new URL("./Composer.tsx", import.meta.url), "utf8");
  const start = source.indexOf("  function submit(opposite:");
  assert.notEqual(start, -1);
  const end = source.indexOf("\n  }", start) + "\n  }".length;
  const code = stripTypeScriptTypes(source.slice(start, end));
  let draft = "Keep this draft";
  let pending: void | Promise<void>;
  const calls: { input: UserPrompt; mode: SendMode }[] = [];
  const clear = () => { draft = ""; };
  const bindings = {
    inputRef: { current: { composing: () => false } }, draft,
    submittedUserPrompt, composerPrompt, hasAttachments: false,
    onCommand: undefined, working: false, mode: () => "queue", clearOnSubmit: true,
    setDraft: (text: string) => { draft = text; },
    onSubmit: (input: UserPrompt, mode: SendMode) => {
      calls.push({ input, mode });
      pending = deliver(input, mode, clear);
      return pending;
    },
  };
  const submit = new Function(...Object.keys(bindings), `${code}; return submit;`)(...Object.values(bindings));
  return { submit: () => submit(false), draft: () => draft, done: () => pending, calls };
}

test("actual Composer synchronous submission still clears after delivery", () => {
  let observed = "";
  const f = fixture((input) => { observed = input.text; });
  f.submit();
  assert.equal(observed, "Keep this draft");
  assert.equal(f.draft(), "");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]?.mode, "queue");
});

test("actual Composer asynchronous submission leaves clearing to its successful owner", async () => {
  const delivery = deferred();
  const f = fixture(async (_input, _mode, clear) => { await delivery.promise; clear(); });
  f.submit();
  assert.equal(f.draft(), "Keep this draft", "do not clear before the owner accepts delivery");
  delivery.resolve();
  await f.done();
  assert.equal(f.draft(), "");
});

test("actual Composer asynchronous owner preserves a not-ready draft", async () => {
  const f = fixture(async () => {});
  f.submit();
  await f.done();
  assert.equal(f.draft(), "Keep this draft");
});

test("actual Composer asynchronous owner preserves a rejected draft", async () => {
  const delivery = deferred();
  let error = "";
  const f = fixture(async (_input, _mode, clear) => {
    try { await delivery.promise; clear(); }
    catch (cause) { error = String(cause); }
  });
  f.submit();
  assert.equal(f.draft(), "Keep this draft");
  delivery.reject(new Error("Delivery rejected"));
  await f.done();
  assert.match(error, /Delivery rejected/);
  assert.equal(f.draft(), "Keep this draft");
});
