import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isIdentityAttribute } from "./dialogMotion.ts";

test("the leaving snapshot drops every attribute that names or labels a dialog", () => {
  for (const name of ["id", "role", "autofocus", "data-dialog-id", "aria-modal", "aria-label", "aria-labelledby", "aria-describedby", "aria-selected"]) {
    assert.equal(isIdentityAttribute(name), true, name);
  }
});

test("the leaving snapshot keeps what its look and exit animation depend on", () => {
  for (const name of ["class", "style", "data-dialog-motion", "data-archived", "type", "value", "placeholder", "src"]) {
    assert.equal(isIdentityAttribute(name), false, name);
  }
});

// Conductor 0.87.6, measured in its extracted frontend (parity/side-by-side/transitions).
const css = readFileSync(new URL("./screens.css", import.meta.url), "utf8");
const token = (name: string) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

test("motion tokens carry Conductor's dialog timings", () => {
  assert.equal(token("--oc-motion-ease"), "cubic-bezier(0.4, 0, 0.2, 1)");
  assert.equal(token("--oc-motion-dialog"), "200ms");
  assert.equal(token("--oc-motion-dialog-scale"), "0.95");
  assert.equal(token("--oc-motion-cmdk-in"), "180ms");
  assert.equal(token("--oc-motion-cmdk-out"), "130ms");
  assert.equal(token("--oc-motion-cmdk-in-y"), "-12px");
  assert.equal(token("--oc-motion-cmdk-out-y"), "-8px");
  assert.equal(token("--oc-motion-page-fade"), "1000ms");
});
