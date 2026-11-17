import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import ts from "typescript";

const dir = "evidence/composer/create-failure-draft";
const read = (path) => readFileSync(path, "utf8");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const qualification = JSON.parse(read(`${dir}/qualification.json`));
for (const span of qualification.spans) {
  const bytes = readFileSync(`${dir}/${span.path}`);
  assert.equal(bytes.length, span.bytes, span.name);
  assert.equal(hash(bytes), span.sha256, span.name);
}
assert.equal(qualification.spans.length, 15);
assert.equal(Object.keys(qualification.checks).length, 26);
assert.ok(Object.values(qualification.checks).every(Boolean));
for (const identity of qualification.identities) {
  const baseline = execFileSync("git", ["show", `${qualification.main}:${identity.file}`]);
  assert.equal(hash(baseline), identity.sha256, identity.file);
}
const fixturePath = "src/components/createWorkspaceFailureDraft.test.ts";
const v1 = read(`${dir}/history/frozen-v1.test.ts.txt`);
const current = read(fixturePath);
assert.equal(hash(v1), "66edcc8e10791bd49ff18fd9d0bafb6df48d22308715f1b50cbabf269ea72eba");
const expectedV2 = v1
  .replace('return { invoke: forbidden };', 'return { invoke: forbidden, isTauri: () => false };')
  .replace('"app-warning.ts").make;', '"app-warning.ts", { copyText: load("src/features/openIn/apps.ts").copyText }).make;');
assert.equal(current, expectedV2, "Only the two approved loader ports differ from immutable v1");
assert.equal(hash(current), "ba7a7f14799ecf0602d1235bf1cc11fe613e62625b82171f0e479ba0f00ecf5f");
function scenarios(text) {
  const ast = ts.createSourceFile("fixture.ts", text, ts.ScriptTarget.Latest, true);
  return ast.statements.filter((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "test").map((node) => node.getText(ast));
}
const beforeTests = scenarios(v1), afterTests = scenarios(current);
assert.equal(beforeTests.length, 8);
assert.deepEqual(afterTests.slice(0, 8), beforeTests, "All eight original test/scenario/assertion/invocation bytes must remain identical");
const printer = ts.createPrinter({ removeComments: true });
function normalized(text) {
  const ast = ts.createSourceFile("fixture.ts", text, ts.ScriptTarget.Latest, true);
  return printer.printFile(ast);
}
assert.deepEqual(afterTests.slice(0, 8).map(normalized), beforeTests.map(normalized), "All eight original test ASTs remain identical");
const baseComposer = gunzipSync(readFileSync(`${dir}/history/CreateWorkspaceComposer.baseline.tsx.gz`)).toString();
const baseApp = gunzipSync(readFileSync(`${dir}/history/App.baseline.tsx.gz`)).toString();
for (const [file, text] of [["src/components/CreateWorkspaceComposer.tsx", baseComposer], ["src/App.tsx", baseApp]]) {
  assert.equal(text, execFileSync("git", ["show", `${qualification.main}:${file}`], { encoding: "utf8" }));
}
const expectedComposer = baseComposer
  .replace("Persistent launch errors and non-fatal workspace creation issues.", "Persistent launch errors; detached creation failures can recover their submitted prompt.")
  .replace("onWarning: (message: string) => void;", "onWarning: (message: string, recovery?: { prompt: string }) => void;")
  .replace("    if (busy || pendingFiles.current > 0 || !repo || !canCreateIn(sectionsRef.current, sectionId)) return;\n", "    if (busy || pendingFiles.current > 0 || !repo || !canCreateIn(sectionsRef.current, sectionId)) return;\n    const submittedPrompt = draft.firstMessage;\n")
  .replace("if (dismissedAtLaunch) onWarning(message);", "if (dismissedAtLaunch) onWarning(message, submittedPrompt ? { prompt: submittedPrompt } : undefined);");
assert.equal(read("src/components/CreateWorkspaceComposer.tsx"), expectedComposer, "Exact four permitted producer changes only");
function withoutWarnings(text) {
  const ast = ts.createSourceFile("App.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const ranges = [];
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === "onWarning") ranges.push([node.initializer.getStart(ast), node.initializer.end]);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(ranges.length, 2);
  for (const [start, end] of ranges.reverse()) text = `${text.slice(0, start)}{WARNING_CALLBACK}${text.slice(end)}`;
  return text;
}
assert.equal(withoutWarnings(read("src/App.tsx").replace('import { copyText } from "./features/openIn/apps.ts";\n', "")), withoutWarnings(baseApp), "Only two App warning callback bodies and one adapter import changed");
const unchanged = qualification.identities.filter(({ file }) => !["src/App.tsx", "src/components/CreateWorkspaceComposer.tsx"].includes(file));
for (const identity of unchanged) assert.equal(hash(readFileSync(identity.file)), identity.sha256, `Read-only control ${identity.file}`);
const adapter = execFileSync("git", ["show", `${qualification.main}:src/features/openIn/apps.ts`]);
assert.equal(hash(readFileSync("src/features/openIn/apps.ts")), hash(adapter), "Existing clipboard adapter remains read-only");
for (const [name, passed, failed] of [["baseline-v1.tap", 6, 2], ["baseline-v2.tap", 6, 2], ["green.tap", 8, 0], ["adjacent-147.tap", 147, 0], ["clipboard-controls.tap", 8, 0]]) {
  const tap = read(`${dir}/${name}`);
  assert.match(tap, new RegExp(`^# pass ${passed}$`, "m"), name);
  assert.match(tap, new RegExp(`^# fail ${failed}$`, "m"), name);
  assert.match(tap, /^# skipped 0$/m, name);
  assert.match(tap, /^# cancelled 0$/m, name);
}
const result = { pass: true, candidate: qualification.candidate, main: qualification.main, spans: 15, joins: 26, identities: qualification.identities.length, unchangedControlIdentities: unchanged.length, frozenV1: hash(v1), fixture: hash(current), originalScenarioBytesAndAstIdentical: 8, exactLoaderOnlyPorts: 2, supplementalClipboardControls: 8, exactAppCallbacks: 2, exactProducerChangesOnly: true, clipboardAdapterUnchanged: true, limits: ["No browser/native runtime or real clipboard", "Full App and TipTap/DOM engine not mounted", "Full typecheck/build not run under source-only admission", "Package inclusion and native acceptance unverified"] };
writeFileSync(`${dir}/verification.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
