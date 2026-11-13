import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const deps = createRequire(resolve(process.env.REACT_EFFECTS_DEPS ?? "node_modules", "package.json"));
const React = deps("react");
const { act, create } = deps("react-test-renderer");
const ts = deps("typescript");
assert.equal(React.version, "18.3.1");
assert.equal(deps("react-test-renderer/package.json").version, "18.3.1");

async function fixture() {
  const intervals = new Map(), modules = new Map(), continued = [];
  let serial = 0, bindings, root;
  const window = {
    setInterval(callback) { const id = ++serial; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); },
  };
  const boundaries = {
    "../keybindings/KeybindingsProvider": { useKeybindings(next) { bindings = next; } },
    "../components/AppMark": { AppMark: () => null },
    "./SignIn": { SignUp: ({ onSkip, busy }) => React.createElement("button", { onClick: onSkip, disabled: busy }, "Continue") },
  };
  function load(path) {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} };
    modules.set(path, module);
    const source = readFileSync(path, "utf8");
    const javascript = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const require = (name) => {
      if (name === "react" || name === "react/jsx-runtime") return deps(name);
      if (name.endsWith(".css")) return {};
      if (Object.hasOwn(boundaries, name)) return boundaries[name];
      if (name === "./firstRun") return load("src/onboarding/firstRun.ts");
      throw new Error(`Unexpected source dependency ${name}`);
    };
    runInNewContext(`(function(require,module,exports){${javascript}\n})`, {
      window, console,
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const source = readFileSync("src/onboarding/FirstRunOnboarding.tsx");
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  const { FirstRunOnboarding } = load("src/onboarding/FirstRunOnboarding.tsx");
  const onContinue = (agent) => { continued.push(agent); };
  const onFailed = () => { assert.fail("Sign-in is outside this fixture"); };
  const element = (busy = false) => React.createElement(FirstRunOnboarding, { onContinue, busy, onFailed });
  await act(async () => { root = create(element()); });
  const slides = () => root.root.findAll((node) => node.type === "div" && node.props.role === "listitem");
  return {
    root, continued, sourceSha256,
    selected() {
      const selected = slides().map((node, index) => node.props["aria-current"] === "true" ? index : -1).filter((index) => index >= 0);
      assert.equal(selected.length, 1, "one slide is selected");
      return selected[0];
    },
    progress() {
      return {
        value: root.root.findByProps({ role: "progressbar" }).props["aria-valuenow"],
        width: root.root.findByProps({ className: "onb-progress-fill" }).props.style.width,
      };
    },
    video: () => root.root.findByType("video"),
    async clickSlide(index) { await act(async () => { slides()[index].props.onClick(); }); },
    async time(currentTime, duration) { await act(async () => { root.root.findByType("video").props.onTimeUpdate({ currentTarget: { currentTime, duration } }); }); },
    async load() { await act(async () => { root.root.findByType("video").props.onLoadedData(); }); },
    async end() { await act(async () => { root.root.findByType("video").props.onEnded(); }); },
    async next() { await act(async () => { bindings["onboarding.nextSlide"](); }); },
    async chooseAgent(agent) { await act(async () => { root.root.findByProps({ type: "radio", value: agent }).props.onChange(); }); },
    async continueWithKey() { await act(async () => { bindings["onboarding.continue"](); }); },
    async rerender(busy = false) { await act(async () => { root.update(element(busy)); }); },
    async close() {
      await act(async () => { root.unmount(); });
      assert.equal(intervals.size, 0, "the actual slide effect releases its interval on unmount");
    },
  };
}

for (const [index, name] of ["repo", "agents", "conduct"].entries()) {
  test(`selecting the current ${name} slide preserves visible progress and its clock`, async (t) => {
    const f = await fixture();
    try {
      await f.clickSlide(index);
      await f.time(3, 12);
      assert.equal(f.selected(), index);
      assert.deepEqual(f.progress(), { value: 25, width: "25%" });
      await f.clickSlide(index);
      assert.equal(f.selected(), index);
      assert.deepEqual(f.progress(), { value: 25, width: "25%" }, "clicking the selected slide must not remount or rewind media");
      await f.rerender();
      assert.deepEqual(f.progress(), { value: 25, width: "25%" });
      await f.time(6, 12);
      assert.deepEqual(f.progress(), { value: 50, width: "50%" }, "continued playback retains independent progress");
      t.diagnostic(`FirstRunOnboarding.tsx SHA256 ${f.sourceSha256}`);
    } finally { await f.close(); }
  });
}

test("selecting another slide resets progress and starts a full slide duration", async () => {
  const f = await fixture();
  try {
    await f.time(9, 12);
    assert.deepEqual(f.progress(), { value: 75, width: "75%" });
    await f.clickSlide(1);
    await f.load();
    assert.equal(f.selected(), 1);
    assert.deepEqual(f.progress(), { value: 0, width: "0%" });
    await f.time(3, 12);
    assert.equal(f.selected(), 1);
    assert.deepEqual(f.progress(), { value: 25, width: "25%" });
    await f.end();
    assert.equal(f.selected(), 2);
    assert.deepEqual(f.progress(), { value: 0, width: "0%" });
  } finally { await f.close(); }
});

test("next-slide keybinding and elapsed completion wrap while retaining agent choice and busy guard", async () => {
  const f = await fixture();
  try {
    await f.chooseAgent("codex");
    await f.time(3, 12);
    await f.next();
    assert.equal(f.selected(), 1);
    assert.deepEqual(f.progress(), { value: 0, width: "0%" });
    await f.next();
    assert.equal(f.selected(), 2);
    await f.next();
    assert.equal(f.selected(), 0);
    await f.clickSlide(2);
    await f.end();
    assert.equal(f.selected(), 0);
    assert.deepEqual(f.progress(), { value: 0, width: "0%" });
    assert.equal(f.root.root.findByProps({ type: "radio", value: "codex" }).props.checked, true);
    await f.rerender(true);
    await f.continueWithKey();
    assert.deepEqual(f.continued, []);
    await f.rerender(false);
    await f.continueWithKey();
    assert.deepEqual(f.continued, ["codex"]);
  } finally { await f.close(); }
});
