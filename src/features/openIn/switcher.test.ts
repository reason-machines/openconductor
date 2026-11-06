import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleSwitcher, releasesOpenShortcut, switcherEntries } from "./switcher.ts";
import { logical, physical } from "../../keybindings/types.ts";

const apps = ["finder", "cursor", "terminal"].map((id) => ({ id, name: id, iconType: "code" as const, icon: null }));
const ids = (width: number, mru: string[] = []) => switcherEntries(apps, mru, width).map((e) => e.kind === "app" ? e.app.id : "close");

test("chooser puts available MRU apps first, deduplicates legacy and target-qualified ids", () => {
  assert.deepEqual(ids(1280, ["missing", "terminal|local", "cursor|remote", "terminal"]), ["terminal", "cursor", "finder", "close"]);
});
test("chooser keeps a final Close tile inside the viewport", () => {
  assert.deepEqual(ids(458), ["finder", "cursor", "close"]);
  assert.deepEqual(ids(200), ["close"]);
});
test("forward and backward cycling wrap and reveal the chooser immediately", () => {
  const selection = { entries: switcherEntries(apps, [], 1280), index: 0, visible: false };
  const last = cycleSwitcher(selection, -1);
  assert.equal(last.index, 3);
  assert.equal(last.visible, true);
  assert.equal(cycleSwitcher(last, 1).index, 0);
});
const event = (key: string, code = "") => ({ key, code, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false });
test("release opens only when a bound modifier is released, not the letter or an unrelated modifier", () => {
  const shortcuts = [logical("o", ["meta"])];
  assert.equal(releasesOpenShortcut(shortcuts, event("o", "KeyO")), false);
  assert.equal(releasesOpenShortcut(shortcuts, event("Shift")), false);
  assert.equal(releasesOpenShortcut(shortcuts, event("Meta")), true);
  assert.equal(releasesOpenShortcut([logical("o", ["ctrl", "alt"])], event("Alt")), true);
});
test("unmodified and physical shortcut overrides open when their key is released", () => {
  assert.equal(releasesOpenShortcut([logical("o")], event("O")), true);
  assert.equal(releasesOpenShortcut([physical("KeyO", "O")], event("ø", "KeyO")), true);
  assert.equal(releasesOpenShortcut([logical("o")], event("p")), false);
});
