import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { bindCommands } from "../../keybindings/bind.ts";
import { createDispatcher, PRIORITY, type FocusContext } from "../../keybindings/dispatcher.ts";
import { effectiveShortcuts, type Overrides } from "../../keybindings/overrides.ts";
import type { OpenInApp } from "../openIn/apps.ts";
import { cycleSwitcher, releasesOpenShortcut, switcherEntries, SWITCHER_DELAY_MS } from "../openIn/switcher.ts";

function source(path: string) {
  return process.env.FILE_OPEN_SHORTCUT_REF
    ? execFileSync("git", ["show", `${process.env.FILE_OPEN_SHORTCUT_REF}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
}

function evaluate(code: string, bindings: Record<string, unknown>) {
  return runInNewContext(stripTypeScriptTypes(code.replace(/\bexport /g, "")), bindings);
}

function prefix(path: string, signature: string, end: string) {
  const text = source(path);
  const start = text.indexOf(signature);
  const stop = text.indexOf(end, start);
  assert.ok(start >= 0 && stop > start, `production boundary: ${signature}`);
  return text.slice(start, stop);
}

function hooks() {
  let cursor = 0;
  const states = new Map<number, unknown>();
  const refs = new Map<number, { current: unknown }>();
  const effects = new Map<number, { deps?: readonly unknown[]; cleanup?: () => void }>();
  let pending: (() => void)[] = [];
  return {
    useState(initial: unknown) {
      const id = cursor++;
      if (!states.has(id)) states.set(id, typeof initial === "function" ? initial() : initial);
      return [states.get(id), (value: unknown) => states.set(id, value)];
    },
    useRef(current: unknown) {
      const id = cursor++;
      let ref = refs.get(id);
      if (!ref) { ref = { current }; refs.set(id, ref); }
      return ref;
    },
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const id = cursor++;
      const previous = effects.get(id);
      if (previous && deps && previous.deps?.length === deps.length && deps.every((value, i) => Object.is(value, previous.deps?.[i]))) return;
      pending.push(() => {
        previous?.cleanup?.();
        const cleanup = effect();
        effects.set(id, { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined });
      });
    },
    render(render: () => void) {
      cursor = 0;
      render();
      const effectsToRun = pending;
      pending = [];
      effectsToRun.forEach((effect) => effect());
    },
    unmount() {
      effects.forEach((effect) => effect.cleanup?.());
      effects.clear();
    },
  };
}

const VSCODE: OpenInApp = { id: "vscode", name: "VS Code", iconType: "code", icon: null };
const ZED: OpenInApp = { id: "zed", name: "Zed", iconType: "code", icon: null };
const TERMINAL: OpenInApp = { id: "terminal", name: "Terminal", iconType: "terminal", icon: null };
const FOCUS: FocusContext = { activeDialogId: null, typing: false, inTerminal: false };
const KEY = { key: "o", code: "KeyO", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, repeat: false };

async function menu({ apps = [VSCODE, ZED], saved = null, canOpen = true, overrides = {} }: {
  apps?: OpenInApp[]; saved?: string | null; canOpen?: boolean; overrides?: Overrides;
} = {}) {
  const dispatcher = createDispatcher();
  const fileHooks = hooks();
  const workspaceHooks = hooks();
  const fileCalls: OpenInApp[] = [];
  const workspaceCalls: string[] = [];
  let closes = 0;
  const listeners = new Map<string, (event: unknown) => void>();
  const common = {
    PRIORITY, bindCommands, effectiveShortcuts, cycleSwitcher, releasesOpenShortcut, switcherEntries, SWITCHER_DELAY_MS,
    useKeybindingOverrides: () => ({ overrides }),
    useKeybindingsContext: () => ({ dispatcher, overrides }),
    // useContext stub: FocusedScope default is undefined (not inside a scope boundary),
    // so isFocusedScope is undefined and handlers fire normally per the dispatcher.
    useContext: () => undefined, FocusedScope: null,
    setTimeout: () => 1, clearTimeout: () => {},
    window: {
      innerWidth: 1280,
      addEventListener: (name: string, callback: (event: unknown) => void) => listeners.set(name, callback),
      removeEventListener: (name: string) => listeners.delete(name),
    },
  };
  const registration = source("src/keybindings/KeybindingsProvider.tsx");
  const registrationStart = registration.indexOf("export function useKeybindings(");
  assert.ok(registrationStart >= 0, "actual registration hook exists");
  function keybindings(runtime: ReturnType<typeof hooks>) {
    return evaluate(`${registration.slice(registrationStart)}; useKeybindings;`, { ...common, ...runtime });
  }
  const workspace = evaluate(`${prefix("src/features/openIn/AppSwitcher.tsx", "export function AppSwitcher(", "\n  if (!selection?.visible) return null;")}\n}\nAppSwitcher;`, {
    ...common, ...workspaceHooks, useKeybindings: keybindings(workspaceHooks),
  });
  workspaceHooks.render(() => workspace({ apps: [VSCODE], mru: [], onOpen: (id: string) => workspaceCalls.push(id) }));
  const appFunctions = evaluate(`${source("src/features/openIn/apps.ts").replace(/^import .*;$/gm, "")}\n({ defaultAppId, supportsFileOpen });`, {});
  const fileSource = source("src/features/diff/FileContextMenu.tsx");
  const fileStart = fileSource.indexOf("function useFileApps(");
  const fileEnd = fileSource.indexOf("\n  return (", fileStart);
  assert.ok(fileStart >= 0 && fileEnd > fileStart, "actual file-app hook and component boundary exist");
  const file = evaluate(`${fileSource.slice(fileStart, fileEnd)}\n}\nFileContextMenu;`, {
    ...common, ...fileHooks, ...appFunctions,
    useKeybindings: keybindings(fileHooks), useAppPrefs: () => ({ default_open_in: saved }),
    loadOpenInApps: () => Promise.resolve(apps),
  });
  let openIn = (app: OpenInApp) => { fileCalls.push(app); };
  const render = () => fileHooks.render(() => file({
    path: "src/selected file.ts", at: { x: 0, y: 0 }, onClose: () => { closes++; },
    actions: { view() {}, copyPath() {}, discard() {}, openIn: canOpen ? openIn : undefined },
  }));
  render();
  await Promise.resolve();
  render();
  return {
    dispatcher, fileCalls, workspaceCalls,
    closes: () => closes,
    press: (focus = FOCUS, key = KEY) => dispatcher.dispatch(key, focus),
    release: () => listeners.get("keyup")?.({ ...KEY, key: "Meta", code: "MetaLeft", metaKey: false }),
    unmount: () => fileHooks.unmount(),
    changeCallback(callback: (app: OpenInApp) => void) { openIn = callback; render(); },
  };
}

for (const activeDialogId of [null, "dialog"]) {
  test(`open file immediately rather than the workspace chooser (dialog=${activeDialogId})`, async () => {
    const m = await menu();
    assert.equal(m.press({ ...FOCUS, activeDialogId }).kind, "ran");
    assert.deepEqual(m.fileCalls, [VSCODE]);
    m.release();
    assert.deepEqual(m.workspaceCalls, []);
    assert.equal(m.closes(), 0, "no shortcut-specific popup-close side effect");
  });
}

test("saved file-capable default uses the original selected-file callback", async () => {
  const m = await menu({ saved: "zed" });
  m.press();
  assert.equal(m.fileCalls[0], ZED);
  assert.equal(m.fileCalls.length, 1);
});

for (const saved of [null, "not-installed", "terminal"]) {
  test(`first file-capable app is the fallback for ${String(saved)}`, async () => {
    const m = await menu({ apps: [TERMINAL, VSCODE, ZED], saved });
    m.press();
    assert.deepEqual(m.fileCalls, [VSCODE]);
  });
}

for (const options of [{ apps: [] }, { apps: [TERMINAL], saved: "terminal" }, { canOpen: false }]) {
  test(`no file target falls through without consuming the workspace shortcut: ${JSON.stringify(options)}`, async () => {
    const m = await menu(options);
    m.press();
    assert.deepEqual(m.fileCalls, []);
    m.release();
    assert.deepEqual(m.workspaceCalls, ["vscode"]);
    assert.equal(m.press({ ...FOCUS, activeDialogId: "dialog" }).kind, "pass");
  });
}

test("popup shortcut keeps DIALOG/global/input/terminal/typing metadata", async () => {
  const m = await menu();
  const bindings = m.dispatcher.handlers().filter((h) => h.commandId === "workspace.openInApp" && h.priority === PRIORITY.DIALOG);
  assert.equal(bindings.length, 1);
  const [binding] = bindings;
  assert.equal(binding.isGlobal, true);
  assert.equal(binding.enableOnInputFocus, true);
  assert.equal(binding.enableOnTerminalFocus, true);
  assert.equal(binding.allowWhileTyping, false);
  assert.ok(!binding.enableOnDialogIds?.length);
  for (const focus of [{ ...FOCUS, typing: true, activeDialogId: "dialog" }, { ...FOCUS, typing: true, inTerminal: true }]) {
    assert.equal(m.press(focus).kind, "ran");
  }
  assert.deepEqual(m.fileCalls, [VSCODE, VSCODE]);
});

test("unmount unregisters the popup binding and restores ordinary AppSwitcher", async () => {
  const m = await menu();
  m.press();
  assert.deepEqual(m.fileCalls, [VSCODE]);
  m.unmount();
  assert.ok(m.dispatcher.handlers().every((h) => h.priority !== PRIORITY.DIALOG));
  m.press();
  m.release();
  assert.deepEqual(m.fileCalls, [VSCODE]);
  assert.deepEqual(m.workspaceCalls, ["vscode"]);
});

test("a changed selected-file callback is used without stale registration", async () => {
  const m = await menu();
  const next: OpenInApp[] = [];
  m.changeCallback((app) => { next.push(app); });
  m.press();
  assert.deepEqual(m.fileCalls, []);
  assert.deepEqual(next, [VSCODE]);
});

test("shortcut overrides route through the popup and preserve bare-key typing", async () => {
  const m = await menu({ overrides: { "workspace.openInApp": [{ key: { kind: "logical", value: "p" } }] } });
  assert.equal(m.press().kind, "pass", "old Cmd+O no longer fires");
  const key = { ...KEY, key: "p", code: "KeyP", metaKey: false };
  assert.equal(m.press({ ...FOCUS, typing: true }, key).kind, "pass");
  assert.equal(m.press({ ...FOCUS, inTerminal: true }, key).kind, "pass");
  assert.equal(m.press({ ...FOCUS, activeDialogId: "dialog" }, key).kind, "ran");
  assert.deepEqual(m.fileCalls, [VSCODE]);
});
