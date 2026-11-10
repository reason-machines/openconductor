import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Advanced SSH Browse requests one file, not a directory", () => {
  const advanced = read("./AdvancedPage.tsx");
  const pathRow = advanced.slice(advanced.indexOf("function PathRow("), advanced.indexOf("function ScrollbackRow("));
  assert.doesNotMatch(pathRow, /pickFolder\(/, "SSH keys are files; the folder picker cannot select one");
  assert.match(pathRow, /open\(\{ directory: false, multiple: false, title: "Select SSH private key" \}\)/);
});

test("the root directory remains folder-only", () => {
  assert.match(read("./RootPathRow.tsx"), /pickFolder\("Select OpenConductor root directory"\)/);
  assert.match(read("../backend.ts"), /open\(\{ directory: true, multiple: false, title, defaultPath \}\)/);
});
