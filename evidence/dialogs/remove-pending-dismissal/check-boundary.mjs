import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [ref] = process.argv.slice(2);
const readSource = (path) => ref
  ? execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" })
  : readFileSync(path, "utf8");
const caller = readSource("src/components/RemoveRepositoryDialog.tsx");
const shared = readSource("src/components/ConfirmationDialog.tsx");
const tag = caller.match(/<ConfirmationDialog\b([\s\S]*?)>/)?.[1];
const parameters = shared.match(/export function ConfirmationDialog\((\{[^\n]*\}): Props\)/)?.[1];
const handler = shared.match(/onClose=\{(\(\) => \{[^}]*\})\}/)?.[1];
assert.ok(tag, "read the production removal caller's props");
assert.ok(parameters, "read the production shared component's defaults");
assert.ok(handler, "read the production frame-close closure");

function attribute(name, pending, onClose) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}(?:=\\{([^}]*)\\})?(?=\\s|$)`));
  if (!match) return undefined;
  return match[1] === undefined ? true : new Function("pending", "onClose", `return (${match[1]});`)(pending, onClose);
}

for (const pending of [true, false]) {
  let closes = 0;
  const onClose = () => { closes++; };
  const props = Object.fromEntries(["pending", "dismissWhilePending", "onClose"]
    .map((name) => [name, attribute(name, pending, onClose)])
    .filter(([, value]) => value !== undefined));
  assert.equal(props.pending, pending, "the real caller forwards mutation state");
  assert.equal(props.onClose, onClose, "the real caller forwards its close callback");
  const close = new Function("props", `const ${parameters} = props; return (${handler});`)(props);
  close();
  assert.equal(closes, 1, `repository removal permits a close request with pending=${pending}`);
}

assert.equal((shared.match(/disabled=\{pending\}/g) ?? []).length, 2, "both production action buttons retain the pending guard");
assert.match(caller, /primaryShortcut=\{false\}/, "removal retains its shortcut policy");
console.log("PASS: actual removal props + shared defaults + close closure (pending and idle); action guards retained");
console.log("SOURCE BOUNDARY ONLY: no React mount, browser Escape, reference runtime, or native filesystem operation");
