import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const base = "e92b5dd8f6e0655766d4360e8b24c255907a3a42";
const path = "src/features/chat/Transcript.tsx";
const before = execFileSync("git", ["show", `${base}:${path}`], { encoding: "utf8" });
const after = readFileSync(path, "utf8");
const hash = (text) => createHash("sha256").update(text).digest("hex");
assert.equal(hash(before), "327c8cf638d06cee797b752e6c771bdbacad5138a044737fa8c4ac04a8f0d694");
const parse = (text) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const original = parse(before);
const current = parse(after);
assert.equal(current.statements.length, original.statements.length);
const allowed = new Set(["Transcript", "RowContext", "Agent"]);
const changed = [];
original.statements.forEach((node, index) => {
  const next = current.statements[index];
  const name = node.name?.getText(original);
  assert.equal(next.kind, node.kind);
  if (node.getFullText(original) === next.getFullText(current)) return;
  assert.ok(allowed.has(name), `Unchanged adjacent statement: ${name ?? ts.SyntaxKind[node.kind]}`);
  changed.push(name);
});
assert.deepEqual(changed, ["Transcript", "RowContext", "Agent"]);

const referencePath = new URL("./reference.json", import.meta.url);
const referenceBytes = readFileSync(referencePath);
assert.equal(referenceBytes.length, 8497);
assert.equal(hash(referenceBytes), "bd18e27c9678ffcb4e4bc3c38630a47c8196a2e6f884ee3244938b6b40ee2732");
const reference = JSON.parse(referenceBytes);
for (const [name, slice] of Object.entries(reference.slices)) {
  assert.equal(hash(slice.text), slice.sha256, `${name} SHA-256`);
  assert.equal(Buffer.byteLength(slice.text), slice.utf8[1] - slice.utf8[0], `${name} UTF-8 length`);
  assert.equal(slice.text.length, slice.utf16[1] - slice.utf16[0], `${name} UTF-16 length`);
}
const manifest = readFileSync(reference.manifest, "utf8");
assert.ok(manifest.includes(reference.artifact.sha256), "retained renderer hash exists in manifest");
const entry = reference.slices["UDo-turn-entry"].text;
const turn = reference.slices["MDo-turn-renderer"].text;
assert.ok(entry.includes('const a=i===r.totalTurns-1'));
assert.ok(entry.includes('c=a&&["working","needs_input","planning","needs_plan_response","needs_user_input","needs_user_permission"].includes'));
assert.ok(entry.includes("isNotComplete:u"));
assert.ok(turn.includes('isNotComplete:a'));
assert.ok(turn.includes('us("garry_mode")'));
assert.ok(turn.includes("z=!g&&!a&&k.some(FDo)"));
assert.ok(turn.includes("if(!G)return de(ye.collapsedMessages);"));
assert.ok(turn.includes("p.jsx(PDo,{summary:ye.summary,isExpanded:xe,onToggle:()=>J(ye.summary)})"));
const workspace = readFileSync("src/components/WorkspaceView.tsx", "utf8");
assert.match(workspace, /const garryMode = useAppPrefs\(\)\.garry_mode/);
assert.match(workspace, /dontCollapseToolCalls=\{garryMode\}/);
console.log(JSON.stringify({
  base,
  sourceBeforeSha256: hash(before),
  sourceAfterSha256: hash(after),
  changedStatements: changed,
  adjacentStatements: "byte-identical, including footer, toolbar, retry, sign-in, Part and SummaryRow",
  reference: "5 retained static slices have matching SHA-256 and UTF-8/UTF-16 lengths; parent verified full-artifact slice offsets",
  reachability: "last active turn/status -> isNotComplete; garry_mode -> dontCollapseToolCalls; !G bypasses PDo",
  limitations: "static Conductor source and OpenConductor SSR only; no mounted/browser/native/build verification",
}, null, 2));
