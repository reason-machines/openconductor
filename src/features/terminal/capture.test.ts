import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { bindCommands } from "../../keybindings/bind.ts";
import { createDispatcher } from "../../keybindings/dispatcher.ts";
import { createKeyListeners, type ListenerEvent } from "../../keybindings/listeners.ts";
import { parseOverrides, type Overrides } from "../../keybindings/overrides.ts";
import { terminalCommandFor } from "./shortcuts.ts";

function capture(overrides: Overrides = {}, key = "k", shiftKey = false, inTerminal = true) {
  const dispatcher = createDispatcher();
  let palettes = 0;
  let stopped = false;
  bindCommands(dispatcher, { toggleCommandPalette: () => void palettes++ }, { overrides });
  const listeners = createKeyListeners({ dispatcher, activeDialogId: () => null });
  const target = { tagName: "TEXTAREA", closest: () => inTerminal ? {} : null };
  const event: ListenerEvent = {
    key, code: `Key${key.toUpperCase()}`, metaKey: true, ctrlKey: false, altKey: false, shiftKey, repeat: false,
    target, defaultPrevented: false, composedPath: () => [target],
    preventDefault() { event.defaultPrevented = true; },
    stopImmediatePropagation() { stopped = true; },
  };
  listeners.keydownCapture(event);
  return { palettes, stopped, terminal: !stopped && inTerminal ? terminalCommandFor(event) : undefined };
}

async function restorationOverrides(): Promise<Overrides> {
  const source = readFileSync(new URL("../../../tests/e2e/terminal-restore.e2e.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function fakeBackend(shellState)");
  const end = source.indexOf("\nconst disk = ", start);
  assert.ok(start >= 0 && end > start);
  const saved = new Map<string, string>();
  const window: { __TAURI_INTERNALS__?: { invoke(command: string): Promise<unknown> } } = {};
  const install: (state: unknown) => void = runInNewContext(`(${source.slice(start, end).trim()})`, {
    window,
    localStorage: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) },
  });
  install({ repos: [], selection: { kind: "home" } });
  assert.ok(window.__TAURI_INTERNALS__);
  const settings = await window.__TAURI_INTERNALS__.invoke("get_settings");
  assert.ok(typeof settings === "object" && settings !== null && "keybinding_overrides_v1" in settings);
  assert.ok(typeof settings.keybinding_overrides_v1 === "string");
  return parseOverrides(settings.keybinding_overrides_v1);
}

test("default Cmd-K is consumed by the global palette before the terminal target", () => {
  assert.deepEqual(capture(), { palettes: 1, stopped: true, terminal: undefined });
});

test("restoration fixture remaps the palette so Cmd-K reaches the terminal without disabling the palette", async () => {
  const overrides = await restorationOverrides();
  assert.deepEqual(capture(overrides), { palettes: 0, stopped: false, terminal: "terminal.clearScrollback" });
  assert.deepEqual(capture(overrides, "p", true), { palettes: 1, stopped: true, terminal: undefined });
  assert.deepEqual(capture(overrides, "k", false, false), { palettes: 0, stopped: false, terminal: undefined });
});
