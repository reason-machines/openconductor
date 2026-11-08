import assert from "node:assert/strict";
import test from "node:test";
import { readMarkdown, type MarkdownRead } from "./readMarkdown.ts";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve: (text: string) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("a read publishes loading then the complete UTF-8 text", async () => {
  const states: MarkdownRead[] = [];
  readMarkdown(async () => "# café\n", (state) => states.push(state));
  assert.deepEqual(states, [{ kind: "loading" }]);
  await settle();
  assert.deepEqual(states, [{ kind: "loading" }, { kind: "ready", text: "# café\n" }]);
});

test("read errors are surfaced instead of leaving preview pending", async () => {
  const states: MarkdownRead[] = [];
  readMarkdown(async () => { throw new Error("not UTF-8"); }, (state) => states.push(state));
  await settle();
  assert.deepEqual(states, [{ kind: "loading" }, { kind: "error", message: "Error: not UTF-8" }]);
});

test("closing or replacing a file cancels publication of its late read", async () => {
  const states: MarkdownRead[] = [];
  const old = deferred();
  const cancel = readMarkdown(() => old.promise, (state) => states.push(state));
  cancel();
  readMarkdown(async () => "new file", (state) => states.push(state));
  await settle();
  old.resolve("old file");
  await settle();
  assert.deepEqual(states, [{ kind: "loading" }, { kind: "loading" }, { kind: "ready", text: "new file" }]);
});

test("a rejected read cannot publish after unmount", async () => {
  const states: MarkdownRead[] = [];
  const pending = deferred();
  const cancel = readMarkdown(() => pending.promise, (state) => states.push(state));
  cancel();
  pending.reject(new Error("late"));
  await settle();
  assert.deepEqual(states, [{ kind: "loading" }]);
});
