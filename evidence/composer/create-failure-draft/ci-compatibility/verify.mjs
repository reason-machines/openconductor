import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import ts from "typescript";

const dir = "evidence/composer/create-failure-draft/ci-compatibility";
const read = (path) => readFileSync(path, "utf8");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const baseline = "74c004a95d7b10072f54f71ca611f22c50944f64";
const port = '    "./features/openIn/apps.ts": { copyText: forbidden },\n';
const anchor = '    "./workspace/link": { copyWorkspaceLink: forbidden },\n';
const printer = ts.createPrinter({ removeComments: true });
function scenarios(source) {
  const ast = ts.createSourceFile("fixture.ts", source, ts.ScriptTarget.Latest, true);
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "test") {
      calls.push({ bytes: node.getText(ast), ast: printer.printNode(ts.EmitHint.Unspecified, node, ast) });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return calls;
}
const identities = [];
for (const name of ["createSection", "moveToSection"]) {
  const file = `src/palette/${name}.test.ts`;
  const original = gunzipSync(readFileSync(`${dir}/${name}.original.ts.gz`)).toString();
  const current = read(file);
  assert.equal(original, execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8" }), "Archived original is the unchanged baseline fixture");
  assert.equal(original.split(anchor).length, 2, "Exactly one shell dependency anchor");
  assert.equal(current, original.replace(anchor, anchor + port), "Only one fail-fast dependency port added");
  assert.deepEqual(scenarios(current), scenarios(original), "All original scenario/assertion/invocation bytes and ASTs remain identical");
  identities.push({ file, originalSha256: hash(original), treatmentSha256: hash(current), unchangedTestCalls: scenarios(original).length });
}
const before = read(`${dir}/before.tap`);
const failures = [...before.matchAll(/^not ok .*$/gm)];
const missingImports = [...before.matchAll(/^  error: 'Unexpected \.\.\/App\.tsx dependency: \.\/features\/openIn\/apps\.ts'$/gm)];
assert.equal(failures.length, 20);
assert.equal(missingImports.length, 20, "All reproduced failures stop at the same missing import");
const hosted = gunzipSync(readFileSync(`${dir}/hosted-failure.log.gz`)).toString();
assert.equal([...hosted.matchAll(/^\S+ not ok .*$/gm)].length, 20);
assert.equal([...hosted.matchAll(/error: 'Unexpected \.\.\/App\.tsx dependency: \.\/features\/openIn\/apps\.ts'/g)].length, 20);
for (const [file, total, pass, fail] of [["before.tap", 26, 6, 20], ["after.tap", 26, 26, 0], ["frozen-adjacent.tap", 155, 155, 0], ["clipboard-controls.tap", 8, 8, 0]]) {
  const tap = read(`${dir}/${file}`);
  for (const [key, value] of [["tests", total], ["pass", pass], ["fail", fail], ["cancelled", 0], ["skipped", 0]]) {
    assert.match(tap, new RegExp(`^# ${key} ${value}$`, "m"), `${file}: ${key}`);
  }
}
// CI correction must not alter the verified production tree or frozen regression.
for (const [file, sha256] of [
  ["src/App.tsx", "e92b6d4418579c64b45a7dc596c0f41bd866be74f59469a395b134d57163f7ab"],
  ["src/components/CreateWorkspaceComposer.tsx", "80ecfeea316b7817ddae789d36c4899ac3b620c645f3231b52906bc1b5095726"],
  ["src/components/createWorkspaceFailureDraft.test.ts", "ba7a7f14799ecf0602d1235bf1cc11fe613e62625b82171f0e479ba0f00ecf5f"],
]) {
  assert.equal(hash(readFileSync(file)), sha256, `${file} unchanged by CI correction`);
}
const result = {
  pass: true,
  failedHostedHead: "4e3768a61f0ef92acb6d9debcdcc98efa1cfc3c3",
  failedCheck: "https://github.com/reason-machines/openconductor/actions/runs/44137577952/job/134231257301",
  hostedFailures: 20,
  baseline: { tests: 26, pass: 6, fail: 20, missingImportFailures: 20 },
  treatment: { tests: 26, pass: 26, fail: 0 },
  frozenAndAdjacent: { tests: 155, pass: 155, fail: 0 },
  clipboardControls: { tests: 8, pass: 8, fail: 0 },
  exactFailFastPortsAdded: 2,
  productionAndFrozenFixtureUnchanged: true,
  identities,
  limits: ["No full local frontend pipeline, browser/native runtime or real clipboard", "Package/native acceptance unverified", "Hosted exact-head rerun reported separately"]
};
writeFileSync(`${dir}/verification.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
