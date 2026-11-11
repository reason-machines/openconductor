import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = await readFile(new URL("./RowStatusIcon.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
  .replace('"../state/rowStatus"', JSON.stringify(new URL("../state/rowStatus.ts", import.meta.url).href));
const { RowStatusIcon } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

for (const status of ["setting-up", "working", "cancelling", "waiting"]) {
  test(`${status} renders only one outline spinner, never ellipsis dots`, () => {
    const icon = renderToStaticMarkup(createElement(RowStatusIcon, { status }));
    assert.match(icon, /class="sb-ws-loader"/);
    assert.match(icon, /width="14" height="14"/);
    assert.match(icon, /fill="none" stroke="currentColor" stroke-width="2"/);
    assert.equal((icon.match(/<svg\b/g) ?? []).length, 1);
    assert.equal((icon.match(/<path\b/g) ?? []).length, 1);
    assert.doesNotMatch(icon, /<circle\b/);
  });
}

test("spinner respects caller size and stays hidden from assistive technology", () => {
  const icon = renderToStaticMarkup(createElement(RowStatusIcon, { status: "working", size: 20 }));
  assert.match(icon, /width="20" height="20"/);
  assert.match(icon, /aria-hidden="true"/);
});

test("idle and PR indicators do not acquire the busy spinner", () => {
  for (const status of ["branch", "local", "open-pr", "merged", "failed"]) {
    const icon = renderToStaticMarkup(createElement(RowStatusIcon, { status }));
    assert.match(icon, /<svg\b/);
    assert.doesNotMatch(icon, /sb-ws-loader/);
  }
});

test("spinner rotates as one glyph and stops for reduced motion", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.sb-ws-loader\s*\{[^}]*animation:\s*sb-ws-spin 1s linear infinite/);
  assert.match(css, /@keyframes sb-ws-spin\s*\{\s*to\s*\{\s*transform:\s*rotate\(360deg\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.sb-ws-loader\s*\{\s*animation: none/);
  assert.doesNotMatch(css, /\.sb-ws-loader circle/);
});
