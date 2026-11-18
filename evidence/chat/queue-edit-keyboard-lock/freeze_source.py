"""Freeze source-only preparation; never imports/evaluates JavaScript or starts runtime."""
from pathlib import Path
import datetime, hashlib, json, re, subprocess
from html.parser import HTMLParser
D=Path('.qa/queue-edit-keyboard-lock-135')
sha=lambda b: hashlib.sha256(b).hexdigest()
r=json.loads((D/'qualification.json').read_text())
f=(D/'composerQueueEditKeyboardLock.test.ts').read_text()
o=json.loads((D/'oracle-frozen.json').read_text())
checks=[]
def check(name, ok):
    if not ok: raise AssertionError(name)
    checks.append(name)
check('Oracle contains 26 unique cases', len(o['cases'])==26 and len({x['name'] for x in o['cases']})==26)
check('Oracle draft and frozen oracle remain identical', (D/'oracle-draft.json').read_bytes()==(D/'oracle-frozen.json').read_bytes())
check('Eight default target keys frozen', 'const rowKeys = ["e", "Backspace", "Enter", "ArrowDown", "ArrowUp", "Home", "End", "Escape"] as const;' in f)
check('Three configured target commands frozen', 'const queueCommands = ["chat.queue.editMessage", "chat.queue.deleteMessage", "chat.queue.steerMessage"] as const;' in f)
check('All targets enter actual edit through shared ordinary setup', f.count('const before = ordinaryEditThenFocusB(view);')==3 and 'view.enter("q1"); // actual rendered Edit button -> actual actionStep -> actual beginEdit' in f)
check('Fixture does not synthesize target editingId or call beginEdit directly', 'editingId: "q1"' not in f and 'queue.beginEdit(' not in f)
check('Queued editor onBlur is observed through actual supplied prop', 'editors[0]?.props.onBlur();' in f)
check('Focusable B must actually be rendered', 'assert.equal(row.props.tabIndex, 0' in f and 'renderer.root.findByProps({ "data-id": id })' in f)
check('Ordinary focus B must retain A before target key', 'ordinary focus B must not cancel/finish A' in f and 'ordinary focus B must retain unsaved A draft' in f)
check('Commands call actual mounted row handler', 'act(() => row.props.onKeyDown({' in f)
check('No-edit controls use identical row key path', 'test(`control/no-edit/${key}`' in f and 'view.rowKey("q2", key), handled' in f)
check('IME, child and unknown controls retained', all(x in f for x in ['IME event ignored','child-target event ignored','unknown key ignored']))
check('Editor Cancel Save Save-and-steer use actual editor key callback', 'actual edit-editor keyboard callback stays enabled' in f and '["Cancel", "Escape", false], ["Save", "Enter", false], ["Save-and-steer", "Enter", true]' in f)
check('Remount control cannot assume target parity', 'control/session remount has no leaked edit lock' in f and 'view.switchSession(seed());' in f)
check('No vendor source evaluation in fixture', not any(x in f for x in ['GTo.txt','JNi.txt','renderApp-D_fmY7hW.js']))
check('Only actual complete product module is transpiled if later admitted', 'readFileSync(path, "utf8")' in f and 'ts.transpileModule(source,' in f and 'runInNewContext(javascript.outputText,' in f)
check('Each oracle case remains NOT_RUN', all(x.get('status')=='NOT_RUN' for x in o['cases']))
check('Source bound to actual merged main', r['checked_default_main']=='8f0f8707a529e17937cd8e9447b8b769b6bc5e21' and o['source_main']==r['checked_default_main'])
check('Tracked working and index trees remain unchanged', subprocess.run(['git','diff','--quiet']).returncode==0 and subprocess.run(['git','diff','--cached','--quiet']).returncode==0)
regressions=['composerQueueSingletonDrag.test.ts','composerQueueEditReturnFocus.test.ts','composerQueueFocus.test.ts','composerQueueEditEmptySave.test.ts','composerQueueCollapseShrink.test.ts','queue.test.ts','queueKeys.test.ts']
for name in regressions:
    p='src/features/chat/'+name
    b=subprocess.check_output(['git','-c','gc.auto=0','show',r['checked_default_main']+':'+p])
    check('Frozen published regression bytes: '+name, Path(p).read_bytes()==b)
rows=[]
for p in sorted(D.rglob('*')):
    if p.is_file() and p.suffix not in ['.html'] and p.name not in ['manifest.json','freeze-receipt.json']:
        b=p.read_bytes(); rows.append({'path':p.relative_to(D).as_posix(),'bytes':len(b),'sha256':sha(b)})
