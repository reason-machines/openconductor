import { test } from "node:test";
import assert from "node:assert/strict";
import { hintLabel, hintNumbers, holdsExactly } from "./shortcutHint.ts";

const ev = (m: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>>) => ({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...m });

test("only exactly the switch modifiers count as holding it", () => {
  assert.ok(holdsExactly(["meta"], ev({ metaKey: true })));
  assert.ok(!holdsExactly(["meta"], ev({ metaKey: true, shiftKey: true })));
  assert.ok(!holdsExactly(["meta"], ev({})));
  assert.ok(!holdsExactly([], ev({})));
});

test("the first nine rows get 1..9", () => {
  const ids = Array.from({ length: 11 }, (_, i) => `w${i}`);
  const n = hintNumbers(ids);
  assert.equal(n.size, 9);
  assert.equal(n.get("w0"), 1);
  assert.equal(n.get("w8"), 9);
  assert.equal(n.get("w9"), undefined);
  assert.equal(hintLabel(3), "Switch with Command-3");
});
