import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [ref] = process.argv.slice(2);
const path = "src/components/ConfirmationDialog.tsx";
const source = ref ? execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" }) : readFileSync(path, "utf8");
const match = source.match(/onClose=\{(\(\) => \{[^}]*\})\}/);
assert.ok(match, "read the actual production frame-close handler");
for (const [pending, dismissWhilePending, expected] of [[true, true, 1], [true, false, 0], [false, false, 1], [false, true, 1]]) {
  let closes = 0;
  const close = new Function("pending", "dismissWhilePending", "onClose", `return (${match[1]});`)(pending, dismissWhilePending, () => { closes++; });
  close();
  assert.equal(closes, expected, `pending=${pending}, dismissWhilePending=${dismissWhilePending}`);
}
console.log("PASS: four actual source-handler boundary cases; not a browser or native test");
