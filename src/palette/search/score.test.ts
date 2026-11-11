import assert from "node:assert/strict";
import { test } from "node:test";
import { commandScore, FILTER_THRESHOLD, filterScore } from "./score.ts";

test("command queries can span consecutive keyword aliases", () => {
  const keywords = ["create", "new", "section", "sidebar"];
  assert.ok(filterScore("Create section", "new section", keywords) > FILTER_THRESHOLD);
  assert.ok(filterScore("Create section", "section sidebar", keywords) > FILTER_THRESHOLD);
  assert.ok(filterScore("Create section", "sidebar", keywords) > FILTER_THRESHOLD);
});

test("command queries can span the value and its keyword aliases", () => {
  assert.ok(filterScore("Open", "open project", ["project"]) > FILTER_THRESHOLD);
  assert.ok(filterScore("Open", "OPEN PROJECT", [" project "]) > FILTER_THRESHOLD);
});

test("combined aliases still require query characters in candidate order", () => {
  assert.equal(filterScore("Organize", "section new", ["new", "section"]), 0);
  assert.equal(filterScore("Create section", "zzqx", ["create", "new", "section", "sidebar"]), 0);
});

test("commands without aliases retain exact, prefix and missing-query behavior", () => {
  assert.equal(commandScore("Open", ""), 1);
  assert.equal(commandScore("Open", "Open"), 1);
  assert.ok(commandScore("Open", "op") > FILTER_THRESHOLD);
  assert.equal(filterScore("Open", "project"), 0);
});
