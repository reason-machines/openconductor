import { test } from "node:test";
import assert from "node:assert/strict";
import { isToggleLeftSidebar, isTypingTarget } from "./shortcuts.ts";

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

test("Cmd+B toggles the sidebar, even while typing", () => {
  assert.equal(isToggleLeftSidebar(key("b", { metaKey: true }), false), true);
  assert.equal(isToggleLeftSidebar(key("B", { metaKey: true }), true), true);
  assert.equal(isToggleLeftSidebar(key("b", { metaKey: true, shiftKey: true }), false), false);
  assert.equal(isToggleLeftSidebar(key("b", { ctrlKey: true }), false), false);
  assert.equal(isToggleLeftSidebar(key("b"), false), false);
});

test("bare [ toggles only when not typing", () => {
  assert.equal(isToggleLeftSidebar(key("["), false), true);
  assert.equal(isToggleLeftSidebar(key("["), true), false);
  assert.equal(isToggleLeftSidebar(key("[", { metaKey: true }), false), false);
});

test("typing targets", () => {
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
});
