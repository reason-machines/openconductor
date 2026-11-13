import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

// Synthetic adapter test, not an authentication or native-app observation.
const dependencies = createRequire(resolve(process.env.RETRY_REACT_DEPS ?? ".", "package.json"));
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = resolve(".");
const receipt = JSON.parse(readFileSync(resolve(process.env.RETRY_PACKET, "source-receipt.json"), "utf8"));
const allowed = new Set(receipt.execution_graph.map((path) => resolve(root, path)));
const tick = () => new Promise((done) => setImmediate(done));

function fixture(chatId) {
  let signIn = { state: { state: "idle" } };
  let connected = false;
  let deliver;
  let mounted;
  const signInListeners = new Set();
  const modules = new Map();
  const prompts = [];
  const storage = new Map();
  const boundaries = new Map([
    [resolve(root, "src/onboarding/reasonSignIn"), {
      useReasonSignIn: () => React.useSyncExternalStore(
        (notify) => { signInListeners.add(notify); return () => signInListeners.delete(notify); },
        () => signIn,
        () => signIn,
      ),
    }],
    [resolve(root, "src/onboarding/ReasonSignInControls"), { ReasonSignInControls: () => null }],
    [resolve(root, "src/features/chat/ChatModelPicker.tsx"), {
      openAgentSettings() { assert.fail("This Reason continuation must not open provider settings"); },
    }],
  ]);
  function load(path) {
    if (boundaries.has(path)) return boundaries.get(path);
    assert.ok(allowed.has(path), `Unqualified production module: ${path}`);
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} };
    modules.set(path, module);
    const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const require = (name) => {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name.startsWith("."), `Unqualified external import: ${name}`);
      const exact = resolve(dirname(path), name);
      const target = [exact, `${exact}.ts`, `${exact}.tsx`].find((candidate) => boundaries.has(candidate) || allowed.has(candidate));
      assert.ok(target, `Unqualified source import: ${name} from ${path}`);
      return load(target);
    };
    runInNewContext(`(function(require,module,exports){\n${compiled}\n})`, {
      crypto: { randomUUID }, Date, setTimeout, clearTimeout, console,
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { createChatRuntime } = load(resolve(root, "src/features/chat/chatRuntime.ts"));
  const { applyReasonPayload } = load(resolve(root, "src/features/chat/reason.ts"));
  const { retryUserPrompt } = load(resolve(root, "src/features/chat/userContent.ts"));
  const { ChatSignInCard } = load(resolve(root, "src/features/chat/ChatSignInCard.tsx"));
  const runtime = createChatRuntime({
    canSteer: true, defaultConfig: [], parseConfig: () => null,
    sessionKey: (id) => `multiple-retry.session.${id}`, configKey: (id) => `multiple-retry.config.${id}`,
    async listen(next) { deliver = next; },
    async open() {
      if (!connected) throw new Error("Authentication required. Sign in to Reason to send this message.");
    },
    async prompt(request) { prompts.push(request); return {}; },
    cancel() {},
  }, {
    persist: false,
    async invoke() { return null; },
    recordTurnChanges() {},
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); },
      removeItem: (key) => { storage.delete(key); },
    },
  });
  // Adapter matches the retained Transcript failed-card -> WorkspaceView retry consumer.
  // The production card, effects, queue and chat runtime execute unchanged.
  function FailedCards() {
    const [snapshot, setSnapshot] = React.useState(() => runtime.snapshot(chatId));
    React.useEffect(() => runtime.subscribe(chatId, setSnapshot), []);
    return React.createElement(React.Fragment, null, ...snapshot.transcript.messages
      .filter((message) => message.role === "user" && snapshot.transcript.turns[message.turnId]?.status === "failed")
      .map((message) => React.createElement(ChatSignInCard, {
        key: message.id, agent: "reason",
        onSignedIn: () => runtime.retryUnsent(chatId, "/synthetic/multiple-retry", retryUserPrompt(message), message.turnId),
      })));
  }
  return {
    runtime, prompts,
    async fail(text) {
      runtime.submit(chatId, "/synthetic/multiple-retry", { text }, "queue");
      await tick();
      const snapshot = runtime.snapshot(chatId);
      const user = snapshot.transcript.messages.at(-1);
      assert.equal(user?.role, "user");
      assert.equal(snapshot.transcript.turns[user.turnId]?.status, "failed", "setup reaches a genuine runtime open rejection");
      assert.match(snapshot.transcript.turns[user.turnId]?.error ?? "", /Authentication required/);
      assert.equal(snapshot.queue.items.length, 0);
      assert.equal(prompts.length, 0);
      return user;
    },
    async mount() { await act(async () => { mounted = create(React.createElement(FailedCards)); }); },
    async connect() {
      connected = true;
      signIn = { state: { state: "connected" } };
      await act(async () => { for (const listener of [...signInListeners]) listener(); await tick(); });
    },
    async finish() {
      assert.equal(typeof deliver, "function");
      await act(async () => {
        deliver(chatId, (state) => applyReasonPayload(state, { chatId, type: "text", text: "Synthetic backend reply" }));
        deliver(chatId, (state) => applyReasonPayload(state, { chatId, type: "turnEnded", end: { outcome: "completed" } }));
        await tick();
      });
    },
    async rerender() { await act(async () => { mounted.update(React.createElement(FailedCards)); await tick(); }); },
    async close() { if (mounted) await act(async () => { mounted.unmount(); }); },
  };
}

test("one signed-out message resumes once after a connected notification", async () => {
  const f = fixture("multiple-retry-single-control");
  try {
    const original = await f.fail("Only unsent message");
    await f.mount();
    await f.connect();
    assert.equal(f.prompts.length, 1, "control observes delivery through the real runtime boundary");
    assert.equal(f.prompts[0].text, "Only unsent message");
    assert.equal(f.runtime.snapshot("multiple-retry-single-control").transcript.activeTurn, original.turnId);
    await f.finish();
    await f.connect();
    await f.rerender();
    assert.equal(f.prompts.length, 1, "a second connected notification does not duplicate the send");
  } finally { await f.close(); }
});

test("two signed-out messages both resume after pairing without a manual second retry", async () => {
  const chatId = "multiple-retry-two-failed";
  const f = fixture(chatId);
  try {
    const first = await f.fail("First unsent message");
    const second = await f.fail("Second unsent message");
    assert.notEqual(first.turnId, second.turnId);
    await f.mount();
    await f.connect();
    assert.equal(f.prompts.length, 1, "setup begins the first continuation before its synthetic completion");
    await f.finish();
    await f.rerender();
    assert.equal(f.prompts.length, 2, "second failed message is not lost when the first retry was working");
    assert.deepEqual(f.prompts.map((request) => request.text), ["First unsent message", "Second unsent message"]);
    assert.equal(f.runtime.snapshot(chatId).transcript.activeTurn, second.turnId);
    assert.equal(f.runtime.snapshot(chatId).transcript.messages.filter((message) => message.role === "user").length, 2);
    await f.finish();
    await f.connect();
    assert.equal(f.prompts.length, 2, "repeated account notification cannot resend either accepted message");
  } finally { await f.close(); }
});
