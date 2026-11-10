import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { nextIndex } from "./helpMenuItems.ts";

const source = readFileSync(new URL("./HelpMenu.tsx", import.meta.url), "utf8");
const start = source.indexOf("  const onMenuKey = ");
const end = source.indexOf("\n  };", start);
assert.ok(start >= 0 && end > start, "HelpMenu's production key callback exists");
assert.match(source, /onKeyDown=\{onMenuKey\}/, "the popup uses that callback");
const callback = stripTypeScriptTypes(source.slice(start, end + "\n  };".length));

class MenuKeyEvent extends Event {
  readonly key: string;

  constructor(key: string) {
    super("keydown", { bubbles: true, cancelable: true });
    this.key = key;
  }
}

type FocusTarget = { focus: () => void };
type MenuRef = { current: { querySelectorAll: (selector: string) => FocusTarget[] } | null };
type MenuDocument = { activeElement: FocusTarget | null };

function bindCallback(menuRef: MenuRef, document: MenuDocument): (event: MenuKeyEvent) => void {
  return new Function("menuRef", "document", "nextIndex", `${callback}\nreturn onMenuKey;`)(menuRef, document, nextIndex);
}

function menu(count: number, active: number, mounted = true) {
  const document: MenuDocument = { activeElement: null };
  let focusCalls = 0;
  const items = Array.from({ length: count }, () => {
    const item: FocusTarget = { focus: () => { document.activeElement = item; focusCalls++; } };
    return item;
  });
  document.activeElement = items[active] ?? null;
  const menuRef: MenuRef = {
    current: mounted ? {
      querySelectorAll: (selector) => {
        assert.equal(selector, "[role=menuitem]");
        return items;
      },
    } : null,
  };
  const onMenuKey = bindCallback(menuRef, document);
  return { document, items, onMenuKey, focusCalls: () => focusCalls };
}

for (const [key, active, expected] of [
  ["ArrowDown", 0, 1],
  ["ArrowDown", 1, 2],
  ["ArrowDown", 2, 0],
  ["ArrowUp", 0, 2],
  ["ArrowUp", 1, 0],
  ["ArrowUp", 2, 1],
] satisfies [string, number, number][]) {
  test(`actual HelpMenu callback: ${key} from item ${active} focuses ${expected} without bubbling`, () => {
    const popup = menu(3, active);
    const event = new MenuKeyEvent(key);
    popup.onMenuKey(event);
    assert.equal(popup.document.activeElement, popup.items[expected]);
    assert.equal(popup.focusCalls(), 1);
    assert.equal(event.defaultPrevented, true, "handled arrows prevent the default action");
    assert.equal(event.cancelBubble, true, "handled arrows must stop propagation beyond Help");
  });
}

test("actual HelpMenu callback: unhandled keys remain available to other handlers", () => {
  for (const key of ["Home", "End", "Escape", "Enter", "Tab", "ArrowLeft", "ArrowRight", "a"]) {
    const popup = menu(3, 1);
    const event = new MenuKeyEvent(key);
    popup.onMenuKey(event);
    assert.equal(popup.document.activeElement, popup.items[1], key);
    assert.equal(popup.focusCalls(), 0, key);
    assert.equal(event.defaultPrevented, false, key);
    assert.equal(event.cancelBubble, false, key);
  }
});

test("actual HelpMenu callback: arrows without a focused menu item are not consumed", () => {
  for (const key of ["ArrowDown", "ArrowUp"]) {
    for (const [count, active, mounted] of [[0, -1, true], [3, -1, true], [3, 1, false]] satisfies [number, number, boolean][]) {
      const popup = menu(count, active, mounted);
      const before = popup.document.activeElement;
      const event = new MenuKeyEvent(key);
      popup.onMenuKey(event);
      assert.equal(popup.document.activeElement, before);
      assert.equal(popup.focusCalls(), 0);
      assert.equal(event.defaultPrevented, false);
      assert.equal(event.cancelBubble, false);
    }
  }
});
