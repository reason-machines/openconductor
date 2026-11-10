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

async function fixture({ initial = { state: "idle" }, surface = "gate", installing = false, path = "/", step = null, repoCount = 0, cliWarning } = {}) {
  const installation = installing ? deferred() : null;
  const requests = [], opens = [], remembered = [], callbacks = [], timers = new Map(), intervals = new Map();
  const errors = [], navigations = [], writes = [], modules = new Map();
  let status = initial, read, sequence = 0, root;
  const window = {
    location: { pathname: path, search: "" },
    history: { state: null, replaceState(_state, _unused, url) { navigations.push(url); } },
    setInterval(callback) { const id = ++sequence; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
  };
  const boundaries = {
    "@tauri-apps/api/core": { async invoke(command, args) {
      requests.push({ command, args });
      if (command === "reason_cli_ensure_current") return installation ? installation.promise : { path: "/fixture/bin/reason", version: "fixture", warning: cliWarning };
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
      async readFirstRunStep() { return step; }, async countRepos() { return repoCount; },
      finishFirstRun(agent) { const result = deferred(); result.agent = agent; writes.push(result); return result.promise; },
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
      "advance-before-save": ["src/onboarding/FirstRunGate", "finishFirstRun(agent).then(", "(finishFirstRun(agent), Promise.resolve()).then("],
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
  const { ReasonSignInControls } = load("src/onboarding/ReasonSignInControls");
  const onDone = () => { callbacks.push("done"); };
  const onFailed = (title, description) => { callbacks.push({ title, description }); };
  const element = () => surface === "gate"
    ? React.createElement(FirstRunGate, {}, React.createElement("main", { "data-testid": "home" }, "Home"))
    : surface === "controls"
      ? React.createElement(ReasonSignInControls, { label: "Sign in to Reason", onSignedIn: onDone })
      : React.createElement(LoginScreen, { onDone, onFailed });
  await act(async () => { root = create(element()); });
  const all = (predicate) => root.root.findAll(predicate);
  const text = () => JSON.stringify(root.toJSON());
  return {
    requests, opens, remembered, callbacks, writes, errors, navigations, timers, intervals, root, api, text, installation,
    count(id) { return all((node) => node.props["data-testid"] === id).length; },
    button(label) {
      const result = all((node) => node.type === "button" && node.children.filter((x) => typeof x === "string").join("") === label);
      assert.equal(result.length, 1, `One ${label} button`);
      return result[0];
    },
    async selectAgent(agent) { await act(async () => { root.root.findByProps({ type: "radio", value: agent }).props.onChange(); }); },
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
    assert.equal(f.writes.length, 0, "sign-in is separate from choosing an agent");
    await f.click("Continue");
    assert.equal(f.writes.length, 1, "explicit Continue calls persistence");
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
    assert.equal(f.writes.length, 0);
    await f.click("Continue");
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

for (const agent of ["claude", "codex", "reason"]) {
  test(`${agent} onboarding cannot skip CLI setup and saves its explicit choice without sign-in`, async () => {
    const f = await fixture({ installing: true });
    try {
      assert.equal(f.count("reason-cli-setup"), 1);
      assert.equal(f.writes.length, 0);
      await act(async () => { f.installation.resolve({ path: "/fixture/bin/reason", version: "fixture" }); });
      await f.selectAgent(agent);
      await f.click("Continue without signing in");
      assert.equal(f.requests.filter((r) => r.command === "reason_cli_ensure_current").length, 1);
      assert.equal(f.requests.filter((r) => r.command === "reason_login_start").length, 0);
      assert.equal(f.writes[0].agent, agent);
      await act(async () => { f.writes[0].resolve(); });
      assert.equal(f.count("home"), 1);
    } finally { await f.close(); }
  });
}

for (const [step, repoCount] of [["999", 0], [null, 1]]) {
  test(`existing user with working CLI reaches Home without onboarding or sign-in: step ${step}, repos ${repoCount}`, async () => {
    const f = await fixture({ step, repoCount });
    try {
      assert.equal(f.count("home"), 1);
      assert.equal(f.count("reason-cli-setup"), 0);
      assert.equal(f.writes.length, 0, "completed onboarding is not written again");
      assert.deepEqual(f.navigations, []);
      assert.equal(f.requests.filter((r) => r.command === "reason_cli_ensure_current").length, 1);
      assert.equal(f.requests.some((r) => r.command === "reason_login_start"), false);
      await f.rerender();
      assert.equal(f.count("home"), 1);
    } finally { await f.close(); }
  });
}

test("existing working CLI with an update warning opens Home and leaves sign-in optional", async () => {
  const warning = "The Reason CLI update could not be verified. Using the installed CLI.";
  const f = await fixture({ step: "999", cliWarning: warning });
  try {
    assert.equal(f.count("home"), 1);
    assert.equal(f.count("reason-cli-setup"), 0);
    assert.ok(f.text().includes(warning), "degraded startup is visible, not reported as current");
    assert.equal(f.writes.length, 0);
    assert.equal(f.requests.some((r) => r.command === "reason_login_start"), false);
    await act(async () => { f.root.root.findByProps({ "aria-label": "Dismiss" }).props.onClick(); });
    assert.equal(f.count("home"), 1, "dismissing the warning does not reopen setup");
  } finally { await f.close(); }
});

for (const [path, step] of [["/", "999"], ["/login", null]]) {
  test(`CLI setup also gates ${path} with completed-step ${step}`, async () => {
    const f = await fixture({ path, step, installing: true });
    try {
      assert.equal(f.count("reason-cli-setup"), 1);
      assert.equal(f.count("home"), 0);
      await act(async () => { f.installation.resolve({ path: "/fixture/bin/reason", version: "fixture" }); });
      assert.equal(f.count("reason-cli-setup"), 0);
      assert.equal(f.count("home"), path === "/" ? 1 : 0);
    } finally { await f.close(); }
  });
}

test("only the clicked inline sign-in resumes once after validated pairing", async () => {
  const f = await fixture({ surface: "controls" });
  try {
    await f.click("Sign in to Reason");
    assert.deepEqual(f.callbacks, []);
    await f.publish({ state: "connected", account });
    assert.deepEqual(f.callbacks, ["done"]);
    await f.rerender();
    await f.publish({ state: "connected", account: { ...account } });
    assert.deepEqual(f.callbacks, ["done"]);
  } finally { await f.close(); }
});

test("background sign-in and cancelled inline pairing never send a continuation", async () => {
  const existing = await fixture({ surface: "controls", initial: { state: "connected", account } });
  try { assert.deepEqual(existing.callbacks, []); } finally { await existing.close(); }
  const cancelled = await fixture({ surface: "controls" });
  try {
    await cancelled.click("Sign in to Reason");
    await cancelled.click("Cancel");
    await cancelled.publish({ state: "connected", account });
    assert.deepEqual(cancelled.callbacks, []);
  } finally { await cancelled.close(); }
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
