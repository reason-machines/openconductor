import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const [ref] = process.argv.slice(2);
const readSource = (path) => ref
  ? execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" })
  : readFileSync(path, "utf8");
const host = readSource("src/components/WorkspaceView.tsx");
const dialog = readSource("src/components/RenameChatDialog.tsx");
const invocation = host.match(/<RenameChatDialog\b([\s\S]*?)\n\s*\/>/)?.[1];
const submitSource = dialog.match(/  async function submit\(\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(invocation, "locate the actual production RenameChatDialog invocation");
assert.ok(submitSource, "locate the complete actual production submit closure");

function expression(name, scope) {
  const body = invocation.match(new RegExp(`\\b${name}=\\{([^\\n]+)\\}`))?.[1];
  assert.ok(body, `read the actual production ${name} expression`);
  return new Function(...Object.keys(scope), `return (${body});`)(...Object.values(scope));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function scenario(value = "Renamed A") {
  const original = { chatId: "chat-a", title: "Chat A" };
  let active = original;
  const saved = deferred();
  const requests = [];
  const errors = [];
  const pending = [];
  const close = expression("onClose", {
    renaming: original,
    setRenaming(update) { active = typeof update === "function" ? update(active) : update; },
  });
  const rename = expression("onRename", {
    renaming: original,
    renameChat(chatId, title) { requests.push({ chatId, title }); return saved.promise; },
  });
  const submit = new Function("pending", "value", "currentTitle", "onRename", "onClose", "onError", "setPending", `${submitSource}\nreturn submit;`)(
    false, value, original.title, rename, close, (message) => errors.push(message), (next) => pending.push(next),
  );
  return { original, saved, requests, errors, pending, close, submit,
    show(next) { active = next; }, current() { return active; } };
}

test("a completed save cannot close another chat opened after Cancel", async () => {
  const run = scenario();
  const submission = run.submit();
  assert.deepEqual(run.requests, [{ chatId: "chat-a", title: "Renamed A" }]);
  assert.deepEqual(run.pending, [true]);
  run.close();
  assert.equal(run.current(), null, "Cancel closes A while its save is pending");
  const replacement = { chatId: "chat-b", title: "Chat B" };
  run.show(replacement);
  run.saved.resolve();
  await submission;
  assert.deepEqual(run.current(), replacement, "A's late success must preserve B");
  assert.equal(run.requests.length, 1, "dismissal does not dispatch another rename");
});

test("successful save still closes its active chat", async () => {
  const run = scenario();
  const submission = run.submit();
  run.saved.resolve();
  await submission;
  assert.equal(run.current(), null);
});

test("ordinary close still dismisses the active chat", () => {
  const run = scenario();
  run.close();
  assert.equal(run.current(), null);
  assert.equal(run.requests.length, 0);
});

test("late success after Cancel without replacement leaves the dialog closed", async () => {
  const run = scenario();
  const submission = run.submit();
  run.close();
  run.saved.resolve();
  await submission;
  assert.equal(run.current(), null);
});

test("the reference's same-session success rule is retained", async () => {
  const run = scenario();
  const submission = run.submit();
  run.close();
  run.show({ chatId: "chat-a", title: "Reopened A" });
  run.saved.resolve();
  await submission;
  assert.equal(run.current(), null, "the guard is session identity, not a new generation policy");
});

test("a rejected save reports its error and does not close a replacement", async () => {
  const run = scenario();
  const submission = run.submit();
  run.close();
  const replacement = { chatId: "chat-b", title: "Chat B" };
  run.show(replacement);
  run.saved.reject(new Error("Rename failed"));
  await submission;
  assert.deepEqual(run.current(), replacement);
  assert.deepEqual(run.errors, ["Rename failed"]);
  assert.deepEqual(run.pending, [true, false]);
});

for (const value of ["   ", " Chat A "]) {
  test(`blank or unchanged trimmed title closes without a save: ${JSON.stringify(value)}`, async () => {
    const run = scenario(value);
    await run.submit();
    assert.equal(run.current(), null);
    assert.equal(run.requests.length, 0);
    assert.deepEqual(run.pending, []);
  });
}

test("the host key follows chat identity, not the editable title", () => {
  const key = (chatId, title) => expression("key", { renaming: { chatId, title } });
  assert.equal(key("chat-a", "Chat A"), key("chat-a", "Renamed A"));
  assert.notEqual(key("chat-a", "Same title"), key("chat-b", "Same title"));
});

console.log("SOURCE BOUNDARY ONLY: production submit and host callbacks are evaluated with a deferred save and an in-memory setter; the key check is a source invariant, not a React remount observation. No app, browser, native, provider, or database operation.");
