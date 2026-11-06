import { test } from "node:test";
import assert from "node:assert/strict";
import { CONDUCTOR_DARK, CONDUCTOR_LIGHT, hslToHex } from "./conductorCode.ts";

test("hslToHex converts Conductor's 'h s% l%' steps like its Zg", () => {
  assert.equal(hslToHex("30 0% 100%"), "#ffffff");
  assert.equal(hslToHex("0 0% 0%"), "#000000");
  assert.equal(hslToHex("0 100% 50%"), "#ff0000");
  // gray 1000, Conductor Dark's background: the reference capture's rgb(20, 17, 16).
  assert.equal(hslToHex("24 10% 7%"), "#141110");
});

test("Conductor Dark: warm near-black ground, red keywords, orange variables; Light on white", () => {
  assert.equal(CONDUCTOR_DARK.bg, "#141110");
  assert.equal(CONDUCTOR_DARK.keyword, hslToHex("0 91% 71%"));
  assert.equal(CONDUCTOR_DARK.variable, hslToHex("27 96% 61%"));
  assert.equal(CONDUCTOR_LIGHT.bg, "#ffffff");
});
