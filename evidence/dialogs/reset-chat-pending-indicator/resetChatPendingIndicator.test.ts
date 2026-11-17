import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const dependencies = process.env.RESET_CHAT_PENDING_DEPS
  ? createRequire(resolve(process.env.RESET_CHAT_PENDING_DEPS, "package.json"))
  : createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourceRoot = resolve(process.env.RESET_CHAT_PENDING_SOURCE_ROOT ?? ".");
const allowed = new Set([
  "src/features/chat/ResetChatDialog.tsx",
  "src/features/chat/checkpoints.ts",
  "src/components/menu/menuIcons.tsx",
  "src/components/motion/dialogMotion.ts",
].map((path) => resolve(sourceRoot, path)));

function deferred() {
  let fulfill: () => void = () => { throw new Error("Uninitialized promise"); };
  let reject: (error: Error) => void = () => { throw new Error("Uninitialized promise"); };
  const promise = new Promise<void>((yes, no) => { fulfill = yes; reject = no; });
  return { promise, fulfill, reject };
}

async function fixture() {
  const stored = new Map<string, string>();
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const confirmations: boolean[] = [];
  const pending = deferred();
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
      onConfirm: (resetFiles: boolean) => { confirmations.push(resetFiles); return pending.promise; },
      onClose: () => { closes += 1; },
    }));
  });
  return {
    pending,
    confirmations,
    closes: () => closes,
    reset: () => renderer.root.findByProps({ "data-primary-action": true }),
    checkbox: () => renderer.root.findByProps({ "aria-label": "Also reset files" }),
    dialog: () => renderer.root.findByProps({ role: "alertdialog" }),
    indicators: () => renderer.root.findByProps({ "data-primary-action": true }).findAll((node: { type: unknown; props: { width?: number; height?: number; "aria-hidden"?: string } }) =>
      node.type === "svg" && node.props.width === 16 && node.props.height === 16 && node.props["aria-hidden"] === "true"),
    shortcuts: () => renderer.root.findByProps({ "data-primary-action": true }).findAllByProps({ className: "oc-alert-kbd" }),
    errors: () => renderer.root.findAllByProps({ className: "error small" }),
    close: async () => { await act(async () => { renderer.unmount(); }); },
  };
}

for (const outcome of ["failure", "success"]) {
  test(`Reset chat shows pending feedback until ${outcome} settles`, async () => {
    const view = await fixture();
    try {
      assert.equal(view.indicators().length, 0);
      assert.equal(view.shortcuts().length, 1);
      assert.equal(view.reset().props.disabled, false);
      if (outcome === "failure") await act(async () => { view.checkbox().props.onChange({ target: { checked: false } }); });
      const submittedResetFiles = view.checkbox().props.checked;
      await act(async () => { view.reset().props.onClick(); });
      assert.equal(view.indicators().length, 1, "pending Reset needs a decorative 16px working indicator");
      assert.equal(view.reset().props.disabled, true);
      assert.ok(view.reset().children.includes("Resetting..."));
      assert.equal(view.shortcuts().length, 0);
      assert.deepEqual(view.confirmations, [submittedResetFiles]);
      await act(async () => {
        view.reset().props.onClick();
        view.dialog().props.onKeyDown({ key: "Enter", metaKey: true, ctrlKey: false, preventDefault() {} });
      });
      assert.deepEqual(view.confirmations, [submittedResetFiles], "pending confirmation stays single-flight");
      assert.equal(view.closes(), 0);
      if (outcome === "failure") {
        await act(async () => { view.pending.reject(new Error("synthetic reset failure")); });
        assert.equal(view.indicators().length, 0);
        assert.equal(view.reset().props.disabled, false);
        assert.equal(view.shortcuts().length, 1);
        assert.ok(view.reset().children.includes("Reset"));
        assert.equal(view.errors().length, 1);
        assert.equal(view.closes(), 0);
        assert.equal(view.checkbox().props.checked, submittedResetFiles);
      } else {
        await act(async () => { view.pending.fulfill(); });
        assert.equal(view.closes(), 1, "successful reset asks its parent to close exactly once");
        assert.deepEqual(view.confirmations, [submittedResetFiles]);
      }
    } finally { await view.close(); }
  });
}
