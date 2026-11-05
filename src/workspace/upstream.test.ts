import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UPSTREAM_WARNING } from "./upstream.ts";

test("the browser stand-in shows the backend's exact push-upstream warning", () => {
  const rust = readFileSync(new URL("../../src-tauri/src/workspace/git.rs", import.meta.url), "utf8");
  assert.ok(rust.includes(JSON.stringify(UPSTREAM_WARNING)), "workspace::git warning text changed");
});
