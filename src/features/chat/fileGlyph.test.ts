import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as ts from "typescript";
import * as icons from "./toolIconData.ts";

const dependencies = createRequire(import.meta.url);
const production: Partial<Pick<typeof import("./ToolRows.tsx"), "FileGlyph">> = {};
const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
  fileName: "ToolRows.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error).length, 0);
runInNewContext(compiled.outputText, {
  exports: production,
  require(name: string) {
    switch (name) {
      case "react": case "react/jsx-runtime": return dependencies(name);
      case "./toolIconData.ts": return icons;
      case "./conductorTools.ts": case "./thinkingChip.ts": case "./markdown.ts":
      case "./LinkMenu.tsx": case "../../backend.ts":
        return new Proxy({}, { get() { throw new Error(`Unrelated FileGlyph dependency: ${name}`); } });
      default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
    }
  },
}, { filename: "ToolRows.tsx" });
const FileGlyph = production.FileGlyph;
assert.ok(typeof FileGlyph === "function");

type Glyph = keyof typeof icons.FILE_GLYPHS;
const cases: Array<{ path: string; glyph: Glyph; tint: string }> = [
  { path: "/fixture/photo.constructor", glyph: "file", tint: "muted" },
  { path: "/fixture/photo.__proto__", glyph: "file", tint: "muted" },
  { path: "/fixture/example.ts", glyph: "typescript", tint: "blue-600" },
  { path: "/fixture/photo.PNG", glyph: "file-image", tint: "green-500" },
  { path: "/fixture/example.unknown", glyph: "file", tint: "muted" },
  { path: "/fixture/README", glyph: "file", tint: "muted" },
];

for (const { path, glyph, tint } of cases) {
  test(`FileGlyph renders the registered glyph or fallback for ${path}`, () => {
    const expected = icons.FILE_GLYPHS[glyph];
    assert.equal(renderToStaticMarkup(createElement(FileGlyph, { path })), renderToStaticMarkup(createElement("svg", {
      className: "oc-file-glyph", "data-tint": tint, viewBox: expected.viewBox,
      fill: "currentColor", role: "img", "aria-hidden": true,
    }, ...expected.nodes.map(([tag, attributes], index) => createElement(tag, { ...attributes, key: index })))));
  });
}
