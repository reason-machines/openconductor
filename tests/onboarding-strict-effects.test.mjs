import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";

assert.notEqual(process.env.NODE_ENV, "production", "StrictEffects requires development React");
const deps = createRequire(resolve(process.env.ONBOARDING_DOM_DEPS ?? ".qa/onboarding-dom-deps", "package.json"));
const React = deps("react");
const { JSDOM } = deps("jsdom");
const ts = deps("typescript");
assert.equal(React.version, "18.3.1");
assert.equal(deps("react-dom/package.json").version, "18.3.1");
assert.equal(deps("jsdom/package.json").version, "26.1.0");
assert.equal(ts.version, "5.9.3");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://openconductor.invalid/first-run-onboarding" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = deps("react-dom/client");
const { act } = React;
after(() => { dom.window.close(); });

const account = {
  version: "fixture", name: "Fixture", email: "fixture@example.invalid", credential: "login", error: null,
  organization: "Fixture workspace", workspaces: [{ slug: "fixture", name: "Fixture workspace", selected: true, connected: true }],
  computerConnected: true,
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function fixture({ strict, initial = { state: "idle" }, surface = "gate", failStart = false }) {
  dom.reconfigure({ url: "https://openconductor.invalid/first-run-onboarding" });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const requests = [], events = [], callbacks = [], writes = [], errors = [], replay = [], unexpectedIpc = [];
  const timers = new Map(), intervals = new Map(), modules = new Map(), sources = new Map();
  let status = initial, nextRead, serial = 0, attempt = 0, mounted = true;
  const originalHistory = window.history.replaceState;
  const originalSetInterval = window.setInterval;
  const originalClearInterval = window.clearInterval;
  window.history.replaceState = function (state, unused, url) {
    events.push({ kind: "navigation", url });
    return originalHistory.call(this, state, unused, url);
  };
  window.setInterval = (callback) => { const id = ++serial; intervals.set(id, callback); return id; };
  window.clearInterval = (id) => { intervals.delete(id); };
  const boundaries = {
    "@tauri-apps/api/core": { async invoke(command, args) {
      requests.push({ command, args });
      if (command === "reason_cli_ensure_current") return { path: "/fixture/bin/reason", version: "fixture" };
      if (command === "db_first_run_onboarding_step") return null;
      if (command === "db_list_repos") return [];
      if (command === "db_finish_first_run_onboarding") {
        const result = deferred();
        writes.push(result);
        events.push({ kind: "finish-request", number: writes.length });
        return result.promise;
      }
      if (command === "reason_login_status") {
        if (nextRead) { const pending = nextRead; nextRead = undefined; return pending.promise; }
        return status;
      }
      if (command === "reason_login_start") {
        attempt++;
        if (failStart && attempt === 1) throw new Error("Synthetic start failure");
        status = { state: "waiting", attemptId: `fixture-${attempt}`, prompt: { url: "https://example.invalid/sign-in", code: "FIXTURE" } };
        return status;
      }
      if (command === "reason_login_cancel") return status = { state: "cancelled" };
      unexpectedIpc.push(command);
      throw new Error(`Unexpected IPC: ${command}`);
    } },
    "src/backend": { inTauri: () => true, async openUrl(url) { events.push({ kind: "open", url }); } },
    "src/settings/connectedDefault": { async rememberConnection(agent) { events.push({ kind: "remember", agent }); } },
    "src/settings/api": { async getSettings() { return {}; } },
    "src/settings/appearance": { applyAppearance() {} },
    "src/onboarding/firstRunAgent": { async selectFirstRunAgent() {} },
    "src/keybindings/KeybindingsProvider": { useKeybindings() {} },
    "src/components/AppMark": { AppMark: () => null },
    "src/components/Icons": { ArrowRightIcon: () => null, CloseIcon: () => null },
    "src/components/sidebarMotion": { endingProps: () => ({}) },
  };
  function load(file) {
    file = file.replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
    if (Object.hasOwn(boundaries, file)) return boundaries[file];
    if (modules.has(file)) return modules.get(file).exports;
    const path = [file + ".tsx", file + ".ts"].find(existsSync);
    assert.ok(path, `Unmapped source dependency ${file}`);
    const source = readFileSync(path, "utf8");
    sources.set(path, createHash("sha256").update(source).digest("hex"));
    const module = { exports: {} };
    modules.set(file, module);
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
      URL, URLSearchParams, Date, window, navigator: window.navigator,
      console: { error(...args) { errors.push(args.map(String).join(" ")); } },
      setTimeout(callback) { const id = ++serial; timers.set(id, callback); return id; },
      clearTimeout(id) { timers.delete(id); },
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { FirstRunGate } = load("src/onboarding/FirstRunGate");
  const { LoginScreen } = load("src/onboarding/SignIn");
  const api = load("src/onboarding/reasonSignIn");
  function ReplayProbe() {
    React.useEffect(() => { replay.push("setup"); return () => { replay.push("cleanup"); }; }, []);
    return null;
  }
  const onDone = () => { callbacks.push("done"); };
  const onFailed = (title, description) => { callbacks.push({ title, description }); };
  const element = () => React.createElement(strict ? React.StrictMode : React.Fragment, null,
    React.createElement(ReplayProbe),
    surface === "gate"
      ? React.createElement(FirstRunGate, {}, React.createElement("main", { "data-testid": "home" }, "Home"))
      : React.createElement(LoginScreen, { onDone, onFailed }),
  );
  await act(async () => { root.render(element()); });
  assert.deepEqual(replay, strict ? ["setup", "cleanup", "setup"] : ["setup"], "real development root lifecycle");
  if (surface === "gate") {
    assert.equal(requests.filter((r) => r.command === "db_first_run_onboarding_step").length, strict ? 2 : 1, "actual gate startup effect replays under StrictMode");
  }
  return {
    host, requests, events, callbacks, writes, errors, replay, sources, api,
    count(id) { return host.querySelectorAll(`[data-testid="${id}"]`).length; },
    button(label) {
      const buttons = [...host.querySelectorAll("button")].filter((button) => button.textContent.trim() === label);
      assert.equal(buttons.length, 1, `One ${label} button`);
      return buttons[0];
    },
    async click(label) {
      const button = this.button(label);
      assert.equal(button.disabled, false, `${label} is enabled`);
      await act(async () => { button.click(); });
    },
    async publish(next) {
      status = next;
      await act(async () => { await api.refreshReasonSignIn(); });
    },
    async rerender() { await act(async () => { root.render(element()); }); },
    deferStatus() { nextRead = deferred(); return nextRead; },
    async settleFinish(index, error) {
      events.push({ kind: error ? "finish-reject" : "finish-resolve", number: index + 1 });
      await act(async () => { error ? writes[index].reject(error) : writes[index].resolve(); });
    },
    async unmount() {
      if (!mounted) return;
      await act(async () => { root.unmount(); });
      mounted = false;
      assert.equal(intervals.size, 0, "actual onboarding interval cleanup ran");
      assert.deepEqual(replay, strict ? ["setup", "cleanup", "setup", "cleanup"] : ["setup", "cleanup"]);
    },
    async close() {
      await this.unmount();
      timers.clear();
      window.history.replaceState = originalHistory;
      window.setInterval = originalSetInterval;
      window.clearInterval = originalClearInterval;
      host.remove();
      assert.deepEqual(unexpectedIpc, [], "all IPC calls used explicit isolated boundaries");
    },
  };
}

for (const strict of [false, true]) {
  const mode = strict ? "development StrictEffects" : "non-Strict development control";
  test(`${mode}: full onboarding waits for validated account and persistence before Home`, async (t) => {
    const f = await fixture({ strict });
    try {
      assert.equal(f.writes.length, 0);
      await f.click("Sign up");
      assert.equal(f.count("reason-login-waiting"), 1);
      assert.equal(f.writes.length, 0, "handoff is not completion");
      assert.equal(f.events.filter((e) => e.kind === "open").length, 1);
      await f.publish({ state: "connected", account });
      assert.equal(f.writes.length, 1);
      assert.equal(f.count("home"), 0);
      assert.equal(f.button("Continue").disabled, true);
      await act(async () => { f.button("Continue").click(); });
      await f.rerender();
      await f.publish({ state: "connected", account: { ...account } });
      assert.equal(f.writes.length, 1, "disabled click, rerender, and account notification cannot duplicate pending save");
      assert.equal(f.events.filter((e) => e.kind === "navigation").length, 0);
      await f.settleFinish(0);
      assert.equal(f.count("home"), 1);
      assert.equal(f.events.filter((e) => e.kind === "navigation").length, 1);
      assert.ok(f.events.findIndex((e) => e.kind === "finish-resolve") < f.events.findIndex((e) => e.kind === "navigation"));
      assert.equal(window.location.pathname, "/");
      assert.deepEqual(f.errors, []);
      t.diagnostic(JSON.stringify({ replay: f.replay, events: f.events, sources: Object.fromEntries(f.sources) }));
    } finally { await f.close(); }
  });

  test(`${mode}: initially connected account starts only one pending finish`, async () => {
    const f = await fixture({ strict, initial: { state: "connected", account } });
    try {
      assert.equal(f.writes.length, 1);
      assert.equal(f.count("home"), 0);
      await f.rerender();
      await f.publish({ state: "connected", account: { ...account } });
      assert.equal(f.writes.length, 1);
      await f.settleFinish(0);
      assert.equal(f.count("home"), 1);
    } finally { await f.close(); }
  });

  test(`${mode}: rejected save remains visible and explicit Continue retries`, async () => {
    const f = await fixture({ strict, initial: { state: "connected", account } });
    try {
      assert.equal(f.writes.length, 1);
      await f.settleFinish(0, new Error("Synthetic persistence failure"));
      assert.equal(f.count("home"), 0);
      assert.match(f.host.textContent, /Couldn't finish setup/);
      assert.equal(f.host.querySelectorAll('.toast[role="alert"]').length, 1);
      assert.equal(f.button("Continue").disabled, false);
      await f.rerender();
      await f.publish({ state: "connected", account: { ...account } });
      assert.equal(f.writes.length, 1, "failure does not silently auto-retry");
      await f.click("Continue");
      assert.equal(f.writes.length, 2);
      assert.equal(f.count("home"), 0);
      assert.equal(f.button("Continue").disabled, true);
      await f.settleFinish(1);
      assert.equal(f.count("home"), 1);
      assert.equal(f.events.filter((e) => e.kind === "navigation").length, 1);
    } finally { await f.close(); }
  });

  for (const [label, invalid] of [
    ["account error", { ...account, error: "Synthetic invalid account" }],
    ["empty identity", { ...account, name: " ", email: " " }],
    ["malformed workspace", { ...account, workspaces: [{ slug: 1 }] }],
  ]) {
    test(`${mode}: ${label} cannot complete onboarding`, async () => {
      const f = await fixture({ strict });
      try {
        await f.click("Sign up");
        await f.publish({ state: "connected", account: invalid });
        await f.rerender();
        assert.equal(f.count("home"), 0);
        assert.equal(f.count("reason-login-connected"), 0);
        assert.equal(f.writes.length, 0);
        assert.equal(f.events.filter((e) => e.kind === "navigation").length, 0);
        assert.ok(f.host.querySelector('[role="alert"]'), "actual validation/status failure is visible");
      } finally { await f.close(); }
    });
  }

  test(`${mode}: cancellation ignores a deferred stale Connected result`, async () => {
    const f = await fixture({ strict });
    try {
      await f.click("Sign up");
      const pending = f.deferStatus();
      const read = f.api.refreshReasonSignIn();
      await f.click("Cancel");
      await act(async () => { pending.resolve({ state: "connected", account }); await read; });
      assert.equal(f.count("home"), 0);
      assert.equal(f.count("reason-login-connected"), 0);
      assert.equal(f.writes.length, 0);
      assert.equal(f.events.filter((e) => e.kind === "navigation").length, 0);
      assert.equal(f.requests.some((r) => r.command === "reason_logout"), false);
      assert.equal(f.button("Retry sign-in").disabled, false);
    } finally { await f.close(); }
  });

  test(`${mode}: unmount before deferred account suppresses completion callback`, async () => {
    const f = await fixture({ strict, surface: "login" });
    try {
      await f.click("Sign up");
      const pending = f.deferStatus();
      const read = f.api.refreshReasonSignIn();
      await f.unmount();
      await act(async () => { pending.resolve({ state: "connected", account }); await read; });
      assert.deepEqual(f.callbacks, []);
      assert.equal(f.writes.length, 0);
      assert.equal(f.host.childElementCount, 0);
    } finally { await f.close(); }
  });

  test(`${mode}: void callback fires once only after valid completion, not failed start or Retry`, async () => {
    const f = await fixture({ strict, surface: "login", failStart: true });
    try {
      await f.click("Sign up");
      assert.deepEqual(f.callbacks, [{ title: "Sign-in failed", description: "Couldn't start sign-in. Try again." }]);
      await f.rerender();
      assert.equal(f.callbacks.length, 1);
      await f.click("Retry sign-in");
      assert.equal(f.callbacks.length, 1);
      assert.equal(f.count("reason-login-waiting"), 1);
      await f.publish({ state: "connected", account });
      assert.deepEqual(f.callbacks, [{ title: "Sign-in failed", description: "Couldn't start sign-in. Try again." }, "done"]);
      await f.rerender();
      await f.publish({ state: "connected", account: { ...account } });
      assert.equal(f.callbacks.filter((value) => value === "done").length, 1);
      assert.equal(f.count("reason-login-connected"), 1);
    } finally { await f.close(); }
  });
}
