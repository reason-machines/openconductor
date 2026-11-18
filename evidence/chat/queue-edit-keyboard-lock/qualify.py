"""Source-only qualification. Reads inert retained REA bytes; no JS execution."""
from pathlib import Path
import datetime, hashlib, json, subprocess

D = Path('.qa/queue-edit-keyboard-lock-135')
(D / 'reference').mkdir(exist_ok=True)
(D / 'main').mkdir(exist_ok=True)
sha = lambda b: hashlib.sha256(b).hexdigest()
def git(*args):
    return subprocess.check_output(['git', '-c', 'gc.auto=0', *args])
checks = []
def check(name, value):
    if not value:
        raise AssertionError(name)
    checks.append(name)

main = git('rev-parse', 'FETCH_HEAD').decode().strip()
remote_main = git('ls-remote', 'origin', 'refs/heads/main').decode().split()[0]
check('Normal remote-main read equals fetched source snapshot', main == remote_main)
renderer = Path('.qa/create-suggestions-135/retained/renderApp-D_fmY7hW.js').read_bytes()
check('Retained complete real-app renderer exact known identity', len(renderer) == 11600457 and sha(renderer) == '5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde')
manifest = json.loads(git('show', main + ':evidence/frontend/tauri-assets-manifest.json'))
entries = [x for x in manifest['entries'] if x['key'].endswith('/renderApp-D_fmY7hW.js')]
check('Current default-branch manifest binds this renderer', len(entries) == 1 and entries[0]['bytes'] == len(renderer) and entries[0]['sha256'] == sha(renderer))
old = json.loads(Path('evidence/chat/queue-collapse-shrink/reference/spans.json').read_text())
refs, spans = {}, []
for name in ['JNi', 'AAo', 'GTo', 'DTo']:
    row = next(x for x in old if x['name'] == name)
    lo, hi = row['utf8_half_open']
    b = renderer[lo:hi]
    check(name + ' retained complete declaration length/digest matches parent', len(b) == row['bytes'] and sha(b) == row['sha256'])
    check(name + ' retained declaration starts/ends at stated bounds', b.startswith(('function ' + name + '(').encode()) and b.endswith(b'}'))
    checked_in = Path('evidence/chat/queue-collapse-shrink/reference/' + name + '.txt').read_bytes()
    check(name + ' checked-in reference byte equality', checked_in == b)
    (D / 'reference' / (name + '.txt')).write_bytes(b)
    refs[name] = b.decode()
    spans.append(row)

binding_bytes = Path('evidence/chat/queue-singleton-drag/reference/corrected-binding.json').read_bytes()
binding = json.loads(binding_bytes)
sl = binding['corrected_slice']; lo, hi = sl['utf8_half_open']
check('Historical corrected REA analyzed slice matches original renderer', hi-lo == sl['bytes'] and sha(renderer[lo:hi]) == sl['sha256'])
check('Historical twenty REA coordinate joins retained without reinterpretation', len(sl['site_bindings']) == 20)
check('Both handler and DOM consumer lie inside analyzed REA slice', all(lo <= x['utf8_half_open'][0] < x['utf8_half_open'][1] <= hi for x in spans if x['name'] in ['GTo', 'DTo']))
(D / 'reference' / 'corrected-binding.json').write_bytes(binding_bytes)
(D / 'reference' / 'rea-queue-sites.json').write_bytes(Path('evidence/chat/queue-singleton-drag/reference/rea-queue-sites.json').read_bytes())
j, a, g, d = [refs[x] for x in ['JNi', 'AAo', 'GTo', 'DTo']]
check('Actual chat mounts AAo with active queued edit message id', 'p.jsx(AAo,{canSaveQueuedEdit:on,editingMessageId:he?.messageId' in j)
check('AAo receives editingMessageId as i', 'editingMessageId:i' in a)
check('AAo mounts actual GTo with same editingMessageId', 'p.jsx(GTo,{canCollapse:it,canSaveQueuedEdit:n,canSteer:P,editingMessageId:i' in a)
check('GTo receives active edit id as o and computes global Z', 'editingMessageId:o' in g and 'Z=o!==void 0' in g)
check('Actual list-key handler returns before row selection while any edit is active', 'We=Zt=>{if(Z||O.length===0)return;const zt=U??O[0].messageId' in g)
key_lo = g.index('We=Zt=>{if(Z||O.length===0)return;')
key_hi = g.index('const Ve=We;', key_lo)
handler = g[key_lo:key_hi]
for command in ['editMessage', 'deleteMessage', 'steerMessage']:
    check('Reference global edit guard precedes ' + command, ('Qh("chat.queue.' + command + '",Zt.nativeEvent)') in handler)
