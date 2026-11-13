import assert from "node:assert/strict";
import test from "node:test";
import { readText, type TextRead } from "./readText.ts";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

for (const text of ["", "const café = '海';\r\n", "without final newline"]) {
  test(`generic read preserves exact text ${JSON.stringify(text)}`, async () => {
    const states: TextRead[] = [];
    readText(async () => text, (state) => states.push(state));
    assert.deepEqual(states, [{ kind: "loading" }]);
    await settle();
    assert.deepEqual(states, [{ kind: "loading" }, { kind: "ready", text }]);
  });
}

for (const read of [() => { throw new Error("refused"); }, () => Promise.reject(new Error("refused"))]) {
  test("a failed read never becomes an editable empty document", async () => {
    const states: TextRead[] = [];
    readText(read, (state) => states.push(state));
    await settle();
    assert.deepEqual(states, [{ kind: "loading" }, { kind: "error", message: "Error: refused" }]);
  });
}

test("replacing a worktree/path cancels late successful publication", async () => {
  const states: TextRead[] = [];
  let resolve: (text: string) => void = () => {};
  const old = new Promise<string>((yes) => { resolve = yes; });
  const cancel = readText(() => old, (state) => states.push(state));
  cancel();
  readText(async () => "current", (state) => states.push(state));
  await settle();
  resolve("stale");
  await settle();
  assert.deepEqual(states, [{ kind: "loading" }, { kind: "loading" }, { kind: "ready", text: "current" }]);
});

test("unmount cancels late read errors", async () => {
  const states: TextRead[] = [];
  let reject: (error: Error) => void = () => {};
  const old = new Promise<string>((_, no) => { reject = no; });
  const cancel = readText(() => old, (state) => states.push(state));
  cancel();
  reject(new Error("late"));
  await settle();
  assert.deepEqual(states, [{ kind: "loading" }]);
});
