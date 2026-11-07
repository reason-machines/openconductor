import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const policyPath = new URL("../scroll.css", import.meta.url);
const css = existsSync(policyPath) ? readFileSync(policyPath, "utf8") : "";
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
function declarations(selector: string) {
  return rules.filter((rule) => rule[1].split(",").some((s) => s.trim() === selector)).map((rule) => rule[2]).join(";");
}

test("the document cannot scroll or rubber-band behind the application", () => {
  for (const selector of ["html", "body"]) {
    assert.match(declarations(selector), /overflow:\s*hidden\s*;/, selector);
    assert.match(declarations(selector), /overscroll-behavior:\s*none\s*;/, selector);
  }
});

test("content panes contain scroll chaining without disabling local bounce", () => {
  for (const selector of [".repo-list", ".chat-scroll", ".oc-files", ".oc-changes", ".oc-code-view", ".checks", ".settings-page", ".settings-sheet-body", ".term-body .xterm-scrollable-element", ".script-output .xterm-scrollable-element"]) {
    assert.match(declarations(selector), /overscroll-behavior:\s*contain\s*;/, selector);
  }
});

test("fixed Home and tab strips are not scroll owners", () => {
  for (const selector of [".home", ".rp-tabs > .rp-tab-buttons", ".ws-strip-tabs"]) {
    assert.match(declarations(selector), /overflow:\s*hidden\s*;/, selector);
    assert.match(declarations(selector), /overscroll-behavior:\s*none\s*;/, selector);
  }
});

test("the containment policy is loaded by the app", () => {
  assert.match(readFileSync(new URL("../main.tsx", import.meta.url), "utf8"), /import "\.\/scroll\.css";/);
});
