import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

// Reuse the frozen fixture infrastructure without changing its 18 tests/bytes.
// Only OpenConductor code runs; no retained vendor JavaScript is evaluated.
const fixtureUrl = new URL("../../../src/palette/sectionAutoScroll.test.ts", import.meta.url);
const dependencies = createRequire(fixtureUrl);
const source = readFileSync(fixtureUrl, "utf8");
const marker = "\nfor (const { key, modifiers, from, to }";
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

test("pointer on the already selected row cannot suppress the next keyboard scroll", async () => {
  const view = await fixture();
  try {
    await view.enter(); await view.hover("Section 00"); view.clear();
    await view.hover("Section 00"); assert.deepEqual(view.scrolls, []);
    await view.key("ArrowDown");
    assert.deepEqual(view.selected(), ["Section 01"]);
    assert.deepEqual(view.scrolls, [{ scope: "section", title: "Section 01", block: "nearest" }]);
  } finally { await view.close(); }
});
test("changed pointer selection suppresses only itself, not the following keyboard update", async () => {
  const view = await fixture();
  try {
    await view.enter(); await view.hover("Section 00"); view.clear();
    await view.hover("Section 28"); assert.deepEqual(view.scrolls, []);
    await view.key("ArrowDown");
    assert.deepEqual(view.selected(), ["Section 29"]);
    assert.deepEqual(view.scrolls, [{ scope: "section", title: "Section 29", block: "nearest" }]);
  } finally { await view.close(); }
});
test("pointer-selected footer cannot suppress a subsequent Home endpoint scroll", async () => {
  const view = await fixture();
  try {
    await view.enter(); await view.hover("New section…"); view.clear();
    await view.hover("New section…"); await view.key("Home");
    assert.deepEqual(view.selected(), ["Section 00"]);
    assert.deepEqual(view.scrolls, [{ scope: "section", title: "Section 00", block: "nearest" }]);
  } finally { await view.close(); }
});
