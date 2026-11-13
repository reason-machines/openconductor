import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInThisContext } from "node:vm";
import * as overridesModule from "../keybindings/overrides.ts";
import { logical } from "../keybindings/types.ts";
import { chooseSendKey } from "./composerSettings.ts";
import * as prefs from "./prefs.ts";
import { DEFAULT_SETTINGS } from "./types.ts";

type WriteOutcome = "saved" | "refused" | "rejected";
type Notification = { kind: "error" | "info"; message: string };
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourcePath = process.env.SEND_KEY_ROW_BASELINE === "1"
  ? resolve("evidence/settings/send-key-save-feedback/baseline/GeneralPage.tsx")
  : resolve("src/settings/GeneralPage.tsx");
const javascript = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  fileName: sourcePath,
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;

async function mount({
  overrideOutcome = "saved",
  legacyRejects = false,
  withNotify = true,
  overrides = {},
}: {
  overrideOutcome?: WriteOutcome;
  legacyRejects?: boolean;
  withNotify?: boolean;
  overrides?: overridesModule.Overrides;
} = {}) {
  const notifications: Notification[] = [];
  const writes: { boundary: string; value: unknown }[] = [];
  let outcome = overrideOutcome;
  const inert = () => null;
  const forbidden = () => assert.fail("Unrelated native/settings boundary must remain untouched");
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": dependencies("react/jsx-runtime"),
    "./ConfigSyncDialog": { ConfigSyncDialog: inert },
    "../backend": { checkFullDiskAccess: forbidden, openUrl: forbidden },
    "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides }) },
    "../keybindings/overrides": overridesModule,
    "../keybindings/shortcut": { glyphs: () => "⇧ Enter" },
    "./controls": { ButtonRow: inert, Keys: ({ glyphs }: { glyphs: string }) => glyphs, PrefSwitchRow: inert, Select: inert, Toggle: inert },
    "./icons": { SyncIcon: inert, VolumeIcon: inert },
    "./appearance": { SETTINGS_CHANGED: "fixture-settings-changed" },
    "./appPrefs": { setAppPref: async (update: unknown) => {
      writes.push({ boundary: "legacy", value: update });
      if (legacyRejects) throw new Error("Fixture legacy write rejected");
    } },
    "./composerSettings": { chooseSendKey },
    "./model": { withField: forbidden },
    "./notificationPermission": { notificationPermissionGranted: forbidden },
    "./prefs": prefs,
    "./rows/AppPrefRows": { GeneralAppPrefRows: inert },
    "./sound": { playCompletionSound: forbidden, SOUND_OPTIONS: [] },
    "./useSettingsOverrideStore": { useSettingsOverrideStore: () => ({
      updateMany: async (updates: readonly overridesModule.OverrideUpdate[]) => {
        writes.push({ boundary: "overrides", value: updates });
        if (outcome === "rejected") throw new Error("Fixture override write rejected");
        return outcome !== "refused";
      },
    }) },
  };
  const loadPage: (require: (name: string) => unknown, exports: object) => typeof import("./GeneralPage") = runInThisContext(
    `(function(require, exports) {\n${javascript}\nreturn exports;\n})`, { filename: sourcePath },
  );
  const { GeneralPage } = loadPage((name) => {
    assert.ok(Object.prototype.hasOwnProperty.call(modules, name), `Unexpected import: ${name}`);
    return modules[name];
  }, {});
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(GeneralPage, {
      settings: DEFAULT_SETTINGS,
      save: forbidden,
      notify: withNotify ? (kind: Notification["kind"], message: string) => notifications.push({ kind, message }) : undefined,
    }));
  });
  const select = () => renderer.root.findByProps({ "aria-label": "Send messages with" });
  return {
    notifications, writes, select,
    setOutcome: (next: WriteOutcome) => { outcome = next; },
    choose: (value = "cmd-enter") => act(async () => { select().props.onChange({ target: { value } }); }),
    close: () => act(() => renderer.unmount()),
  };
}

const failure = { kind: "error", message: "Failed to update message send key" };

for (const outcome of ["refused", "rejected"] as const) {
  test(`Send-key ${outcome} override write reports one user-visible error without writing the legacy preference`, async () => {
    const view = await mount({ overrideOutcome: outcome });
    try {
      await view.choose();
      assert.deepEqual(view.notifications, [failure]);
      assert.deepEqual(view.writes.map((write) => write.boundary), ["overrides"]);
      assert.equal(view.select().props.value, "enter", "Do not claim an unsaved preset");
    } finally { view.close(); }
  });
}

test("Send-key legacy write rejection reports one user-visible error", async () => {
  const view = await mount({ legacyRejects: true });
  try {
    await view.choose();
    assert.deepEqual(view.notifications, [failure]);
    assert.deepEqual(view.writes.map((write) => write.boundary), ["overrides", "legacy"]);
  } finally { view.close(); }
});

test("Send-key successful write keeps preset persistence and produces no failure notification", async () => {
  const view = await mount();
  try {
    await view.choose();
    assert.deepEqual(view.notifications, []);
    assert.deepEqual(view.writes, [
      { boundary: "overrides", value: overridesModule.sendKeyPresetUpdates("cmd-enter") },
      { boundary: "legacy", value: { key: "message_send_key", value: "cmd-enter" } },
    ]);
  } finally { view.close(); }
});

test("Send-key failed save does not prevent a later successful selection", async () => {
  const view = await mount({ overrideOutcome: "refused" });
  try {
    await view.choose();
    assert.deepEqual(view.notifications, [failure]);
    view.setOutcome("saved");
    await view.choose("enter");
    assert.deepEqual(view.notifications, [failure]);
    assert.deepEqual(view.writes.map((write) => write.boundary), ["overrides", "overrides", "legacy"]);
    assert.deepEqual(view.writes[2].value, { key: "message_send_key", value: "enter" });
  } finally { view.close(); }
});

for (const outcome of ["refused", "rejected"] as const) {
  test(`Send-key ${outcome} write also settles safely when the optional notification relay is absent`, async () => {
    const view = await mount({ overrideOutcome: outcome, withNotify: false });
    try {
      await view.choose();
      assert.deepEqual(view.notifications, []);
      assert.equal(view.writes.length, 1);
    } finally { view.close(); }
  });
}

test("Send-key custom shortcuts retain the Custom placeholder without issuing a write", async () => {
  const view = await mount({ overrides: { "chat.submitMessage": [logical("j", ["meta"])] } });
  try {
    assert.equal(view.select().props.value, "");
    const placeholder = view.select().findByProps({ value: "", disabled: true });
    assert.equal(placeholder.props.disabled, true);
    assert.deepEqual(placeholder.children, ["Custom"]);
    assert.deepEqual(view.notifications, []);
    assert.deepEqual(view.writes, []);
  } finally { view.close(); }
});
