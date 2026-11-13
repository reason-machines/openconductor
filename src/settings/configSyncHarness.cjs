const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { resolve, dirname, join } = require("node:path");
const vm = require("node:vm");

const repository = resolve(__dirname, "../..");
const dependencies = createRequire(join(resolve(process.env.CONFIG_SYNC_DEPS ?? repository), "package.json"));
const React = dependencies("react");
const { create, act } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourceRoot = resolve(process.env.CONFIG_SYNC_SOURCE_ROOT ?? repository);
const inert = () => null;

function mount(options = {}) {
  const calls = { reads: 0, writes: [], boundaries: [], notifications: [] };
  const modules = new Map();
  const empty = () => ({ ccToCodex: [], codexToCc: [], error: null });
  const diff = {
    mcpServers: empty(), slashCommands: empty(),
    skills: { ccToCodex: ["claude-only"], codexToCc: ["codex-only"], error: null },
  };
  const blocked = (name) => (...args) => {
    calls.boundaries.push({ name, args });
    throw new Error(`Forbidden boundary: ${name}`);
  };
  const stubs = {
    "../backend": new Proxy({}, { get: (_, name) => blocked(`backend.${String(name)}`) }),
    "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }) },
    "../keybindings/overrides": { currentSendKeyMode: () => "enter", effectiveShortcuts: () => [] },
    "../keybindings/shortcut": { glyphs: () => "" },
    "./appearance": { SETTINGS_CHANGED: "settings-changed" },
    "./appPrefs": { setAppPref: blocked("setAppPref") },
    "./composerSettings": { chooseSendKey: blocked("chooseSendKey") },
    "./notificationPermission": { notificationPermissionGranted: blocked("notificationPermissionGranted") },
    "./model": { withField: blocked("withField") },
    "./prefs": { enumPref: () => "steering", withEnumPref: blocked("withEnumPref"), boolPref: () => false },
    "./rows/AppPrefRows": { GeneralAppPrefRows: inert },
    "./sound": { playCompletionSound: blocked("playCompletionSound"), SOUND_OPTIONS: [{ value: "none", label: "None" }] },
    "./icons": new Proxy({}, { get: () => inert }),
    "./useSettingsOverrideStore": { useSettingsOverrideStore: () => ({ updateMany: blocked("updateMany") }) },
    "./configSyncApi": {
      configSyncApi: {
        diff: async () => { calls.reads++; if (options.loadError) throw new Error(options.loadError); return structuredClone(diff); },
        sync: async (selection) => {
          calls.writes.push(structuredClone(selection));
          if (options.sync) return options.sync(selection, diff);
          return { successes: selection.length, failures: [], unsupportedMcp: [] };
        },
      },
    },
    "./motion/dialogMotion": { useDialogMotion: () => React.useRef(null) },
    "./Icons": { CloseIcon: inert },
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
      if (name.endsWith(".css")) return {};
      const base = resolve(dirname(filename), name.replace(/\.tsx?$/, ""));
      const allowed = ["src/settings/GeneralPage.tsx", "src/settings/controls.tsx", "src/settings/ConfigSyncDialog.tsx", "src/settings/configSync.ts", "src/components/Dialogs.tsx"];
      const target = allowed.find((path) => resolve(sourceRoot, path).replace(/\.tsx?$/, "") === base);
      if (target) return load(target);
      throw new Error(`Unexpected import: ${name}`);
    };
    vm.runInThisContext(`(function(require, module, exports) {\n${result.outputText}\n})`, { filename })(requireFromSource, module, module.exports);
    return module.exports;
  }
  const { GeneralPage } = load("src/settings/GeneralPage.tsx");
  let renderer;
  act(() => { renderer = create(React.createElement(GeneralPage, {
    settings: { general: { sound_type: "none", send_native_notification: false } }, save: blocked("save"),
    notify: (kind, message) => calls.notifications.push({ kind, message }),
  })); });
  return {
    calls, diff,
    root: () => renderer.root,
    button: (label) => renderer.root.findAll((node) => node.type === "button" && node.children.includes(label))[0],
    close: () => act(() => renderer.unmount()),
  };
}
module.exports = { mount, act };
