// Run: node --test "src/**/*.test.ts"
//
// The main window's minimum size lives in two places: `minWidth` / `minHeight` in
// src-tauri/tauri.conf.json (what Tauri enforces for user resizes) and the constants in
// src-tauri/src/window_bounds.rs (what the resize handler re-applies to restored sizes).
// These tests pin them together. They also pin the workspace header to Conductor's 40 px.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("tauri.conf.json main window minimum matches window_bounds.rs", () => {
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  const main = conf.app.windows.find((w: { title?: string }) => w.title === "OpenConductor");
  assert.ok(main, "main window is configured");
  const rs = read("src-tauri/src/window_bounds.rs");
  const minW = Number(rs.match(/pub const MIN_WIDTH: f64 = ([0-9.]+);/)?.[1]);
  const minH = Number(rs.match(/pub const MIN_HEIGHT: f64 = ([0-9.]+);/)?.[1]);
  assert.equal(main.minWidth, minW, "minWidth");
  assert.equal(main.minHeight, minH, "minHeight");
  assert.ok(main.width >= main.minWidth && main.height >= main.minHeight, "default size fits the minimum");
});

test("the workspace header is Conductor's 40 px row (h-10)", () => {
  const css = read("src/styles.css");
  const rule = css.match(/\.ws-header \{[^}]*\}/)?.[0] ?? "";
  assert.match(rule, /height: 40px;/);
});