for key in ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape']:
    check('Reference global edit guard precedes navigation ' + key, ('case"' + key + '"') in handler)
check('GTo binds actual guarded handler into DTo onListKeyDown', 'const Ve=We;' in g and 'p.jsx(DTo,{' in g and 'onListKeyDown:Ve' in g)
check('DTo receives handler without replacement', 'onListKeyDown:d' in d)
check('DTo connects it to real focusable Queued messages listbox', '"aria-label":"Queued messages"' in d and 'role:"listbox"' in d and 'tabIndex:0,onFocus:u,onKeyDown:d' in d)

pins = []
for path in ['src/features/chat/Composer.tsx', 'src/features/chat/queue.ts', 'src/features/chat/queueKeys.ts', 'src/features/chat/composerQueueFocus.test.ts', 'src/features/chat/ComposerEditor.tsx', 'src/components/WorkspaceView.tsx', 'src/features/chat/chatRuntime.ts', 'src/keybindings/registry.ts']:
    b = git('show', main + ':' + path)
    (D / 'main' / Path(path).name).write_bytes(b)
    pins.append({'path': path, 'bytes': len(b), 'sha256': sha(b), 'git_blob': git('rev-parse', main + ':' + path).decode().strip()})
c, q, k, tests = [(D / 'main' / n).read_text() for n in ['Composer.tsx','queue.ts','queueKeys.ts','composerQueueFocus.test.ts']]
panel = c[c.index('function QueuePanel('):c.index('\ninterface RowProps {')]
keys = panel[panel.index('  function onRowKeyDown('):panel.index('  const drag = ')]
check('Current actual row-key handler ignores child/IME only', 'if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return;' in keys)
check('Current complete row-key handler has no active-edit check', 'editingId' not in keys)
check('Current actual row-key handler resolves real overridden shortcuts', 'keys(command).some((s) => matchesEvent(s, ev))' in keys)
check('Current actual row-key handler calls pure row resolver', 'queueRowKey(ids, id, navigationKey, hit, canSteer)' in keys)
for kind in ['edit', 'delete', 'steer']:
    check('Current handler dispatches resolved ' + kind, ('onQueue({ kind: "' + kind + '", id })') in keys)
check('Current handler consumes resolved row events', 'e.preventDefault();' in keys and 'e.stopPropagation();' in keys)
check('Current navigation reaches existing real focus port', 'case "focus":\n        return focus(r.focus);' in keys)
check('Current list remains mounted while editing if expanded', 'canCollapse && collapsed ? null' in panel and 'queue.items.map((m, i)' in panel)
check('Only matching row receives edit mode, other rows remain display rows', 'editing={queue.editingId === m.id}' in panel)
check('Actual row receives unguarded key callback', 'onKeyDown: (e: KeyboardEvent<HTMLLIElement>) => onRowKeyDown(e, m.id)' in panel)
check('Actual displayed li stays keyboard-focusable and receives row callback', 'data-id={id} tabIndex={0}' in c and 'aria-label={`Queued message: ${label}`} {...rowProps}' in c)
check('QueuePanel has no parent inert or disabled fieldset guard', 'inert' not in panel and '<fieldset' not in panel)
check('Pure resolver receives no active edit state', 'export function queueRowKey(ids: readonly string[], id: string, key: string, hit: (command: QueueCommand) => boolean, canSteer: boolean)' in k and 'editingId' not in k)
for kind in ['edit', 'delete', 'steer']:
    check('Pure resolver can return ' + kind, ('return { kind: "' + kind + '", id') in k)
