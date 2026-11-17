const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const React = require("react");
const { act, create } = require("react-test-renderer");
const ts = require("typescript");
const here = __dirname;
const root = path.resolve(here, "../../..");
const mode = process.env.COMPLETION_SOUND_SOURCE || "candidate";
const ids = ["disabled", "default", "choo-choo", "odysseus-pluck", "fahhhh", "quack", "sf-muni-inbound-train-chime", "sf-muni-new", "nyc-metro-door-chime", "nyc-subway-door-chime", "nyc-subway", "paris-metro-chime", "paris-metro-pickpockets", "sncf-jingle"];

function source(file) {
  if (mode === "product") return path.join(root, file);
  if (mode === "integrated" && file === "src/settings/GeneralPage.tsx") return path.join(here, "integrated/GeneralPage.tsx.txt");
  return path.join(here, mode === "baseline" ? "baseline" : "candidate", file + ".txt");
}

function load(file, modules = {}, globals = {}) {
  const filename = source(file);
  const javascript = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: file,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(`(function(require, exports) {\n${javascript}\n})`, globals, { filename })((name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`);
    return modules[name];
  }, exports);
  return exports;
}

function audio() {
  const tones = [];
  let contexts = 0;
  class AudioContext {
    currentTime = 0;
    destination = {};
    constructor() { contexts++; }
    createOscillator() {
      const tone = { frequency: { value: 0 }, connect() {}, start(at) { this.startAt = at; }, stop(at) { this.stopAt = at; } };
      tones.push(tone);
      return tone;
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  return { AudioContext, tones, contexts: () => contexts };
}

function mount(sound = "default") {
  const soundModule = load("src/settings/sound.ts");
  const writes = [];
  const previews = [];
  const settings = { general: { theme: "dark", sound_type: sound, send_native_notification: true }, app_prefs: {} };
  const inert = () => null;
  const forbidden = () => assert.fail("Unrelated native, permission or preference boundary called");
  const modules = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "./ConfigSyncDialog": { ConfigSyncDialog: inert },
    "../backend": { checkFullDiskAccess: forbidden, openUrl: forbidden },
    "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }) },
    "../keybindings/overrides": { currentSendKeyMode: () => "enter", effectiveShortcuts: () => [] },
    "../keybindings/shortcut": { glyphs: () => "" },
    "./controls": {
      ButtonRow: inert, Keys: inert, PrefSwitchRow: inert, Toggle: inert,
      Select: ({ label, value, options, disabled, onChange }) => React.createElement("select", {
        "aria-label": label, value, disabled, onChange: (event) => onChange(event.currentTarget.value),
      }, options.map((option) => React.createElement("option", { key: option.value, value: option.value }, option.label))),
    },
    "./icons": { SyncIcon: inert, VolumeIcon: inert },
    "./appearance": { SETTINGS_CHANGED: "fixture-settings-changed" },
    "./appPrefs": { setAppPref: forbidden },
    "./composerSettings": { chooseSendKey: forbidden },
    "./model": { withField: (value, section, key, next) => ({ ...value, [section]: { ...value[section], [key]: next } }) },
    "./notificationPermission": { notificationPermissionGranted: forbidden },
    "./prefs": { enumPref: () => "queued", boolPref: () => false, withEnumPref: forbidden, withBoolPref: forbidden },
    "./rows/AppPrefRows": { GeneralAppPrefRows: inert },
    "./sound": { ...soundModule, playCompletionSound: (value) => previews.push(value) },
    "./useSettingsOverrideStore": { useSettingsOverrideStore: () => ({ updateMany: forbidden }) },
  };
  const { GeneralPage } = load("src/settings/GeneralPage.tsx", modules);
  let renderer;
  act(() => { renderer = create(React.createElement(GeneralPage, { settings, save: (next) => { writes.push(next); return Promise.resolve(true); } })); });
  return {
    renderer, writes, previews, settings,
    select: () => renderer.root.findByProps({ "aria-label": "Completion sound" }),
    testButton: () => renderer.root.findAllByType("button").find((node) => node.props.className.includes("settings-test")),
    close: () => act(() => renderer.unmount()),
  };
}

test("all retained catalog IDs are available in order", () => {
  const { SOUND_OPTIONS } = load("src/settings/sound.ts");
  assert.deepEqual(Array.from(SOUND_OPTIONS, (option) => option.value), ids);
});

test("Completion sound menu keeps catalog groups and duplicate Chime labels unambiguous", () => {
  const view = mount();
  try {
    assert.deepEqual(view.select().findAllByType("option").map((option) => option.props.value), ids);
    assert.deepEqual(view.select().findAllByType("optgroup").map((group) => group.props.label), ["Classic", "Novelty", "SF Muni", "NYC MTA", "Paris Métro", "SNCF"]);
  } finally { view.close(); }
});

test("each choice saves its exact ID without mutating other general preferences", () => {
  const view = mount();
  try {
    for (const value of ids) act(() => view.select().props.onChange({ currentTarget: { value } }));
    assert.deepEqual(view.writes.map((settings) => settings.general.sound_type), ids);
    for (const next of view.writes) {
      assert.equal(next.general.theme, "dark");
      assert.equal(next.general.send_native_notification, true);
      assert.equal(next.app_prefs, view.settings.app_prefs);
    }
  } finally { view.close(); }
});

test("unknown menu event does not overwrite a stored choice", () => {
  const view = mount();
  try {
    act(() => view.select().props.onChange({ currentTarget: { value: "future-sound" } }));
    assert.equal(view.writes.length, 0);
  } finally { view.close(); }
});

test("disabled choice disables Test without adding a pending state", () => {
  const view = mount("disabled");
  try {
    assert.equal(view.testButton().props.disabled, true);
    assert.notEqual(view.select().props.disabled, true);
  } finally { view.close(); }
});

test("Test previews the saved audible ID", () => {
  const view = mount("sncf-jingle");
  try {
    act(() => view.testButton().props.onClick());
    assert.deepEqual(view.previews, ["sncf-jingle"]);
  } finally { view.close(); }
});

test("the row discloses synthesized playback and missing original recordings", () => {
  const view = mount();
  try {
    const rendered = JSON.stringify(view.renderer.toJSON());
    assert.match(rendered, /Original recordings are not included/);
    assert.match(rendered, /synthesized chime/);
  } finally { view.close(); }
});

test("canonical disabled and legacy none never create an audio context", () => {
  const fixture = audio();
  const { playCompletionSound } = load("src/settings/sound.ts", {}, { AudioContext: fixture.AudioContext });
  playCompletionSound("disabled");
  playCompletionSound("none");
  assert.equal(fixture.contexts(), 0);
  assert.equal(fixture.tones.length, 0);
});

test("every audible ID and unknown ID use the documented default synthesized fallback", () => {
  for (const sound of [...ids.slice(1), "future-sound"]) {
    const fixture = audio();
    const { playCompletionSound } = load("src/settings/sound.ts", {}, { AudioContext: fixture.AudioContext });
    playCompletionSound(sound);
    assert.deepEqual(fixture.tones.map((tone) => tone.frequency.value), [1318.5, 1760]);
    assert.deepEqual(fixture.tones.map((tone) => tone.startAt), [0, 0.12]);
  }
});

test("preview is safe without WebAudio", () => {
  const { playCompletionSound } = load("src/settings/sound.ts");
  assert.doesNotThrow(() => playCompletionSound("choo-choo"));
});
