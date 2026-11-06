import assert from "node:assert/strict";
import { test } from "node:test";
import { keyedCache } from "./keyedCache.ts";

test("returns what was stored per key", () => {
  const c = keyedCache<number>();
  assert.equal(c.get("a"), undefined);
  c.set("a", 1);
  c.set("b", 2);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("b"), 2);
  c.set("a", 3);
  assert.equal(c.get("a"), 3);
  c.delete("a");
  assert.equal(c.get("a"), undefined);
});

test("evicts the least recently used entry past the limit", () => {
  const c = keyedCache<number>(2);
  c.set("a", 1);
  c.set("b", 2);
  c.get("a"); // a is now newer than b
  c.set("c", 3);
  assert.equal(c.size, 2);
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("c"), 3);
});
