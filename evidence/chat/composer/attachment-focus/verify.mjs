import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import ts from "typescript";

// Vendor source is parsed and compared as inert data, never evaluated.
const dir = "evidence/chat/composer/attachment-focus";
const base = "2ada6e3e186391695cae1ce5694ac251a6323079";
const qualification = JSON.parse(readFileSync(`${dir}/qualification/qualification.json`, "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const get = name => readFileSync(`${dir}/reference/renderer-${name}.txt`, "utf8");
const at = (ref, file) => execFileSync("git", ["show", `${ref}:${file}`]);
const fixture = "src/features/chat/composerAttachmentFocus.test.ts";
const workspace = "src/components/WorkspaceView.tsx";
const settlement = "src/features/chat/composerAttachmentSettlement.test.ts";
assert.equal(hash(readFileSync(`${dir}/qualification/qualified-input.tar.gz`)), "b70b7a0a3f9a42eba05ea5d638c7ed1a0c7c387351821b8266a9dd6af0f1d4d4");
assert.equal(qualification.fixture.sha256, "abd563456f9d1013f73f82fdf370d4efade85a689bbeb12318cbc1f738b44c56");
assert.equal(hash(readFileSync(fixture)), qualification.fixture.sha256, "unchanged eight-case fixture");
assert.equal(qualification.spans.length, 9);
for (const span of qualification.spans) {
  const bytes = readFileSync(`${dir}/${span.file}`);
  assert.equal(bytes.length, span.bytes, `${span.name} bytes`);
  assert.equal(hash(bytes), span.sha256, `${span.name} hash`);
  const expression = span.kind !== "function";
  const ast = ts.createSourceFile(`${span.name}.js`, `${expression ? "const " : ""}${bytes.toString("utf8")}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, `${span.name} complete syntax`);
  assert.equal(ast.statements.length, 1, `${span.name} one complete declaration`);
  if (expression) {
    const declaration = ast.statements[0].declarationList.declarations[0];
    assert.equal(declaration.name.text, span.name);
    if (span.name === "t4o") assert.ok(ts.isClassExpression(declaration.initializer));
  } else {
    assert.ok(ts.isFunctionDeclaration(ast.statements[0]));
    assert.equal(ast.statements[0].name.text, span.name);
  }
}
const ours = at(qualification.baseline, workspace).toString("utf8");
const composer = at(qualification.baseline, "src/features/chat/Composer.tsx").toString("utf8");
const session = at(qualification.baseline, "src/features/chat/composerSession.ts").toString("utf8");
const bindings = {
  originalHasCapturedEditorState: get("ITo").includes("[B,F]=$.useState(null)"),
  originalEditorReadyToState: get("ITo").includes("E5=$.useCallback(ln=>{F(ln)},[])") && get("ITo").includes("onEditorReady:E5"),
  originalLiveFocusGate: get("ITo").includes("de=$.useCallback(()=>{B?.isDestroyed||B?.commands.focus()},[B])"),
  originalPickerToMutationToFocus: get("ITo").includes('W9=async()=>{if(c==="all")return;const ln=await PNi();ln.length!==0&&(await n0(ln),de())}'),
  originalButtonUsesActualPicker: get("ITo").includes("onAddAttachment:()=>W9().fireAndForget()"),
  originalShortcutUsesSamePicker: get("ITo").includes('oi("chat.addAttachment",()=>{W9().fireAndForget()})'),
  originalMutationHookBound: get("ITo").includes("wd=IIr(") && get("ITo").includes("{mutateAsync:n0}=wd"),
  originalPickerMultipleAndEmpty: get("PNi").includes("await t.pickFiles({multiple:!0})") && get("PNi").includes("??[]"),
  originalMutationConvertsInput: get("IIr").includes("await RPt(u)") && get("IIr").includes("IPt({inputs:d,agentType:o})"),
  originalLocalMutationDoesNotAwaitProcessing: get("IIr").includes("return Yoi({localWorkspaceId:r,sessionId:i,filesToWrite:m,onAttachmentPathsReserved:a,onAttachmentPathsFailed:c}),Promise.resolve()"),
  originalManagedEditor: get("lHt").includes("ue=n4o(") && get("lHt").includes("ue&&g(ue)"),
  originalLifetimeCleanup: get("n4o").includes("$.useEffect(i.onRender(e))") && get("t4o").includes("this.isComponentMounted=!1,this.scheduleDestroy()") && get("t4o").includes("!n.isDestroyed&&(n.destroy()"),
  actualOnAttachBinding: ours.includes("onAttachFiles={(files) => void attachFiles(files)}"),
  actualComposerRejectsEmptyInput: composer.includes("if (!onAttachFiles || files.length === 0) return false;") && composer.includes("onAttachFiles(files);"),
  actualParentAwait: ours.includes("async function attachFiles(files: File[]) {\n    await session.attach(files,"),
  actualSessionPreservesReadError: session.includes("Failed to attach ${file.name}:") && session.includes("} finally {\n      this.pendingFiles--;"),
  actualEditorDetachesThenDestroys: readFileSync("src/features/chat/ComposerEditor.tsx", "utf8").includes("Object.assign(current.current.inputRef, { current: null });\n      editor.destroy();"),
};
assert.deepEqual(bindings, qualification.bindings);
for (const file of qualification.currentFiles) {
  assert.equal(hash(at(qualification.baseline, file.path)), file.sha256, `${file.path} qualification baseline`);
  if (file.path === workspace) assert.equal(hash(at(base, file.path)), file.sha256, "fresh-main callback unchanged");
  else assert.deepEqual(readFileSync(file.path), at(base, file.path), `${file.path} read-only fresh-main boundary`);
}
const before = at(base, workspace).toString("utf8");
const oldCallback = "  async function attachFiles(files: File[]) {\n    await session.attach(files, reason ? (relativePath, data) => draftAttachmentsApi.write({ draftWorkspaceId: workspace.id, relativePath, data }) : undefined);\n  }";
const newCallback = "  async function attachFiles(files: File[]) {\n    const box = inputRef.current;\n    await session.attach(files, reason ? (relativePath, data) => draftAttachmentsApi.write({ draftWorkspaceId: workspace.id, relativePath, data }) : undefined);\n    if (files.length > 0 && inputRef.current === box) box?.focus();\n  }";
assert.equal(before.split(oldCallback).length, 2, "unique leased callback");
assert.equal(readFileSync(workspace, "utf8"), before.replace(oldCallback, newCallback), "only the leased two-line callback treatment");
const oldPort = "    return evaluate<Callbacks>(callbacksSource, `{ attachFiles, removeAttachment, onSubmit, onCommand: (${commandSource}) }`, {\n      session,\n      chatId,";
const newPort = "    return evaluate<Callbacks>(callbacksSource, `{ attachFiles, removeAttachment, onSubmit, onCommand: (${commandSource}) }`, {\n      session,\n      inputRef: { current: null },\n      chatId,";
const settlementBefore = at(base, settlement).toString("utf8");
assert.equal(settlementBefore.split(oldPort).length, 2, "unique adjacent callback port");
assert.equal(readFileSync(settlement, "utf8"), settlementBefore.replace(oldPort, newPort), "only inert inputRef port; all existing tests/assertions byte-unchanged");
const changed = execFileSync("git", ["diff", "--name-only", base, "--"], { encoding: "utf8" }).trim().split("\n");
for (const file of changed) assert.ok(file === workspace || file === settlement || file === fixture || file.startsWith(`${dir}/`), `lease boundary: ${file}`);
for (const [file, passed, failed] of [["baseline.tap.gz", 7, 1], ["green.tap", 8, 0], ["adjacent.tap", 131, 0]]) {
  const bytes = readFileSync(`${dir}/${file}`);
  const tap = (file.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8");
  assert.match(tap, new RegExp(`^# pass ${passed}$`, "m"));
  assert.match(tap, new RegExp(`^# fail ${failed}$`, "m"));
  assert.match(tap, /^# skipped 0$/m);
  assert.match(tap, /^# cancelled 0$/m);
}
let parentRanges = "NOT_RUN (retained parent not supplied; qualification owner retains full-parent proof)";
if (process.argv[2]) {
  const parent = readFileSync(process.argv[2]);
  assert.equal(parent.length, qualification.parent.bytes);
  assert.equal(hash(parent), qualification.parent.sha256);
  const source = parent.toString("utf8");
  for (const span of qualification.spans) {
    const bytes = readFileSync(`${dir}/${span.file}`);
    assert.deepEqual(parent.subarray(...span.utf8), bytes, `${span.name} exact parent UTF8 range`);
    assert.equal(source.slice(...span.utf16), bytes.toString("utf8"), `${span.name} exact parent UTF16 range`);
  }
  parentRanges = "PASS (all nine exact UTF8/UTF16 ranges in complete retained parent)";
}
console.log(JSON.stringify({ pass: true, base, qualificationBaseline: qualification.baseline, declarations: 9, bindings: Object.keys(bindings).length, fixtureSha256: hash(readFileSync(fixture)), parentRanges, unchangedAdjacentAssertions: true, leaseFiles: changed.length }, null, 2));
