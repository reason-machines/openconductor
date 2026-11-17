// Reuse the frozen mounted harness without altering its twelve regression tests.
// Only the harness declarations run here; no retained vendor code is evaluated.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const fixtureUrl = new URL("../../src/components/homeFilterMenuKeyboard.test.ts", import.meta.url);
const frozen = readFileSync(fixtureUrl, "utf8");
const declarations = frozen.slice(0, frozen.indexOf("for (const [key, label]"))
  .replaceAll("import.meta.url", JSON.stringify(fixtureUrl.href))
  .replace("actions, writes, document,", "actions, writes, document, renderer: () => renderer, key,");
const exports: Record<string, any> = {};
runInNewContext(ts.transpileModule(declarations + "\nexport { fixture };", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
}).outputText, {
  exports, require: createRequire(fixtureUrl), URL, EventTarget, Event, console, setTimeout, clearTimeout,
});
const fixture: (...args: any[]) => Promise<any> = exports.fixture;

for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { nativeEvent: { isComposing: true } }, { which: 229 }]) {
  test(`Projects does not consume typeahead with ${JSON.stringify(modifiers)}`, async () => {
    const view = await fixture();
    try {
      await view.clickTrigger(); await view.focusOption("All projects");
      const event = await view.panelKey("b", modifiers);
      assert.equal(view.focused(), "All projects"); assert.equal(event.defaultPrevented, false);
      assert.equal(view.writes.length, 0); assert.equal(view.actions.length, 0);
    } finally { await view.close(); }
  });
}

test("Projects keeps native Space activation and unrelated panel keys", async () => {
  const view = await fixture();
  try {
    await view.clickTrigger(); await view.focusOption("Alpha");
    for (const key of [" ", "Enter", "ArrowLeft", "Tab"]) {
      assert.equal((await view.panelKey(key)).defaultPrevented, false);
      assert.equal(view.focused(), "Alpha");
    }
    assert.equal(view.writes.length, 0);
  } finally { await view.close(); }
});

test("Projects typeahead accumulates prefixes, cycles repeated letters and resets on reopen", async () => {
  const view = await fixture();
  try {
    await view.clickTrigger(); await view.focusOption("All projects");
    await view.panelKey("a"); assert.equal(view.focused(), "Alpha");
    await view.panelKey("a"); assert.equal(view.focused(), "All projects");
    await view.panelKey("l"); assert.equal(view.focused(), "All projects");
    await view.panelKey("l"); assert.equal(view.focused(), "All projects");
    await view.escape(); await view.clickTrigger(); await view.focusOption("Alpha");
    await view.panelKey("B"); assert.equal(view.focused(), "Beta");
    assert.equal(view.writes.length, 0);
  } finally { await view.close(); }
});

test("Projects arrows refocus an already-open menu but ignore composition", async () => {
  const view = await fixture();
  try {
    assert.equal((await view.triggerKey("ArrowDown", { nativeEvent: { isComposing: true } })).defaultPrevented, false);
    assert.equal(view.open(), false);
    await view.clickTrigger(); await view.triggerKey("ArrowUp"); assert.equal(view.focused(), "Beta");
    await view.triggerKey("ArrowDown"); assert.equal(view.focused(), "All projects");
    assert.equal((await view.panelKey("ArrowUp", { which: 229 })).defaultPrevented, false);
    assert.equal(view.focused(), "All projects");
  } finally { await view.close(); }
});

test("Archive menu remains opted out of Projects keyboard handlers", async () => {
  const view = await fixture();
  try {
    const archive = view.renderer().root.findAll((node: any) => node.type === "button" && node.props["aria-haspopup"] === "menu" && node.props["aria-label"] !== "Projects");
    assert.equal(archive.length, 1);
    assert.equal(archive[0].props.onKeyDown, undefined);
    await view.key(archive[0], "ArrowDown");
    assert.equal(archive[0].props["aria-expanded"], false);
    assert.equal(view.actions.length, 0); assert.equal(view.writes.length, 0);
  } finally { await view.close(); }
});
