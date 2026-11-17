import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import ts from "typescript";

// Parse and compare the retained vendor source as inert data; never evaluate it.
const dir = "evidence/chat/composer/paste-lifetime";
const qualification = JSON.parse(readFileSync(`${dir}/qualification/qualification.json`, "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const get = name => readFileSync(`${dir}/reference/renderer-${name}.txt`, "utf8");
const baseline = file => execFileSync("git", ["show", `${qualification.baseline}:${file}`]);
const fixture = "src/features/chat/composerPasteLifetime.test.ts";
assert.equal(hash(readFileSync(fixture)), qualification.fixture.sha256, "unchanged seven-case fixture");
assert.equal(qualification.fixture.sha256, "fd1a42f871d8324250ba1ae886cd772bd74ce4c7c5ca66eedd419336ea93b301");
assert.equal(qualification.spans.length, 9);
for (const span of qualification.spans) {
  const bytes = readFileSync(path.join(dir, span.file));
  assert.equal(bytes.length, span.bytes, `${span.name} bytes`);
  assert.equal(hash(bytes), span.sha256, `${span.name} hash`);
  const text = bytes.toString("utf8");
  const expression = span.name === "t4o" || span.name === "ITo";
  const ast = ts.createSourceFile(`${span.name}.js`, expression ? `const ${text}` : text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
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

const bindings = {
  composerCapturesEditor: get("ITo").includes("[B,F]=$.useState(null)") && get("ITo").includes("E5=$.useCallback(ln=>{F(ln)},[])"),
  composerPassesEditorToPaste: get("ITo").includes("DNi({autoConvertLongText:$1,compressPastedDirectories:!fo,editor:B,attachFiles:M6"),
  composerInstallsCapture: get("ITo").includes("onPasteCapture:bi,onKeyDownCapture:yo"),
  composerReadyCallback: get("ITo").includes("onEditorReady:E5"),
  hookCallsAsyncHandler: get("DNi").includes("bwo({event:g,editor:n}).fireAndForget()"),
  shortcutAndRepeatGate: get("bwo").includes('Qh("chat.composer.pasteFilePaths",t.nativeEvent)') && get("bwo").includes("t.nativeEvent.repeat"),
  delayedProducer: get("bwo").includes("const n=await aRt()??await vwo()"),
  destroyedGuardAtInsertion: get("bwo").includes("e.isDestroyed||XQ({view:e.view,text:n})"),
  textInsertionMutatesSelection: get("XQ").includes("r.replaceSelection(a)") && get("XQ").includes("t.dispatch("),
  editorReadyRegistration: get("lHt").includes("ue&&g(ue)"),
  editorCreatedByManagedHook: get("lHt").includes("ue=n4o("),
  hookRegistersLifetime: get("n4o").includes("new t4o(n)") && get("n4o").includes("$.useEffect(i.onRender(e))"),
  ownerCleanupSchedulesDestroy: get("t4o").includes("this.isComponentMounted=!1,this.scheduleDestroy()"),
  scheduledDestroyChecksLifetime: get("t4o").includes("this.isComponentMounted") && get("t4o").includes("!n.isDestroyed&&(n.destroy()"),
  currentEditorDetachesThenDestroys: readFileSync("src/features/chat/ComposerEditor.tsx", "utf8").includes("Object.assign(current.current.inputRef, { current: null });\n      editor.destroy();"),
};
assert.deepEqual(bindings, qualification.bindings);
for (const file of qualification.currentFiles) {
  assert.equal(hash(baseline(file.path)), file.sha256, `${file.path} frozen baseline`);
  if (!file.path.endsWith("/Composer.tsx")) {
    assert.equal(hash(readFileSync(file.path)), file.sha256, `${file.path} read-only boundary`);
  }
}
const composer = "src/features/chat/Composer.tsx";
const before = baseline(composer).toString("utf8");
const oldGuard = "      void readClipboardTextFromPlatform().then((text) => {\n        if (!text) return;";
const newGuard = "      void readClipboardTextFromPlatform().then((text) => {\n        if (!text || inputRef.current !== box) return;";
assert.equal(before.split(oldGuard).length, 2, "unique callback treatment");
assert.equal(readFileSync(composer, "utf8"), before.replace(oldGuard, newGuard), "only the leased callback changes");
const changed = execFileSync("git", ["diff", "--name-only", qualification.baseline, "--"], { encoding: "utf8" }).trim().split("\n");
for (const file of changed) {
  assert.ok(file === composer || file === fixture || file.startsWith(`${dir}/`), `lease boundary: ${file}`);
}
for (const [file, passed, failed] of [["baseline.tap.gz", 6, 1], ["green.tap", 7, 0], ["adjacent.tap", 124, 0]]) {
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
    const bytes = readFileSync(path.join(dir, span.file));
    assert.deepEqual(parent.subarray(...span.utf8), bytes, `${span.name} exact parent UTF8 range`);
    assert.equal(source.slice(...span.utf16), bytes.toString("utf8"), `${span.name} exact parent UTF16 range`);
  }
  parentRanges = "PASS (all nine exact UTF8/UTF16 ranges in the complete retained parent)";
}
console.log(JSON.stringify({ pass: true, baseline: qualification.baseline, declarations: 9, bindings: Object.keys(bindings).length, fixtureSha256: hash(readFileSync(fixture)), treatedComposerSha256: hash(readFileSync(composer)), parentRanges, leaseFiles: changed.length }, null, 2));
