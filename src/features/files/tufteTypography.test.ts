import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const surfaces = [
  { name: "workspace Markdown files", path: "./markdownFile.css", selector: ".markdown-file-preview.tufte" },
  { name: "Settings Markdown preview", path: "../../settings/settings.css", selector: ".settings .settings-markdown-preview.tufte" },
];

for (const { name, path, selector } of surfaces) {
  test(`${name} uses the shipped Tufte font family`, () => {
    const css = readFileSync(new URL(path, import.meta.url), "utf8");
    const rule = css.split(`${selector} {`)[1]?.split("}")[0];
    assert.ok(rule, `missing ${selector} rule`);
    const family = rule.match(/font-family:\s*([^;]+);/)?.[1];
    assert.equal(family, 'Georgia, "Times New Roman", serif');
  });
}