manifest=(json.dumps(rows,indent=2)+'\n').encode(); (D/'manifest.json').write_bytes(manifest)
receipt={'candidate':r['candidate'],'state':'FROZEN_SOURCE_ONLY_NOT_EXECUTED','source_main':r['checked_default_main'],'frozen_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_checks':r['checks_passed'],'static_freeze_checks':len(checks),'checks':checks,'fixture_sha256':sha((D/'composerQueueEditKeyboardLock.test.ts').read_bytes()),'oracle_sha256':sha((D/'oracle-frozen.json').read_bytes()),'manifest_sha256':sha(manifest),'expected_cases':26,'predicted_targets':11,'predicted_controls':15,'runtime_request_created':False,'node_or_js_executed':False,'product_edits':False,'native_dispatch':False,'limits':['Predictions are not semantic RED.','Editor blur and row focus adapters do not prove physical Tab or native keyboard handling.','No product treatment, callback/buttons/drag/tabIndex/reorder change, test execution, dependency install, build, preview, package or provider operation.','#1480 package/native inclusion remains with existing Root→sole E1 release owner, blocked; no retry.']}
(D/'freeze-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
# Preserve the existing page and its historical evidence; update only the latest section.
p=(D/'page-before-1480-merge.html').read_text(); start=p.index('<body>')+len('<body>'); end=p.index('</section>',start)+len('</section>')
section='''<section id="r59-merged-singleton-keyboard-source" style="padding-bottom:24px;border-bottom:1px solid var(--border)">
<h1>Singleton fix merged; next keyboard-lock candidate is source-qualified only</h1>
<p class="muted">r59 · Conductor Rebuild · Reason Cloud source-only checks · 18 November 2026</p>
<p><a href="https://github.com/reason-machines/openconductor/pull/1480">PR #1480</a> merged into main as <code>8f0f8707a529</code> at 00:32:42Z. Both executed exact-head jobs passed: Frontend typecheck + build and Evidence tools compile. Five conditional jobs were skipped, not passed. Existing baseline evidence remains six rendered-eligibility failures / fourteen controls, then identical GREEN20 and permanent-plus-adjacent 175/175. Those checks were not rerun on this turn.</p>
<h2>Release is not verified</h2>
<p>Packaged-app inclusion, physical drag, disabled-callback suppression and native visual parity remain <strong>unverified</strong>. Root explicitly retained this exact merge and its behavior retest in the existing sole E1 release-verification backlog; no duplicate runtime, native retry or release watcher was started.</p>
<h2>Ordinary edit A → focus B route is closed in source</h2>
<p><strong>81 source checks passed</strong> on fresh normal-read main <code>8f0f8707a529e17937cd8e9447b8b769b6bc5e21</code>. The retained real-app REA producer-to-consumer chain <code>JNi → AAo → GTo → DTo</code> globally returns from row keyboard handling while a queued edit exists. Current main still allows nonediting row handlers to resolve and consume keys during that edit.</p>
<p>The actual visible Edit button dispatches through the real reducer; edit A owns its local unsaved draft. Its queued-editor blur callback is a no-op, the shared editor delegates blur without saving/cancelling, and row B stays rendered with <code>tabIndex=0</code>. Neither the list nor display row adds a focus/blur edit transition. This closes ordinary source reachability without injecting an editing prop; runtime and physical reachability remain untested.</p>
<h2>Frozen oracle-first 26-case preparation, not a test result</h2>
<p>Eleven target cases cover default row commands/navigation and configured shortcuts after ordinary Edit A → unsaved draft → blur/focus B. Fifteen controls cover no-edit behavior, child/IME/unknown events, editor Cancel/Save/Save-and-steer and a clean session remount. <strong>No fixture case has run.</strong> The private inert fixture uses the complete actual Composer and actual queue reducers, with explicit editor/DOM focus ports. All seven published queue regression files (175 cases previously passed) remain byte-identical.</p>
<p>Fixture <code>FIXTURE</code><br>Oracle <code>ORACLE</code></p>
<p>No product edits, commits, new PR, runtime request, Node/JS execution, install, build, browser/native/provider work or shared cleanup occurred. The source candidate is not semantic RED and does not justify changing buttons, drag, editor Save/Cancel, row tab order, ordering or async policy. Existing REA graph-cap/no-match/ambiguous-receiver/range-helper/corrected-binding limitations remain unchanged; no new REA operation was attempted.</p>
</section>'''.replace('FIXTURE',receipt['fixture_sha256']).replace('ORACLE',receipt['oracle_sha256'])
class Parser(HTMLParser): pass
Parser().feed(section)
check('Latest page section has balanced section marker and no runtime script', section.count('<section')==section.count('</section>')==1 and '<script' not in section)
(D/'composer-source-audit.html').write_text(p[:start]+section+p[end:])
print(json.dumps({k:receipt[k] for k in ['state','source_main','source_checks','static_freeze_checks','fixture_sha256','oracle_sha256','manifest_sha256','expected_cases','runtime_request_created','node_or_js_executed']},indent=2))
