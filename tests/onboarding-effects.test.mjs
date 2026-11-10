import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { runInNewContext } from "node:vm";

const deps = createRequire(resolve(process.env.REACT_EFFECTS_DEPS ?? ".qa/react-effects-deps", "package.json"));
const React = deps("react");
const { act, create } = deps("react-test-renderer");
const ts = deps("typescript");
const account = {
  version: "fixture", name: "Fixture", email: "fixture@example.invalid", credential: "login",
  error: null, organization: "Fixture workspace", workspaces: [
    { slug: "fixture", name: "Fixture workspace", selected: true, connected: true },
  ], computerConnected: true,
};
const waiting = { state: "waiting", attemptId: "fixture-1", prompt: { url: "https://example.invalid/sign-in", code: "FIXTURE" } };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

async function fixture({ initial = { state: "idle" }, surface = "gate" } = {}) {
  const requests = [], opens = [], remembered = [], callbacks = [], timers = new Map(), intervals = new Map();
  const errors = [], navigations = [], writes = [], modules = new Map();
  let status = initial, read, sequence = 0, root;
  const window = {
    location: { pathname: "/", search: "" },
    history: { state: null, replaceState(_state, _unused, url) { navigations.push(url); } },
    setInterval(callback) { const id = ++sequence; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
  };
  const boundaries = {
    "@tauri-apps/api/core": { async invoke(command, args) {
      requests.push({ command, args });
      if (command === "reason_login_status") return read ? read.promise : status;
      if (command === "reason_login_start") return status = waiting;
      if (command === "reason_login_cancel") return status = { state: "cancelled" };
      throw new Error(`Unexpected IPC: ${command}`);
    } },
    "src/backend": { inTauri: () => true, async openUrl(url) { opens.push(url); } },
    "src/settings/connectedDefault": { async rememberConnection(agent) { remembered.push(agent); } },
    "src/settings/api": { async getSettings() { return {}; } },
    "src/settings/appearance": { applyAppearance() {} },
    "src/onboarding/api": {
      async readFirstRunStep() { return null; }, async countRepos() { return 0; },
      finishFirstRun() { const result = deferred(); writes.push(result); return result.promise; },
    },
    "src/keybindings/KeybindingsProvider": { useKeybindings() {} },
    "src/components/AppMark": { AppMark: () => null },
    "src/components/Icons": { ArrowRightIcon: () => null, CloseIcon: () => null },
    "src/components/sidebarMotion": { endingProps: () => ({}) },
  };
  function load(file) {
    file = file.replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
    if (Object.hasOwn(boundaries, file)) return boundaries[file];
    if (modules.has(file)) return modules.get(file).exports;
    const path = [file + ".tsx", file + ".ts"].find((path) => {
      try { readFileSync(path); return true; } catch { return false; }
    });
    assert.ok(path, `Unmapped source dependency ${file}`);
    const module = { exports: {} };
    modules.set(file, module);
    let source = readFileSync(path, "utf8");
    const mutations = {
      "advance-before-save": ["src/onboarding/FirstRunGate", "finishFirstRun().then(", "(finishFirstRun(), Promise.resolve()).then("],
      "skip-validation": ["src/onboarding/reasonSignIn", "if (!signedIn(account)) return", "if (false) return"],
      "repeat-callback": ["src/onboarding/SignIn", "if (!account || connectedNotified.current) return;", "if (!account) return;"],
    };
    const mutation = mutations[process.env.EFFECTS_MUTATION];
    if (mutation && file === mutation[0]) {
      assert.equal(source.split(mutation[1]).length, 2, "mutation matches exactly once");
      source = source.replace(mutation[1], mutation[2]);
    }
    const javascript = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const require = (name) => {
      if (name === "react" || name === "react/jsx-runtime") return deps(name);
      if (name.endsWith(".css")) return {};
      if (Object.hasOwn(boundaries, name)) return boundaries[name];
      assert.ok(name.startsWith("."), `Unexpected external dependency ${name}`);
      return load(resolve(dirname(path), name).slice(process.cwd().length + 1));
    };
    runInNewContext(`(function(require,module,exports){${javascript}\n})`, {
      URL, URLSearchParams, Date, window,
      console: { error(...args) { errors.push(args.map(String).join(" ")); } },
      setTimeout(callback) { const id = ++sequence; timers.set(id, callback); return id; },
      clearTimeout(id) { timers.delete(id); },
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { FirstRunGate } = load("src/onboarding/FirstRunGate");
  const api = load("src/onboarding/reasonSignIn");
  const { LoginScreen } = load("src/onboarding/SignIn");
  const onDone = () => { callbacks.push("done"); };
  const onFailed = (title, description) => { callbacks.push({ title, description }); };
  const element = () => surface === "gate"
    ? React.createElement(FirstRunGate, {}, React.createElement("main", { "data-testid": "home" }, "Home"))
    : React.createElement(LoginScreen, { onDone, onFailed });
  await act(async () => { root = create(element()); });
  const all = (predicate) => root.root.findAll(predicate);
  const text = () => JSON.stringify(root.toJSON());
  return {
    requests, opens, remembered, callbacks, writes, errors, navigations, timers, intervals, root, api, text,
    count(id) { return all((node) => node.props["data-testid"] === id).length; },
    button(label) {
      const result = all((node) => node.type === "button" && node.children.filter((x) => typeof x === "string").join("") === label);
      assert.equal(result.length, 1, `One ${label} button`);
      return result[0];
    },
    async click(label) { const button = this.button(label); assert.notEqual(button.props.disabled, true, `${label} is enabled`); await act(async () => { button.props.onClick(); }); },
    async publish(next) { status = next; await act(async () => { await api.refreshReasonSignIn(); }); },
    async rerender() { await act(async () => { root.update(element()); }); },
    deferStatus() { read = deferred(); return read; },
    async close() { await act(async () => { root.unmount(); }); assert.equal(intervals.size, 0, "slide timers cleaned up on unmount"); },
  };
}

test("actual onboarding effect waits for validated account and durable finish before Home, once", async () => {
  const f = await fixture();
  try {
    assert.equal(f.writes.length, 0);
    await f.click("Sign up");
    assert.equal(f.count("reason-login-waiting"), 1);
    assert.equal(f.writes.length, 0, "browser handoff is not completion");
    assert.equal(f.opens.length, 1);
    await f.publish({ state: "connected", account });
    assert.equal(f.writes.length, 1, "actual account effect calls persistence");
    assert.equal(f.count("home"), 0, "Home waits for persistence");
    assert.equal(f.button("Continue").props.disabled, true);
    await f.rerender();
    await f.publish({ state: "connected", account: { ...account } });
    assert.equal(f.writes.length, 1, "rerender and repeated account notifications do not finish twice");
    assert.deepEqual(f.navigations, []);
    await act(async () => { f.writes[0].resolve(); });
    assert.equal(f.count("home"), 1);
    assert.deepEqual(f.navigations, ["/"]);
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test("rejected onboarding persistence remains visible and manual Continue retries successfully", async () => {
  const f = await fixture({ initial: { state: "connected", account } });
  try {
    assert.equal(f.writes.length, 1);
    await act(async () => { f.writes[0].reject(new Error("Synthetic persistence failure")); });
    assert.equal(f.count("home"), 0);
    assert.match(f.text(), /Couldn't finish setup/);
    assert.equal(f.button("Continue").props.disabled, false);
    await f.rerender();
    assert.equal(f.writes.length, 1, "failure does not silently auto-retry");
    await f.click("Continue");
    assert.equal(f.writes.length, 2);
    assert.equal(f.count("home"), 0);
    await act(async () => { f.writes[1].resolve(); });
    assert.equal(f.count("home"), 1);
    assert.deepEqual(f.navigations, ["/"]);
  } finally { await f.close(); }
});

for (const [label, invalid] of [
  ["account error", { ...account, error: "Synthetic account rejected" }],
  ["empty identity", { ...account, name: " ", email: " " }],
  ["malformed workspace", { ...account, workspaces: [{ slug: 1 }] }],
]) {
  test(`invalid account cannot invoke onboarding completion: ${label}`, async () => {
    const f = await fixture();
    try {
      await f.click("Sign up");
      await f.publish({ state: "connected", account: invalid });
      await f.rerender();
      assert.equal(f.count("home"), 0);
      assert.equal(f.count("reason-login-connected"), 0);
      assert.equal(f.writes.length, 0);
      assert.deepEqual(f.navigations, []);
    } finally { await f.close(); }
  });
}

test("cancelled attempt ignores a stale Connected callback before actual onboarding effect", async () => {
  const f = await fixture();
  try {
    await f.click("Sign up");
    const pending = f.deferStatus();
    const read = f.api.refreshReasonSignIn();
    await f.click("Cancel");
    await act(async () => { pending.resolve({ state: "connected", account }); await read; });
    assert.equal(f.count("reason-login-connected"), 0);
    assert.equal(f.writes.length, 0);
    assert.deepEqual(f.navigations, []);
    assert.equal(f.requests.some((x) => x.command === "reason_logout"), false);
  } finally { await f.close(); }
});

test("unmount before account result suppresses the completion callback", async () => {
  const f = await fixture({ surface: "login" });
  await f.click("Sign up");
  const pending = f.deferStatus();
  const read = f.api.refreshReasonSignIn();
  await f.close();
  await act(async () => { pending.resolve({ state: "connected", account }); await read; });
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.callbacks, []);
  assert.deepEqual(f.navigations, []);
});

test("actual SignUp failure callback and retry do not report success before validated completion", async () => {
  const f = await fixture({ surface: "login" });
  try {
    await f.click("Sign up");
    assert.deepEqual(f.callbacks, []);
    await f.publish({ state: "connected", account: { ...account, error: "Synthetic invalid account" } });
    assert.deepEqual(f.callbacks, [{ title: "Sign-in failed", description: "Synthetic invalid account" }]);
    await f.rerender();
    assert.equal(f.callbacks.length, 1, "rerender does not repeat the same failure callback");
    await f.click("Retry sign-in");
    assert.equal(f.callbacks.length, 1, "retry handoff is not successful completion");
    await f.publish({ state: "connected", account });
    assert.deepEqual(f.callbacks, [{ title: "Sign-in failed", description: "Synthetic invalid account" }, "done"]);
    await f.rerender();
    await f.publish({ state: "connected", account: { ...account } });
    assert.equal(f.callbacks.filter((value) => value === "done").length, 1);
  } finally { await f.close(); }
});
