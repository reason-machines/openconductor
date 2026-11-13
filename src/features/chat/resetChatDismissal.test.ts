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
const sourceRoot = resolve(process.env.RESET_CHAT_DISMISSAL_SOURCE_ROOT ?? ".");
const allowed = new Set([
  "src/features/chat/ResetChatDialog.tsx",
  "src/features/chat/checkpoints.ts",
  "src/components/menu/menuIcons.tsx",
  "src/components/motion/dialogMotion.ts",
].map((path) => resolve(sourceRoot, path)));

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
    cancel: () => renderer.root.findByProps({ className: "oc-alert-btn oc-alert-cancel" }),
    reset: () => renderer.root.findByProps({ "data-primary-action": true }),
    backdrop: () => renderer.root.findByProps({ className: "modal-backdrop oc-alert-backdrop" }),
    checkbox: () => renderer.root.findByProps({ "aria-label": "Also reset files" }),
    dialog: () => renderer.root.findByProps({ role: "alertdialog" }),
    close: async () => { await act(async () => { renderer.unmount(); }); },
  };
}

for (const resetFiles of [true, false]) {
  test(`mounted Reset chat ignores outside mouse-down with reset-files=${resetFiles}`, async () => {
    const view = await fixture();
    try {
      if (!resetFiles) await act(async () => { view.checkbox().props.onChange({ target: { checked: false } }); });
      const outside = {};
      await act(async () => { view.backdrop().props.onMouseDown?.({ target: outside, currentTarget: outside }); });
      assert.equal(view.closes(), 0, "outside mouse-down must not dismiss Reset chat");
      assert.deepEqual(view.confirmations, [], "outside mouse-down must not confirm reset");
      assert.equal(view.checkbox().props.checked, resetFiles, "outside mouse-down must preserve the selected payload");
    } finally { await view.close(); }
  });
}

for (const action of ["Cancel", "Escape"]) {
  test(`mounted Reset chat remains dismissible by explicit ${action}`, async () => {
    const view = await fixture();
    try {
      await act(async () => {
        if (action === "Cancel") view.cancel().props.onClick();
        else view.dialog().props.onKeyDown({ key: "Escape" });
      });
      assert.equal(view.closes(), 1);
      assert.deepEqual(view.confirmations, [], "explicit dismissal must not confirm reset");
    } finally { await view.close(); }
  });
}

for (const resetFiles of [true, false]) {
  for (const action of ["click", "Meta+Enter", "Ctrl+Enter"]) {
    test(`mounted Reset chat dismissal controls preserve reset-files=${resetFiles} for explicit ${action} confirmation`, async () => {
      const view = await fixture();
      try {
        assert.equal(view.checkbox().props.checked, true);
        if (!resetFiles) await act(async () => { view.checkbox().props.onChange({ target: { checked: false } }); });
        assert.equal(view.checkbox().props.checked, resetFiles);
        let prevented = 0;
        await act(async () => {
          if (action === "click") view.reset().props.onClick();
          else view.dialog().props.onKeyDown({
            key: "Enter", metaKey: action === "Meta+Enter", ctrlKey: action === "Ctrl+Enter",
            preventDefault: () => { prevented += 1; },
          });
        });
        assert.deepEqual(view.confirmations, [resetFiles], "explicit confirmation must preserve the selected payload and run once");
        assert.equal(view.closes(), 1, "successful confirmation closes the dialog once");
        assert.equal(prevented, action === "click" ? 0 : 1);
      } finally { await view.close(); }
    });
  }
}
