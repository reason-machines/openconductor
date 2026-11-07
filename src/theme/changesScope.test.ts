import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const styles = readFileSync(new URL("../features/diff/diff.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const reference: unknown = JSON.parse(readFileSync(new URL("../../evidence/diff/historical-chip/class-merge-result.json", import.meta.url), "utf8"));
assert.ok(typeof reference === "object" && reference !== null && "final" in reference);
assert.ok(typeof reference.final === "string");
const referenceClasses = new Set(reference.final.split(/\s+/));

function declarations(css: string, selector: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!rule[1].split(",").some((value) => value.trim() === selector)) continue;
    for (const declaration of rule[2].matchAll(/([\w-]+):\s*([^;]+);/g)) values.set(declaration[1], declaration[2].trim());
  }
  return values;
}

test("historical scope uses the reference link fill, text and 40% border instead of action accent", () => {
  assert.ok(referenceClasses.has("bg-link"));
  assert.ok(referenceClasses.has("text-link-foreground"));
  assert.ok(referenceClasses.has("border-link-foreground/40"));
  assert.ok(!referenceClasses.has("text-muted-foreground"));
  assert.ok(!referenceClasses.has("text-foreground/90"));
  const chip = declarations(styles, ".rp-tabs-end .oc-changes-historical-scope");
  assert.equal(chip.get("background"), "var(--highlight)");
  assert.equal(chip.get("color"), "var(--emphasis)");
  assert.equal(chip.get("border"), "1px solid color-mix(in oklab, var(--emphasis) 40%, transparent)");
});

test("historical scope hover outranks generic icon hover without changing its link text", () => {
  assert.ok(referenceClasses.has("hover:bg-link-elevated"));
  assert.ok(referenceClasses.has("hover:text-link-foreground-elevated"));
  assert.ok(!referenceClasses.has("hover:bg-sidebar-accent"));
  assert.ok(!referenceClasses.has("hover:text-accent-foreground"));
  const hover = declarations(styles, ".rp-tabs-end .oc-changes-historical-scope:hover:not(:disabled)");
  assert.equal(hover.get("background"), "var(--link-elevated)");
  assert.equal(hover.get("color"), "var(--emphasis)");
});

test("Stone link colours match the retained compiled CSS in light, dark and system dark", () => {
  const light = ':root[data-color-palette="stone"]';
  const dark = `${light}[data-theme="dark"]`;
  const systemDark = `${light}:not([data-theme="light"])`;
  assert.equal(declarations(tokens, ":root").get("--link-elevated"), "var(--surface-accent)");
  for (const [selector, fill, foreground, elevated] of [
    [light, "#faf7f5", "#a4847f", "#f3ece7"],
    [dark, "#2a1e1d", "#cca694", "#413030"],
    [systemDark, "#2a1e1d", "#cca694", "#413030"],
  ]) {
    const values = declarations(tokens, selector);
    assert.equal(values.get("--highlight"), fill, selector);
    assert.equal(values.get("--emphasis"), foreground, selector);
    assert.equal(values.get("--link-elevated"), elevated, selector);
  }
});
