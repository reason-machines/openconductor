import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./settings.css", import.meta.url), "utf8");
const preview = ".settings .settings-markdown-preview";

function declarations(selector: string): Map<string, string> {
  const body = css.split(`${selector} {`)[1]?.split("}")[0];
  assert.ok(body, `missing ${selector} rule`);
  const result = new Map<string, string>();
  for (const declaration of body.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon !== -1) result.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
  }
  return result;
}

test("Settings Tufte sample applies the shipped compact article dimensions inside the card", () => {
  const article = declarations(`${preview}.tufte > .md`);
  assert.equal(article.get("max-width"), "55rem");
  assert.equal(article.get("margin"), "0 auto");
  assert.equal(article.get("padding"), "1rem 2rem");
  assert.equal(article.get("font-size"), ".95rem");
  assert.equal(article.get("line-height"), "1.8");
});

test("Settings Tufte title uses the shipped compact centered heading without added italics", () => {
  const title = declarations(`${preview}.tufte h1`);
  assert.equal(title.get("text-align"), "center");
  assert.equal(title.get("margin"), "2rem 0 1.5rem");
  assert.equal(title.get("font-size"), "1.75rem");
  assert.equal(title.get("line-height"), "1.2");
  assert.equal(title.get("font-weight"), "400");
  assert.notEqual(title.get("font-style"), "italic");
});

test("Settings Tufte paragraph keeps article metrics and shipped paragraph formatting", () => {
  const paragraph = declarations(`${preview}.tufte p`);
  assert.equal(paragraph.get("text-align"), "justify");
  assert.equal(paragraph.get("-webkit-hyphens"), "auto");
  assert.equal(paragraph.get("hyphens"), "auto");
  assert.equal(paragraph.get("margin"), "0 0 1.4rem");
  assert.equal(paragraph.get("font-size"), "inherit");
  assert.equal(paragraph.get("line-height"), "inherit");
});

test("Default Settings Markdown sample retains its separate card and typography rules", () => {
  assert.equal(declarations(preview).get("padding"), "16px");
  assert.equal(declarations(`${preview} h1`).get("font-size"), "30px");
  assert.equal(declarations(`${preview} h1`).get("line-height"), "36px");
  assert.equal(declarations(`${preview} p`).get("font-size"), "14px");
  assert.equal(declarations(`${preview} p`).get("line-height"), "24px");
});
