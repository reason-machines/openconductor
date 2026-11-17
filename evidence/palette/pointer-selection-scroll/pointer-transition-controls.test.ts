import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

// Reuse only the frozen fixture's OpenConductor mounting infrastructure. Its
// original 15 tests stay byte-identical; no retained vendor code is executed.
const fixtureUrl = new URL("../../../src/palette/palettePointerScroll.test.ts", import.meta.url);
const dependencies = createRequire(fixtureUrl);
const source = readFileSync(fixtureUrl, "utf8");
const marker = '\nfor (const tab of ["All", "Actions", "Projects", "Settings", "Workspaces"])';
assert.ok(source.includes(marker));
const harness = source.slice(0, source.indexOf(marker))
  .replaceAll("import.meta.url", JSON.stringify(fixtureUrl.href))
  .replace(/from "([^"]+)"/g, (match, name: string) => {
    if (name.startsWith("node:")) return match;
    return `from ${JSON.stringify(name.startsWith(".") ? new URL(name, fixtureUrl).href : pathToFileURL(dependencies.resolve(name)).href)}`;
  });
const javascript = ts.transpileModule(`${harness}\nexport { fixture };`, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { fixture } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

for (const sameSelected of [false, true]) {
  test(`pointer marker cannot leak through query reset (same-selected hover=${sameSelected})`, async () => {
    const view = await fixture();
    try {
      await view.tab("Actions"); await view.hover(sameSelected ? 0 : 2);
      await view.query("Toggle"); view.clear(); await view.key("ArrowDown");
      assert.equal(view.scrolls.length, 1);
      assert.equal(view.scrolls[0].block, "nearest");
      assert.deepEqual(view.selected(), [view.scrolls[0].title]);
    } finally { await view.close(); }
  });
  test(`pointer marker cannot leak through tab change (same-selected hover=${sameSelected})`, async () => {
    const view = await fixture();
    try {
      await view.tab("Actions"); await view.hover(sameSelected ? 0 : 2);
      await view.tab("Projects"); view.clear(); await view.key("End");
      assert.equal(view.scrolls.length, 1);
      assert.equal(view.scrolls[0].block, "nearest");
      assert.deepEqual(view.selected(), [view.scrolls[0].title]);
    } finally { await view.close(); }
  });
}
