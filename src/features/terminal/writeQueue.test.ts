import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { createPtyWriter } from "./writeQueue.ts";

function deferred() {
  let resolve: (() => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return {
    promise,
    resolve() { assert.ok(resolve); resolve(); },
    reject(error: Error) { assert.ok(reject); reject(error); },
  };
}

test("terminal input preserves the exact command when later transport work completes first", async (t) => {
  const command = "echo oc-term-$((6*7)); pwd\r";
  const chunks = ["echo oc", "-", "t", "erm-$((6*7)); pwd\r"];
  assert.equal(chunks.join(""), command);
  const gates = chunks.map(() => deferred());
  const received: string[] = [];
  const write = createPtyWriter(async (id, data) => {
    assert.equal(id, "term-a");
    const index = chunks.indexOf(data);
    assert.notEqual(index, -1);
    await gates[index].promise;
    received.push(data);
  });
  const pending = chunks.map((chunk) => write("term-a", chunk));
  t.after(async () => {
    gates.forEach((gate) => gate.resolve());
    await Promise.allSettled(pending);
  });

  gates[0].resolve();
  await pending[0];
  gates[2].resolve();
  await nextTurn();
  gates[1].resolve();
  await Promise.all(pending.slice(0, 3));
  gates[3].resolve();
  await Promise.all(pending);
  assert.equal(received.join(""), command);
});

test("only one send is in flight per terminal and callers resolve after their own send", async (t) => {
  const gates = [deferred(), deferred()];
  const started: string[] = [];
  let firstDone = false;
  let secondDone = false;
  const write = createPtyWriter(async (_id, data) => {
    started.push(data);
    await gates[data === "first" ? 0 : 1].promise;
  });
  const first = write("term-a", "first").then(() => { firstDone = true; });
  const second = write("term-a", "second").then(() => { secondDone = true; });
  t.after(async () => {
    gates.forEach((gate) => gate.resolve());
    await Promise.allSettled([first, second]);
  });

  await nextTurn();
  assert.deepEqual(started, ["first"]);
  assert.equal(firstDone, false);
  assert.equal(secondDone, false);
  gates[0].resolve();
  await first;
  await nextTurn();
  assert.deepEqual(started, ["first", "second"]);
  assert.equal(firstDone, true);
  assert.equal(secondDone, false);
  gates[1].resolve();
  await second;
  assert.equal(secondDone, true);
});

test("a blocked terminal does not block input to a different terminal", async (t) => {
  const gate = deferred();
  const received: string[] = [];
  const write = createPtyWriter(async (id, data) => {
    if (id === "term-a") await gate.promise;
    received.push(`${id}:${data}`);
  });
  const blocked = write("term-a", "a");
  t.after(async () => { gate.resolve(); await blocked; });
  await write("term-b", "b");
  assert.deepEqual(received, ["term-b:b"]);
  gate.resolve();
  await blocked;
  assert.deepEqual(received, ["term-b:b", "term-a:a"]);
});

test("a send rejection reaches its caller without poisoning the next input", async (t) => {
  const gate = deferred();
  const failure = new Error("PTY write failed");
  const started: string[] = [];
  const write = createPtyWriter(async (_id, data) => {
    started.push(data);
    if (data === "first") await gate.promise;
  });
  const first = write("term-a", "first");
  const rejection = assert.rejects(first, (error: unknown) => error === failure);
  const second = write("term-a", "second");
  t.after(async () => { gate.resolve(); await Promise.allSettled([first, second]); });
  await nextTurn();
  const beforeRejection = [...started];
  gate.reject(failure);
  await rejection;
  await second;
  assert.deepEqual(beforeRejection, ["first"]);
  assert.deepEqual(started, ["first", "second"]);
  await write("term-a", "third");
  assert.deepEqual(started, ["first", "second", "third"]);
});

test("completion of an earlier write cannot let new input bypass an already queued write", async (t) => {
  const gates = [deferred(), deferred(), deferred()];
  const chunks = ["first", "second", "third"];
  const started: string[] = [];
  const write = createPtyWriter(async (_id, data) => {
    started.push(data);
    const index = chunks.indexOf(data);
    if (index >= 0) await gates[index].promise;
  });
  const pending = [write("term-a", "first"), write("term-a", "second")];
  t.after(async () => {
    gates.forEach((gate) => gate.resolve());
    await Promise.allSettled(pending);
  });
  gates[0].resolve();
  await pending[0];
  pending.push(write("term-a", "third"));
  await nextTurn();
  assert.deepEqual(started, ["first", "second"]);
  gates[1].resolve();
  await pending[1];
  await nextTurn();
  assert.deepEqual(started, chunks);
  gates[2].resolve();
  await pending[2];
  await write("term-a", "after drain");
  assert.deepEqual(started, [...chunks, "after drain"]);
});

test("a synchronous transport error rejects its write and the queue recovers", async () => {
  const failure = new Error("transport unavailable");
  const received: string[] = [];
  const write = createPtyWriter((_id, data) => {
    if (data === "bad") throw failure;
    received.push(data);
    return Promise.resolve();
  });
  const first = write("term-a", "bad");
  const rejection = assert.rejects(first, (error: unknown) => error === failure);
  const second = write("term-a", "good");
  await rejection;
  await second;
  assert.deepEqual(received, ["good"]);
});
