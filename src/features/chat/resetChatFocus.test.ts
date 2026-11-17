import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourceRoot = resolve(process.env.RESET_CHAT_FOCUS_SOURCE_ROOT ?? ".");
const allowed = new Set([
  "src/features/chat/ResetChatDialog.tsx",
  "src/features/chat/checkpoints.ts",
  "src/components/menu/menuIcons.tsx",
].map((path) => resolve(sourceRoot, path)));
const dialogFramePath = resolve(sourceRoot, "src/components/DialogFrame.tsx");

async function fixture() {
  const stored = new Map<string, string>();
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const confirmations: boolean[] = [];
  let closes = 0;
  const localStorage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
  };
  function load(filename: string): Record<string, unknown> {
    assert.ok(allowed.has(filename), `Unexpected source dependency: ${filename}`);
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const javascript = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = (name: string) => {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      // Stub DialogFrame — backdrop, motion and accessibility are DialogFrame's concern
      if (resolve(dirname(filename), name) === dialogFramePath.slice(0, -4) ||
          resolve(dirname(filename), name) === dialogFramePath) {
        return {
          DialogFrame: ({ titleId, descriptionId, onClose: df_onClose, children }: {
            titleId: string; descriptionId?: string; onClose: () => void; children: unknown;
          }) => React.createElement("div", {
            role: "alertdialog",
            "aria-modal": "true",
            "aria-labelledby": titleId,
            "aria-describedby": descriptionId,
            onKeyDown: (e: { key: string }) => { if (e.key === "Escape") df_onClose(); },
          }, children),
        };
      }
      const target = resolve(dirname(filename), name);
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find((path) => allowed.has(path));
      assert.ok(resolved, `Unexpected import: ${name}`);
      return load(resolved);
    };
    runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, { localStorage }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const { ResetChatDialog } = load(resolve(sourceRoot, "src/features/chat/ResetChatDialog.tsx"));
  assert.equal(typeof ResetChatDialog, "function");
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(ResetChatDialog, {
      loadChangedCount: async () => 2,
      onConfirm: async (resetFiles: boolean) => { confirmations.push(resetFiles); },
      onClose: () => { closes += 1; },
    }));
  });
  return {
    confirmations,
    closes: () => closes,
    // Cancel carries data-dialog-cancel; DialogFrame focuses it via initialFocus
    cancel: () => renderer.root.findByProps({ "data-dialog-cancel": true }),
    reset: () => renderer.root.findByProps({ "data-primary-action": true }),
    checkbox: () => renderer.root.findByProps({ "aria-label": "Also reset files" }),
    dialog: () => renderer.root.findByProps({ role: "alertdialog" }),
    close: async () => { await act(async () => { renderer.unmount(); }); },
  };
}

test("mounted Reset chat declares Cancel as its initial focus target via data-dialog-cancel", async () => {
  const view = await fixture();
  try {
    // DialogFrame(kind="alert") focuses [data-dialog-cancel] via initialFocus; no autoFocus prop needed
    assert.ok(view.cancel().props["data-dialog-cancel"], "Cancel must carry data-dialog-cancel for DialogFrame initial focus");
    assert.notEqual(view.reset().props.autoFocus, true, "Reset must not steal focus");
    assert.deepEqual(view.confirmations, [], "mounting must not reset chat");
    await act(async () => { view.cancel().props.onClick(); });
    assert.equal(view.closes(), 1);
    assert.deepEqual(view.confirmations, [], "Cancel must not invoke the reset callback");
  } finally { await view.close(); }
});

for (const resetFiles of [true, false]) {
  test(`mounted Reset chat preserves reset-files=${resetFiles} for explicit click confirmation`, async () => {
    const view = await fixture();
    try {
      assert.equal(view.checkbox().props.checked, true);
      if (!resetFiles) await act(async () => { view.checkbox().props.onChange({ target: { checked: false } }); });
      assert.equal(view.checkbox().props.checked, resetFiles);
      await act(async () => { view.reset().props.onClick(); });
      assert.deepEqual(view.confirmations, [resetFiles], "explicit confirmation must preserve the selected payload and run once");
      assert.equal(view.closes(), 1, "successful confirmation closes the dialog once");
    } finally { await view.close(); }
  });
}