check('Reducer edit replaces active id with any existing queue id', 'return q.items.some((m) => m.id === id) ? { ...q, editingId: id } : q;' in q)
check('Reducer delete removes target independently of another active edit', 'const items = q.items.filter((m) => m.id !== id);\n  const editingId = q.editingId === id ? null : q.editingId;' in q)
check('Reducer steer can emit steer effect with another edit still active', 'effects: [{ kind: "steer", ...snapshotUserPrompt(m)' in q)
check('Existing test harness drives actual component row key handlers', 'renderer.root.findByProps({ "data-id": id }).props.onKeyDown({' in tests)
check('Existing harness already supports active edit state', 'editingId: editing ? "first" : null' in tests)
check('Existing harness proves ignored child/IME but lacks active-edit row-key target', 'row navigation ignores a ${label} event' in tests and 'fixture({ editing: true' not in tests)
editor = (D / 'main' / 'ComposerEditor.tsx').read_text()
workspace = (D / 'main' / 'WorkspaceView.tsx').read_text()
runtime = (D / 'main' / 'chatRuntime.ts').read_text()
row = c[c.index('function QueueRow('):]
edit_branch = row[row.index('  if (editing) {'):row.index('  const label = text.trim()')]
list_markup = panel[panel.index('        <ol className="queue-list"'):]
check('Real-app edit producer calls beginQueuedMessageEdit', 'nc.beginQueuedMessageEdit({message:gr,sessionId:x,localWorkspaceId:n})' in j and 'const Hn=hn;' in j and 'onStartEdit:Hn' in j)
check('Reference actual list focus only selects a row', 'He=()=>{O.length!==0&&z(Zt=>Zt??O[0].messageId)}' in g and 'const it=He;' in g and 'onListFocus:it' in g)
check('Reference queue focus change binds visual focus state only', '[G,K]=$.useState(!1)' in g and 'onQueueFocusChange:K' in g)
check('Reference list focus forwards unchanged and blur only changes focus-within', 'onFocus:u,onKeyDown:d' in d and 'D.currentTarget.contains(P)||h?.(!1)' in d and 'k=()=>h?.(!0)' in d)
check('Current actual Edit button resets draft then dispatches edit id', 'setValue(queuedUserDraft({ text, userContent }));\n            onQueue({ kind: "edit", id });' in row)
check('Current beginEdit changes active id without removing any row', 'return q.items.some((m) => m.id === id) ? { ...q, editingId: id } : q;' in q)
check('Workspace actual Composer queue prop and action port remain bound', 'queue={queue}' in workspace and 'onQueue={(action) => agent.queueAction(runId, action)}' in workspace)
check('Reason runtime actual action port calls same queue reducer', 'queueAction(chatId, action) {\n      const c = chat(chatId);\n      setQueue(c, Q.actionStep(c.queue, action));' in runtime)
check('Current edited row keeps unsaved draft in row-local state', 'const [value, setValue] = useState(() => queuedUserDraft({ text, userContent }));' in row and 'onChange={setValue}' in edit_branch)
check('Current queued editor blur and focus callbacks cannot dispatch save or cancel', 'onFocus={() => {}}\n            onBlur={() => {}}' in edit_branch and 'onInteraction=' not in edit_branch)
check('Shared editor blur delegates only supplied callbacks, no implicit save/cancel', 'onBlur: () => { current.current.onBlur(); current.current.onInteraction?.(); }' in editor and 'cancelEdit' not in editor and 'saveEdit' not in editor)
check('Actual queue list and display rows add no focus or blur transition handler', 'onFocus' not in list_markup and 'onBlur' not in list_markup and 'onFocus' not in row[row.index('  const label = text.trim()'):] and 'onBlur' not in row[row.index('  const label = text.trim()'):])
check('Row keys stay stable by message id through focus changes', 'key={m.id}' in list_markup and '[editing, text, userContent]' in row)
check('Actual Composer focus method only queries and focuses the real row', 'row.focus();\n    return true;' in c[c.index('  function focus(target: QueueFocus)'):c.index('  function onKeyDown(e: globalThis.KeyboardEvent)')])
check('Merged singleton rendered eligibility stays intact', 'draggable: queue.items.length > 1 && queue.editingId === null,' in panel)
regressions = ['composerQueueSingletonDrag.test.ts', 'composerQueueEditReturnFocus.test.ts', 'composerQueueFocus.test.ts', 'composerQueueEditEmptySave.test.ts', 'composerQueueCollapseShrink.test.ts', 'queue.test.ts', 'queueKeys.test.ts']
for name in regressions:
    path = 'src/features/chat/' + name
    check('Published regression unchanged from actual merged main: ' + name, Path(path).read_bytes() == git('show', main + ':' + path))
