"""Create an inert fixture from the existing actual-Composer regression host. No JS runs."""
from pathlib import Path
import datetime, hashlib, json
D = Path('.qa/queue-edit-keyboard-lock-135')
base = Path('src/features/chat/composerQueueEditReturnFocus.test.ts').read_text()
prefix = base[:base.index('// Six decisive cases:')]
def replace(old, new):
    global prefix
    assert prefix.count(old) == 1, old[:80]
    prefix = prefix.replace(old, new)
replace('// Conductor Rebuild — COMPOSER-QUEUE-EDIT-RETURN-FOCUS-135.', '// Conductor Rebuild — COMPOSER-QUEUE-EDIT-KEYBOARD-LOCK-135. INERT, NOT RUN.')
replace('// Permanent regression port; the original serialized RED/GREEN fixture is retained in evidence.', '// Oracle-first fixture. Enter edit through actual visible button + real reducer; never seed editingId.')
prefix = prefix.replace('from "./', 'from "../../src/features/chat/').replace('from "../../keybindings/', 'from "../../src/keybindings/')
replace('import { effectiveShortcuts }', 'import { effectiveShortcuts, type Overrides }')
replace('const FocusPort = React.createContext(null);', 'const FocusPort = React.createContext(null);\nconst OverridesPort = React.createContext({});')
assert prefix.count('process.env.COMPOSER_QUEUE_EDIT_RETURN_FOCUS_SOURCE_REF') == 2
prefix = prefix.replace('process.env.COMPOSER_QUEUE_EDIT_RETURN_FOCUS_SOURCE_REF', 'process.env.COMPOSER_QUEUE_EDIT_KEYBOARD_LOCK_SOURCE_REF')
replace('typeof import("./Composer")', 'typeof import("../../src/features/chat/Composer")')
replace('  onKeyDown(event: KeyboardEvent): void;\n};', '  onKeyDown(event: KeyboardEvent): void;\n  onFocus(): void;\n  onBlur(): void;\n};')
replace('useKeybindingOverrides: () => ({ overrides: {} })', 'useKeybindingOverrides: () => ({ overrides: React.useContext(OverridesPort) })')
replace('actual-Composer.queue-edit-return-focus.cjs', 'actual-Composer.queue-edit-keyboard-lock.cjs')
replace('function fixture(initial = seed()) {', 'function fixture(initial = seed(), overrides: Overrides = {}) {')
replace('return React.createElement(FocusPort.Provider, { value: focused }, React.createElement(exports.Composer, {', 'return React.createElement(OverridesPort.Provider, { value: overrides }, React.createElement(FocusPort.Provider, { value: focused }, React.createElement(exports.Composer, {')
replace('apply(queue.actionStep(model.queue, action)); },\n    }));', 'apply(queue.actionStep(model.queue, action)); },\n    })));')
replace('    initial, actions, effects, focused, queries,', '''    initial, actions, effects, focused, queries,
    get editValue() { return edit().props.value; },
    focusRow(id: string) {
      const row = renderer.root.findByProps({ "data-id": id });
      assert.equal(row.props.tabIndex, 0, "focus only an actually rendered focusable row");
      const editors = renderer.root.findAllByType(EditorBoundary).filter((node: { props: EditorProps }) => node.props.placeholder === "Edit queued message");
      assert.ok(editors.length <= 1);
      // DOM/editor focus is an explicit port, not physical Tab evidence. Invoke the
      // actual queued-editor blur prop and observed DOM focus handlers, not a fake save/cancel.
      const target = {};
      act(() => {
        editors[0]?.props.onBlur();
        for (let node = row; node; node = node.parent) {
          if (typeof node.type === "string" && typeof node.props.onFocus === "function") node.props.onFocus({ target, currentTarget: target });
        }
        focused.push({ target: id });
      });
    },
    rowKey(id: string, key: string, modifiers: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "shiftKey">> = {}, { child = false, composing = false } = {}) {
      const row = renderer.root.findByProps({ "data-id": id });
      assert.equal(row.props.tabIndex, 0);
      const target = {};
      const fields = { key, code: key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...modifiers };
      const nativeEvent = Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), fields, { isComposing: composing });
      act(() => row.props.onKeyDown({ ...fields, nativeEvent, target: child ? {} : target, currentTarget: target,
        preventDefault() { nativeEvent.preventDefault(); }, stopPropagation() { nativeEvent.stopPropagation(); } }));
      return { prevented: nativeEvent.defaultPrevented, stopped: nativeEvent.cancelBubble };
    },''')
