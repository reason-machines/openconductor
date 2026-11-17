import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import ts from 'typescript';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../../..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'qualification.json'), 'utf8'));
const parentPath = process.argv[2];
const parent = parentPath ? fs.readFileSync(parentPath) : null;
if (parent) { assert.equal(parent.length, metadata.parent.bytes); assert.equal(hash(parent), metadata.parent.sha256); }
const declarations = {};
for (const span of metadata.spans) {
  const bytes = fs.readFileSync(path.join(dir, span.file)), text = bytes.toString('utf8');
  assert.equal(hash(bytes), span.sha256, span.name); assert.equal(bytes.length, span.bytes);
  const ast = ts.createSourceFile(span.name + '.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, span.name);
  assert.equal(ast.statements.length, 1, span.name);
  if (span.kind === 'function') assert.ok(ts.isFunctionDeclaration(ast.statements[0]) && ast.statements[0].name?.text === span.name);
  if (parent) {
    assert.ok(parent.subarray(...span.utf8).equals(bytes), span.name + ' parent UTF8');
    assert.equal(parent.toString('utf8').slice(...span.utf16), text, span.name + ' parent UTF16');
  }
  declarations[span.name] = text;
}
const alias = declarations['pEe-alias'];
const current = gunzipSync(fs.readFileSync(path.join(dir, 'history/CreateWorkspaceComposer.tsx.gz'))).toString('utf8');
const editor = fs.readFileSync(path.join(root, 'src/features/chat/ComposerEditor.tsx'), 'utf8');
const dialog = fs.readFileSync(path.join(root, 'src/components/CreateWorkspaceDialog.tsx'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/components/CreateWorkspacePage.tsx'), 'utf8');
const checks = {
  localRepoListIsReactive: declarations.oya.includes('{data:R,isLoading:O}=bv()') && declarations.oya.includes('L=E?[]:k1e(P)'),
  requestedRepoInitialState: declarations.K4a.includes('repositoryId:n??jzt(Ku.getState(),o)'),
  repoAvailabilityFeedsSelection: declarations.K4a.includes('availableRepoIds:i,requestedRepositoryId:n'),
  localTargetMembership: declarations.oya.includes('Dt=X!==void 0&&B.some(Br=>Br.id===X)') && declarations.oya.includes('Fl=Wt||!Dt?void 0:X'),
  targetForwardedIntoCreate: declarations.oya.includes('p.jsx(Hji,{repositoryId:Fl') && declarations.oya.includes('eyebrowVariant:id'),
  localTargetBoolean: declarations.Hji.includes('ct=F!==void 0,Pt=e!==void 0||i!==void 0||ct'),
  focusHookCalled: declarations.Hji.includes('dQo({editor:de,hasLaunchTarget:Pt})'),
  actualEditorRegistered: declarations.Hji.includes('Dt=$.useCallback(Br=>{ue(Br)},[])') && declarations.Hji.includes('onEditorReady:Dt'),
  hookInitiallyWaitsOnlyIfNoTarget: declarations.dQo.includes('r=()=>!i') && declarations.dQo.includes('$.useState(r)'),
  oneShotLiveEditorFocus: declarations.dQo.includes('if(!o)return;if(i&&n?.isDestroyed===!1){a(!1),n.commands.focus();return}'),
  tabCancelsOnly: declarations.dQo.includes('h=pEe(m=>{m.key==="Tab"&&d()})'),
  pointerCancelsAndCleans: declarations.dQo.includes('document.addEventListener("pointerdown",d)') && declarations.dQo.includes('document.removeEventListener("keydown",h),document.removeEventListener("pointerdown",d)'),
  keyCallbackIdentity: declarations.hEe === 'function hEe(t){return t}' && alias.includes('pEe=hEe'),
  sharedEditorReadyCallback: declarations.lHt.includes('onEditorReady:g') && declarations.lHt.includes('g(ue)'),
  sharedEditorAutoFocus: declarations.lHt.includes('autofocus:c?"end":!1') && declarations.Hji.includes('autoFocus:!0'),
  currentSelectsRepoWhenAvailable: current.includes('if (!draft.repoId && repos[0]) chooseRepo(repos[0].id);'),
  currentActualRepoMembership: current.includes('const repo = repos.find((r) => r.id === draft.repoId);'),
  currentExistingMountFocus: current.includes('useLayoutEffect(() => { composerInputRef.current?.focus(); }, []);'),
  currentLiveEditorHandle: editor.includes('focus: (position) => {') && editor.includes('editor.view.focus();'),
  currentCleanupDetachesHandle: editor.includes('Object.assign(current.current.inputRef, { current: null });\n      editor.destroy();'),
  bothCurrentSurfacesShareCreate: dialog.includes('<CreateWorkspaceComposer {...props} eyebrowVariant="attached"') && page.includes('<CreateWorkspaceComposer {...props} eyebrowVariant="floating"'),
};
for (const [name, passed] of Object.entries(checks)) assert.equal(passed, true, name);
const fixturePath = path.join(root, 'src/components/createWorkspaceTargetFocus.test.ts');
const fixture = fs.readFileSync(fixturePath, 'utf8');
const originalFixture = gunzipSync(fs.readFileSync(path.join(dir, 'history/fixture-v1.test.ts.gz'))).toString('utf8');
assert.equal(hash(originalFixture), metadata.fixture.sha256);
assert.equal(originalFixture.replace('import { dirname, resolve } from "node:path";', 'import { resolve } from "node:path";'), fixture, 'only unused fixture import changes; all assertions/scenarios are byte-preserved');
const legacy = fs.readFileSync(path.join(root, 'src/components/createWorkspaceLaunchClose.test.ts'), 'utf8');
const originalLegacy = gunzipSync(fs.readFileSync(path.join(dir, 'history/createWorkspaceLaunchClose.test.ts.gz'))).toString('utf8');
assert.equal(originalLegacy.replace('document: { activeElement: null }, HTMLElement: class {},', 'document: { activeElement: null, addEventListener() {}, removeEventListener() {} }, HTMLElement: class {},'), legacy, 'only the first inert document port changes; all legacy assertions are byte-preserved');
function invocations(source) {
  const calls = [];
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isCallExpression(node) && (/^test$|^assert(?:\.|$)/.test(node.expression.getText(ast)))) calls.push(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return calls;
}
assert.deepEqual(invocations(originalFixture), invocations(fixture), 'all eight test invocations and assertions remain AST/text-identical');
assert.deepEqual(invocations(originalLegacy), invocations(legacy), 'legacy scenario and assertion invocations remain AST/text-identical');
const treatment = fs.readFileSync(path.join(root, 'src/components/CreateWorkspaceComposer.tsx'), 'utf8');
const marker = '  const [waitingForTargetFocus, setWaitingForTargetFocus] = useState(!startRepo);';
const start = treatment.indexOf(marker), end = treatment.indexOf('  const prefix = useMemo', start);
assert.ok(start >= 0 && end > start);
assert.equal(treatment.slice(0, start) + treatment.slice(end), current, 'only the target focus block changes in production');
assert.equal(treatment.slice(start, end).split('\n').length - 1, 19);
assert.ok(treatment.slice(start, end).includes('if (!waitingForTargetFocus) return;'));
assert.ok(treatment.slice(start, end).includes('if (repo && editor) {\n      setWaitingForTargetFocus(false);\n      editor.focus();'));
assert.ok(treatment.slice(start, end).includes('if (event.key === "Tab") cancel();'));
assert.ok(treatment.slice(start, end).includes('document.removeEventListener("pointerdown", cancel);'));
for (const [name, pass, fail] of [['baseline.tap.gz', 6, 2], ['green.tap', 8, 0], ['baseline-v2.tap.gz', 6, 2], ['green-v2.tap', 8, 0], ['integrated-green.tap.gz', 147, 0]]) {
  const bytes = fs.readFileSync(path.join(dir, name));
  const text = name.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
  assert.ok(text.includes('# pass ' + pass + '\n') && text.includes('# fail ' + fail + '\n'), name);
  assert.ok(text.includes('# skipped 0\n') && text.includes('# cancelled 0\n'), name);
}
console.log(JSON.stringify({ pass: true, sourceSpans: metadata.spans.length, bindings: Object.keys(checks).length, wholeParent: !!parent, exactProductionFocusBlockLines: 19, frozenV1: hash(originalFixture), compatibleV2: hash(fixture), legacyPortOnly: true, fixtureTestAndAssertionInvocations: invocations(fixture).length, legacyTestAndAssertionInvocations: invocations(legacy).length }, null, 2));
