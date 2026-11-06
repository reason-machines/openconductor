import { test } from "node:test";
import assert from "node:assert/strict";
import { installContextMenuGuard, keepsNativeContextMenu, type ContextMenuTarget } from "./nativeContextMenu.ts";

/** A target whose ancestors (itself first) match the given selectors. */
function el(matches: string[], isContentEditable = false): ContextMenuTarget {
  return {
    isContentEditable,
    closest(selector: string) {
      return selector.split(",").some((s) => matches.includes(s.trim())) ? this : null;
    },
  };
}

test("text fields and editable areas keep the native menu", () => {
  assert.equal(keepsNativeContextMenu(el(["input"])), true);
  assert.equal(keepsNativeContextMenu(el(["textarea"])), true);
  assert.equal(keepsNativeContextMenu(el(["[contenteditable]"], true)), true);
});

test("everything else gets no menu", () => {
  assert.equal(keepsNativeContextMenu(el(["button"])), false);
  assert.equal(keepsNativeContextMenu(el([])), false);
  // contenteditable="false" matches the selector but is not editable.
  assert.equal(keepsNativeContextMenu(el(["[contenteditable]"], false)), false);
  assert.equal(keepsNativeContextMenu(null), false);
  assert.equal(keepsNativeContextMenu({}), false);
});

test("images and CodeMirror never keep it, even inside an editable area", () => {
  assert.equal(keepsNativeContextMenu(el(["img", "[contenteditable]"], true)), false);
  assert.equal(keepsNativeContextMenu(el([".cm-editor", "textarea"])), false);
});

test("the guard cancels only menus outside text fields, and removes cleanly", () => {
  const listeners = new Map<string, (e: Event) => void>();
  const doc = {
    addEventListener: (type: string, fn: (e: Event) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  } as unknown as Document;
  const remove = installContextMenuGuard(doc);
  const fire = (target: ContextMenuTarget) => {
    let prevented = false;
    listeners.get("contextmenu")!({ target, preventDefault: () => (prevented = true) } as unknown as Event);
    return prevented;
  };
  assert.equal(fire(el(["button"])), true);
  assert.equal(fire(el(["textarea"])), false);
  remove();
  assert.equal(listeners.has("contextmenu"), false);
});
