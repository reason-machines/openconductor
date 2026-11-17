// Tests that Composer registers chat.toggleSpeechToText and calls saveVoiceSettings
// to flip the voice_mode bool pref. Full speech parity is out of scope here;
// see agent.speech entitlement (NSMicrophoneUsageDescription).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as queue from "./queue.ts";
import * as queueKeys from "./queueKeys.ts";
import * as commands from "./slashCommands.ts";
import * as mentions from "./fileMentions.ts";
import * as document from "./composerDocument.ts";
import * as userContent from "./userContent.ts";
import * as shortcuts from "../../keybindings/shortcut.ts";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { boolPref, withBoolPref } from "../../settings/prefs.ts";
import type { CommandHandlers } from "../../keybindings/bind.ts";
import type { Composer } from "./Composer.tsx";
import type { Settings } from "../../settings/types.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

function makeSettings(voiceMode: boolean): Settings {
  const base = { general: {}, appearance: {}, experimental: {}, keymap: {} } as unknown as Settings;
  return withBoolPref(base, "voice_mode", voiceMode);
}

function fixture(initialVoiceMode: boolean) {
  let currentVoiceMode = initialVoiceMode;
  const saves: Settings[] = [];
  let handlers: CommandHandlers = {};

  const EditorBoundary = () => null;
  const exports: { Composer?: typeof Composer } = {};
  const javascript = ts.transpileModule(readFileSync("src/features/chat/Composer.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;

  runInNewContext(javascript, {
    exports,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name.endsWith("/Tooltip.tsx")) return { Tooltip: ({ children }: { children: unknown }) => children, ShortcutHint: () => null };
      if (name.endsWith("/usePresence.ts")) return { usePresence: (open: boolean) => ({ mounted: open, attrs: {} }) };
      if (name.endsWith("/KeybindingsProvider.tsx")) return {
        useKeybindingOverrides: () => ({ overrides: {} }),
        useKeybindings(value: CommandHandlers) { handlers = value; },
      };
      if (name.endsWith("/overrides.ts")) return { effectiveShortcuts };
      if (name.endsWith("/shortcut.ts")) return shortcuts;
      if (name === "./queue.ts") return queue;
      if (name === "./queueKeys.ts") return queueKeys;
      if (name === "./slashCommands.ts") return commands;
      if (name === "./fileMentions.ts") return mentions;
      if (name === "./composerDocument.ts") return document;
      if (name === "./userContent.ts") return userContent;
      if (name === "./ComposerEditor.tsx") return { ComposerEditor: EditorBoundary };
      if (name === "./SlashMenu.tsx") return { SlashMenu: () => null };
      if (name === "./FileMentionMenu.tsx") return { FileMentionMenu: () => null };
      if (name === "./composerLongPaste.ts") return { longPasteAttachment: () => null };
      if (name === "./composerPasteFilePaths.ts") return { readClipboardText: async () => null, readClipboardTextFromPlatform: async () => null };
      if (name.endsWith("/useBoolPref.ts")) return { useBoolPref: (key: string) => key === "voice_mode" ? currentVoiceMode : false };
      if (name.endsWith("/useSettings.ts")) return {
        useSettings: () => ({
          settings: makeSettings(currentVoiceMode),
          save: (next: Settings) => {
            saves.push(next);
            currentVoiceMode = boolPref(next, "voice_mode");
            return Promise.resolve(true);
          },
          error: null,
          reload: () => {},
        }),
      };
      if (name.endsWith("/prefs.ts")) return { boolPref, withBoolPref };
      if (name === "../../backend") return { fuzzyFilterFiles: () => Promise.resolve([]) };
      if (name === "./composerIcons.tsx") return Object.fromEntries(
        ["ArrowUpIcon", "CircleDotIcon", "CornerDownLeftIcon", "PaperclipIcon", "PlusIcon", "StopCircleIcon"].map((key) => [key, () => null]),
      );
      throw new Error(`Unexpected Composer dependency in composerSpeechToText.test: ${name}`);
    },
  });

  assert.ok(exports.Composer, "Composer must export");

  const queueState: queue.ChatQueue = { ...queue.emptyQueue(), status: "idle" };
  const inputRef = { current: null };
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.Composer, {
      draft: "",
      setDraft: () => {},
      inputRef,
      queue: queueState,
      canSteer: false,
      onSubmit: () => assert.fail("speech toggle must not submit"),
      onQueue: () => {},
      onStop: () => {},
    }));
  });

  return {
    saves,
    voiceMode: () => currentVoiceMode,
    toggle() {
      let result: unknown;
      act(() => { result = handlers["chat.toggleSpeechToText"]?.(); });
      return result;
    },
    close() { act(() => renderer.unmount()); },
  };
}

test("chat.toggleSpeechToText is registered as a keybinding handler", () => {
  // Verify the handler is present by running it and observing a save call.
  const view = fixture(false);
  try {
    view.toggle();
    assert.equal(view.saves.length, 1, "toggle must call saveVoiceSettings once");
  } finally { view.close(); }
});

test("chat.toggleSpeechToText turns voice_mode on when it is off", () => {
  const view = fixture(false);
  try {
    view.toggle();
    assert.equal(view.saves.length, 1);
    assert.equal(boolPref(view.saves[0]!, "voice_mode"), true, "voice_mode should be true after toggle from false");
  } finally { view.close(); }
});

test("chat.toggleSpeechToText turns voice_mode off when it is on", () => {
  const view = fixture(true);
  try {
    view.toggle();
    assert.equal(view.saves.length, 1);
    assert.equal(boolPref(view.saves[0]!, "voice_mode"), false, "voice_mode should be false after toggle from true");
  } finally { view.close(); }
});
