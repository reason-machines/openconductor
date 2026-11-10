const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { resolve, dirname, join } = require("node:path");
const vm = require("node:vm");

const repository = resolve(__dirname, "../..");
const dependencies = createRequire(join(resolve(process.env.SSH_RESET_DEPS ?? join(repository, ".oc-tmp/ssh-reset/deps")), "package.json"));
const React = dependencies("react");
const { create, act } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourceRoot = resolve(process.env.SSH_RESET_SOURCE_ROOT ?? repository);
const resetLabel = "Reset to auto-generated key";
const modules = new Map();
const boundaries = [];

const blocked = (name) => (...args) => {
  boundaries.push({ name, args });
  throw new Error(`Forbidden boundary invoked: ${name}`);
};
const Row = ({ label, children }) => React.createElement("section", { "aria-label": label }, children);
const inert = () => null;
const stubs = {
  "../backend": new Proxy({}, { get: (_, name) => blocked(`backend.${String(name)}`) }),
  "./controls": { PrefSwitchRow: inert, Toggle: inert },
  "./GeneralPage": { Row },
  "./icons": new Proxy({}, { get: () => inert }),
  "./RootPathRow": { RootPathRow: inert },
  "./rows/AgentOptionRows": { ExecutablePathRow: inert },
};

function load(relativePath) {
  const filename = resolve(sourceRoot, relativePath);
  if (modules.has(filename)) return modules.get(filename).exports;
  const source = readFileSync(filename, "utf8");
  const result = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  modules.set(filename, module);
  const requireFromSource = (name) => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    if (Object.hasOwn(stubs, name)) return stubs[name];
    const target = resolve(dirname(filename), name.endsWith(".ts") ? name : `${name}.ts`);
    const allowed = ["src/settings/agentSettings.ts", "src/features/terminal/scrollback.ts"];
    if (allowed.some((path) => resolve(sourceRoot, path) === target)) return load(target);
    throw new Error(`Unexpected import: ${name}`);
  };
  const evaluate = vm.runInThisContext(`(function(require, module, exports) {\n${result.outputText}\n})`, { filename });
  evaluate(requireFromSource, module, module.exports);
  return module.exports;
}

const { AdvancedPage } = load("src/settings/AdvancedPage.tsx");
function mount(sshKeyPath) {
  const saved = [];
  const initial = { ssh_key_path: sshKeyPath, git: { worktree_push_auto_setup_remote: true }, advanced: {} };
  function Host() {
    const [settings, setSettings] = React.useState(initial);
    return React.createElement(AdvancedPage, { settings, save: (next) => { saved.push(next); setSettings(next); } });
  }
  let renderer;
  act(() => { renderer = create(React.createElement(Host)); });
  return {
    initial,
    saved,
    input: () => renderer.root.findByProps({ "aria-label": "SSH private key path", type: "text" }),
    reset: () => renderer.root.findAll((node) => node.type === "button" && (node.props.title === resetLabel || node.props["aria-label"] === resetLabel)),
    close: () => act(() => renderer.unmount()),
  };
}

test("saved custom SSH key exposes reset and clears only the SSH override on activation", () => {
  const view = mount("synthetic-custom-key");
  try {
    assert.equal(view.input().props.value, "synthetic-custom-key");
    assert.equal(view.saved.length, 0, "mount must not save");
    assert.equal(view.reset().length, 1, "a saved custom SSH key must expose Reset to auto-generated key");
    const button = view.reset()[0];
    assert.equal(button.props.type, "button");
    assert.equal(button.props["aria-label"], resetLabel);
    act(() => button.props.onClick());
    assert.equal(view.saved.length, 1);
    assert.deepEqual(view.saved[0], { ...view.initial, ssh_key_path: null });
    assert.equal(view.input().props.value, "");
    assert.equal(view.reset().length, 0);
    act(() => view.input().props.onBlur());
    assert.equal(view.saved.length, 1, "blur after reset must not resave the stale custom path");
  } finally { view.close(); }
});

test("auto-generated SSH key state has no reset action and saves nothing", () => {
  for (const value of [null, ""]) {
    const view = mount(value);
    try {
      assert.equal(view.input().props.value, "");
      assert.equal(view.reset().length, 0);
      assert.equal(view.saved.length, 0);
      act(() => view.input().props.onChange({ target: { value: "synthetic-unsaved-key" } }));
      assert.equal(view.input().props.value, "synthetic-unsaved-key");
      assert.equal(view.reset().length, 0, "an unsaved draft is not a saved SSH override");
      assert.equal(view.saved.length, 0);
    } finally { view.close(); }
  }
});

test("manual SSH path edits keep blur and Enter save cadence", () => {
  const view = mount("synthetic-original-key");
  try {
    act(() => view.input().props.onChange({ target: { value: "  synthetic-edited-key  " } }));
    assert.equal(view.saved.length, 0);
    act(() => view.input().props.onBlur());
    assert.deepEqual(view.saved, [{ ...view.initial, ssh_key_path: "synthetic-edited-key" }]);
    act(() => view.input().props.onChange({ target: { value: "synthetic-enter-key" } }));
    assert.equal(view.saved.length, 1);
    act(() => view.input().props.onKeyDown({ key: "Enter", currentTarget: { blur: () => view.input().props.onBlur() } }));
    assert.deepEqual(view.saved[1], { ...view.initial, ssh_key_path: "synthetic-enter-key" });
    assert.equal(view.saved.length, 2);
  } finally { view.close(); }
});

test("component checks never invoked a backend or native boundary", () => {
  assert.deepEqual(boundaries, []);
});