check('No tracked product or regression modification during preparation', subprocess.run(['git','diff','--quiet']).returncode == 0 and subprocess.run(['git','diff','--cached','--quiet']).returncode == 0)

result = {
    'candidate': 'COMPOSER-QUEUE-EDIT-KEYBOARD-LOCK-135',
    'checked_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'checked_default_main': main,
    'classification': 'SOURCE_QUALIFIED_CANDIDATE_NOT_RUNTIME_REPRODUCED',
    'finding': 'Retained real-Conductor chat propagates active queued edit id into a global early return in the actual queue list keyboard handler. Fresh main leaves displayed nonediting rows focusable and their real keyboard handlers can dispatch edit/delete/steer or consume navigation while another queued edit remains active. No runtime failure or native behavior is claimed.',
    'scope': 'Queue-row keyboard handling during any active queued edit only. Preserve edit-editor Save/Cancel/Save-and-steer, pointer buttons, dragging, ordering, provider behavior and all nonediting shortcuts.',
    'parent': {'bytes': len(renderer), 'sha256': sha(renderer)},
    'spans': spans,
    'main_sources': pins,
    'checks_passed': len(checks), 'checks': checks,
    'collision': 'Ledger 87e0bf26 confirms same narrow row-handler ownership; private inert26 refinement/freeze only. No runtime request or reservation.',
    'ordinary_producer_closure': 'SOURCE-CLOSED: actual visible Edit A -> real actionStep/beginEdit -> row-local edited draft -> actual queued-editor onBlur no-op -> still-rendered focusable B -> actual row onKeyDown. No focus-triggered automatic save/cancel or manual editingId injection. DOM/editor focus adapters still require separately admitted runtime verification; no physical Tab or native behavior claim.',
    'next_check_not_run': 'Mount the actual complete Composer and real queue reducers. With q1 editing and q2 as event currentTarget, E/Delete/Steer and plain navigation must be unhandled without actions/effects/focus/draft loss; repeat configured shortcuts. Nonediting controls must still dispatch or navigate. Test editor save/cancel and child/IME negatives. Freeze case/oracle before any separately admitted execution.',
    'limits': ['Source-only Python/hash/text checks, no Node or JS parser execution.', 'Retained REA analyzed source, not a new Conductor capture or physical observation.', 'Historical REA graph cap, no-match, ambiguous receiver, missing range-helper and corrected digest limitations unchanged.', '#1480 actual merge confirmed 8f0f8707a529e17937cd8e9447b8b769b6bc5e21; source rebound to current main. Candidate has no product edits/commits/PR stack.', 'No test, build, preview/browser, install, native, package, provider or agent execution; sole E1 native/package ownership unchanged.']
}
(D / 'qualification.json').write_text(json.dumps(result, indent=2) + '\n')
(D / 'reference' / 'spans.json').write_text(json.dumps(spans, indent=2) + '\n')
print(json.dumps({k:result[k] for k in ['candidate','checked_default_main','classification','checks_passed','collision']},indent=2))
