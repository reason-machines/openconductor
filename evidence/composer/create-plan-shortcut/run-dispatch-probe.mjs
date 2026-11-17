// Pure source-unit supplement. Does not launch the app, browser, native IPC or an agent.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../../..");
let source = readFileSync(resolve(root, "src/components/createWorkspaceLaunchClose.test.ts"), "utf8");
const firstTest = source.indexOf('\ntest("create composer');
if (firstTest < 0) throw new Error("Mounted fixture boundary missing");
source = source.slice(0, firstTest);
function change(before, after) {
  if (source.split(before).length !== 2) throw new Error(`Expected one fixture seam: ${before}`);
  source = source.replace(before, after);
}
change('  const keys = new Map<string, (() => unknown) | undefined>();',
  '  const keys = new Map<string, (() => unknown) | undefined>();\n  const bindings = new Map<string, BindOptions>();');
change('useKeybindings: (handlers: Record<string, (() => unknown) | undefined>) => { for (const [id, handler] of Object.entries(handlers)) keys.set(id, handler); }',
  'useKeybindings: (handlers: Record<string, (() => unknown) | undefined>, options: BindOptions = {}) => { for (const [id, handler] of Object.entries(handlers)) { keys.set(id, handler); bindings.set(id, options); } }');
change('    events, warnings, actions, pending, staged, copied, queued, keys,',
  '    events, warnings, actions, pending, staged, copied, queued, keys, bindings,');
source = `import { bindCommands } from "../../src/keybindings/bind.ts";
import { createDispatcher } from "../../src/keybindings/dispatcher.ts";
import type { BindOptions } from "../../src/keybindings/resolve.ts";
import { logical } from "../../src/keybindings/types.ts";
${source}
for (const page of [false, true]) {
  test(\`Create Plan actual call-site options dispatch in dialog/page and honor overrides (page=\${page})\`, async () => {
    const view = await fixture({ page, agent: "claude" });
    try {
      view.focusEditor(true);
      const options = view.bindings.get("chat.togglePlanMode");
      assert.ok(options, "Plan command must have registered call-site options");
      assert.deepEqual(Array.from(options.enableOnDialogIds ?? []), page ? [] : ["dialog"]);
      const callback = () => view.keys.get("chat.togglePlanMode")?.() as boolean | void;
      const event = { key: "Tab", code: "Tab", shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, repeat: false };
      const focus = { activeDialogId: page ? null : "dialog", typing: true, inTerminal: false };
      const dispatcher = createDispatcher();
      bindCommands(dispatcher, { "chat.togglePlanMode": callback }, {}, options);
      let result;
      await act(async () => { result = dispatcher.dispatch(event, focus); });
      assert.equal(result.kind, "ran");
      assert.match(view.rendered(), /Exit plan mode/);
      view.focusEditor(false);
      assert.equal(dispatcher.dispatch(event, focus).kind, "pass");
      view.focusEditor(true);
      assert.equal(dispatcher.dispatch(event, { ...focus, activeDialogId: "unrelated-dialog" }).kind, "pass");
      assert.equal(dispatcher.dispatch(event, { ...focus, inTerminal: true }).kind, "pass");
      const rebound = createDispatcher();
      bindCommands(rebound, { "chat.togglePlanMode": callback }, { overrides: { "chat.togglePlanMode": [logical("p", ["meta", "shift"])] } }, options);
      assert.equal(rebound.dispatch(event, focus).kind, "pass");
      await act(async () => { result = rebound.dispatch({ ...event, key: "p", code: "KeyP", metaKey: true }, focus); });
      assert.equal(result.kind, "ran");
      assert.doesNotMatch(view.rendered(), /Exit plan mode/);
    } finally { view.dispose(); }
  });
}
`;
const folder = resolve(root, ".qa/create-plan-shortcut");
mkdirSync(folder, { recursive: true });
const target = resolve(folder, "dispatch.test.ts");
writeFileSync(target, source);
const result = spawnSync(process.execPath, ["--test", target], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