# The old helper is unused by this new oracle and must not imply a return-focus target.
prefix = prefix[:prefix.index('function restored(')]
appendix = r'''
const unhandled = { prevented: false, stopped: false };
const handled = { prevented: true, stopped: true };
const unsaved = "unsaved edit A, not committed";
const rowKeys = ["e", "Backspace", "Enter", "ArrowDown", "ArrowUp", "Home", "End", "Escape"] as const;
const queueCommands = ["chat.queue.editMessage", "chat.queue.deleteMessage", "chat.queue.steerMessage"] as const;
function ordinaryEditThenFocusB(view: View) {
  assert.equal(view.queue.editingId, null, "target setup must start with no edit");
  view.enter("q1"); // actual rendered Edit button -> actual actionStep -> actual beginEdit
  view.change(unsaved); // actual queued editor onChange, not a seeded state override
  assert.equal(view.editValue, unsaved);
  const snapshot = JSON.parse(JSON.stringify(view.queue));
  view.focusRow("q2"); // actual queued-editor blur prop + rendered row focus port
  assert.equal(view.queue.editingId, "q1", "ordinary focus B must not cancel/finish A");
  assert.equal(view.editValue, unsaved, "ordinary focus B must retain unsaved A draft");
  assert.deepEqual(view.queue, snapshot);
  assert.deepEqual(view.actions, [{ kind: "edit", id: "q1" }]);
  assert.deepEqual(view.effects, []);
  view.focused.length = 0;
  view.queries.length = 0;
  return snapshot;
}
function retainsActiveEdit(view: View, before: queue.ChatQueue) {
  assert.deepEqual(view.queue, before, "row key must not mutate queue or active edit");
  assert.equal(view.editValue, unsaved, "row key must preserve unsaved A draft");
  assert.deepEqual(view.actions, [{ kind: "edit", id: "q1" }]);
  assert.deepEqual(view.effects, []);
  assert.deepEqual(view.focused, []);
  assert.deepEqual(view.queries, []);
}
for (const key of rowKeys) {
  test(`active-edit/nonediting-row/${key}`, () => {
    const view = fixture();
    try {
      const before = ordinaryEditThenFocusB(view);
      assert.deepEqual(view.rowKey("q2", key), unhandled, "active edit globally leaves row commands/navigation unhandled");
      retainsActiveEdit(view, before);
    } finally { view.close(); }
  });
}
for (const command of queueCommands) {
  test(`active-edit/remapped/${command}`, () => {
    const view = fixture(seed(), { [command]: [{ key: { kind: "logical", value: "ArrowUp" }, modifiers: ["ctrl"] }] });
    try {
      const before = ordinaryEditThenFocusB(view);
      assert.deepEqual(view.rowKey("q2", "ArrowUp", { ctrlKey: true }), unhandled);
      retainsActiveEdit(view, before);
    } finally { view.close(); }
  });
}
for (const key of rowKeys) {
  test(`control/no-edit/${key}`, () => {
    const view = fixture();
    try {
      view.focusRow("q2"); view.focused.length = 0;
      assert.deepEqual(view.rowKey("q2", key), handled);
      if (key === "e") {
        assert.deepEqual(view.actions, [{ kind: "edit", id: "q2" }]);
        assert.deepEqual(view.queue, { ...view.initial, editingId: "q2" });
        assert.deepEqual(view.effects, []);
        assert.deepEqual(view.focused.map((call) => call.target), ["edit"]);
      } else if (key === "Backspace" || key === "Enter") {
        assert.deepEqual(view.actions, [{ kind: key === "Backspace" ? "delete" : "steer", id: "q2" }]);
        assert.deepEqual(view.queue, { ...view.initial, items: [view.initial.items[0]!, view.initial.items[2]!] });
        assert.deepEqual(view.effects, key === "Backspace" ? [] : [{ kind: "steer", text: "message 2", attachments: view.initial.items[1]!.attachments }]);
        assert.deepEqual(view.focused.map((call) => call.target), ["q3"]);
      } else {
        const destination = key === "ArrowDown" || key === "End" ? "q3" : key === "Escape" ? "composer" : "q1";
        assert.deepEqual(view.actions, []); assert.deepEqual(view.effects, []);
        assert.deepEqual(view.queue, view.initial);
        assert.deepEqual(view.focused.map((call) => call.target), [destination]);
      }
    } finally { view.close(); }
  });
}
for (const [name, key, options] of [
  ["IME event ignored", "e", { composing: true }],
  ["child-target event ignored", "e", { child: true }],
  ["unknown key ignored", "x", {}],
] as const) {
  test(`control/${name}`, () => {
    const view = fixture();
    try {
      const before = ordinaryEditThenFocusB(view);
      assert.deepEqual(view.rowKey("q2", key, {}, options), unhandled);
      retainsActiveEdit(view, before);
    } finally { view.close(); }
  });
}
for (const [name, key, metaKey] of [
  ["Cancel", "Escape", false], ["Save", "Enter", false], ["Save-and-steer", "Enter", true],
] as const) {
  test(`control/edit editor ${name} preserved`, () => {
    const view = fixture();
    try {
      view.enter("q1"); view.change(unsaved); view.focused.length = 0;
      assert.equal(view.key(key, metaKey).prevented, true, "actual edit-editor keyboard callback stays enabled");
      assert.equal(view.queue.editingId, null);
      if (name === "Cancel") {
        assert.deepEqual(view.queue, view.initial);
        assert.deepEqual(view.actions, [{ kind: "edit", id: "q1" }, { kind: "cancelEdit" }]);
        assert.deepEqual(view.effects, []);
      } else {
        assert.deepEqual(view.actions, [{ kind: "edit", id: "q1" }, { kind: "saveEdit", input: { text: unsaved }, steer: metaKey }]);
        assert.deepEqual(view.queue, { ...view.initial, items: metaKey ? view.initial.items.slice(1) : [{ ...view.initial.items[0]!, text: unsaved }, ...view.initial.items.slice(1)] });
        assert.deepEqual(view.effects, metaKey ? [{ kind: "steer", text: unsaved, attachments: [] }] : []);
      }
      assert.deepEqual(view.focused.map((call) => call.target), name === "Save-and-steer" ? [] : ["q1"]);
    } finally { view.close(); }
  });
}
test("control/session remount has no leaked edit lock", () => {
  const view = fixture();
  try {
    ordinaryEditThenFocusB(view);
    view.switchSession(seed()); // actual keyed Composer remount; second session has no active edit
    assert.equal(view.queue.editingId, null);
    view.focusRow("q2"); view.actions.length = 0; view.effects.length = 0; view.focused.length = 0;
    assert.deepEqual(view.rowKey("q2", "e"), handled);
    assert.equal(view.queue.editingId, "q2");
    assert.deepEqual(view.actions, [{ kind: "edit", id: "q2" }]);
    assert.deepEqual(view.effects, []);
    assert.deepEqual(view.focused.map((call) => call.target), ["edit"]);
  } finally { view.close(); }
});
'''
fixture = prefix + appendix
assert 'editingId: editing ?' not in fixture
assert 'editingId: "q1"' not in fixture
assert 'queue.beginEdit(' not in fixture
assert 'COMPOSER_QUEUE_EDIT_RETURN_FOCUS_SOURCE_REF' not in fixture
assert 'from "./queue.ts"' not in fixture
(D / 'composerQueueEditKeyboardLock.test.ts').write_text(fixture)
print(json.dumps({'created_inert_fixture': str(D / 'composerQueueEditKeyboardLock.test.ts'), 'bytes': len(fixture.encode()), 'sha256': hashlib.sha256(fixture.encode()).hexdigest(), 'js_or_tests_executed': False}, indent=2))
