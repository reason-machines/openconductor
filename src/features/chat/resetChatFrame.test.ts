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
const sourceRoot = resolve(process.env.RESET_CHAT_FRAME_SOURCE_ROOT ?? ".");
const allowed = new Set([
  "src/features/chat/ResetChatDialog.tsx",
  "src/features/chat/checkpoints.ts",
  "src/components/DialogFrame.tsx",
  "src/components/menu/menuIcons.tsx",
].map((path) => resolve(sourceRoot, path)));
const classes = (value = "") => value.split(/\s+/);

type Host = { type: unknown; props: { className?: string } };

async function fixture() {
  const stored = new Map<string, string>();
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const confirmations: boolean[] = [];
  let closes = 0;
  let finish: () => void = () => { throw new Error("No reset is pending"); };
  // Keep the actual DialogFrame. Only Base UI's portal/DOM boundary and unrelated
  // hooks are replaced; stubbing DialogFrame itself would hide a nested shell.
  const parts = {
    Root: ({ children }: { children: unknown }) => children,
    Portal: ({ children }: { children: unknown }) => children,
    Backdrop: () => null,
    Popup: React.forwardRef((props: object, ref: unknown) => React.createElement("section", { ...props, ref })),
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
      if (name === "@base-ui/react/dialog") return { Dialog: parts };
      if (name === "@base-ui/react/alert-dialog") return { AlertDialog: parts };
      if (name === "../keybindings/KeybindingsProvider") return { useKeybindingOverrides: () => ({ overrides: {} }) };
      if (name === "../keybindings/overrides") return { effectiveShortcuts: () => [] };
      if (name === "../keybindings/shortcut") return { matchesEvent: () => false };
      if (name === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
      if (name === "./dialogFrame.css") return {};
      const target = resolve(dirname(filename), name);
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find((path) => allowed.has(path));
      assert.ok(resolved, `Unexpected import: ${name}`);
      return load(resolved);
    };
    runInNewContext(`(function(require, module, exports) {\n${javascript}\n})`, {
      document: { activeElement: null }, HTMLElement: class {},
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => { stored.set(key, value); },
      },
    }, { filename })(require, module, module.exports);
    return module.exports;
  }
  const { ResetChatDialog } = load(resolve(sourceRoot, "src/features/chat/ResetChatDialog.tsx"));
  assert.equal(typeof ResetChatDialog, "function");
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(ResetChatDialog, {
      loadChangedCount: async () => 3,
      onConfirm: (resetFiles: boolean) => {
        confirmations.push(resetFiles);
        return new Promise<void>((resolve) => { finish = resolve; });
      },
      onClose: () => { closes += 1; },
    }));
  });
  return {
    root: () => renderer.root,
    popup: () => renderer.root.findByType("section"),
    cancel: () => renderer.root.findByProps({ "data-dialog-cancel": true }),
    reset: () => renderer.root.findByProps({ "data-primary-action": true }),
    checkbox: () => renderer.root.findByProps({ "aria-label": "Also reset files" }),
    confirmations,
    closes: () => closes,
    complete: async () => { await act(async () => { finish(); }); },
    dispose: async () => { await act(async () => { renderer.unmount(); }); },
  };
}

test("Reset chat has one styled panel, not an oc-alert panel nested inside DialogFrame", async () => {
  const view = await fixture();
  try {
    const panels = view.root().findAll((node: Host) => {
      if (typeof node.type !== "string") return false;
      const names = classes(node.props.className);
      return names.includes("oc-alert") || (names.includes("modal") && names.includes("project-dialog"));
    });
    assert.equal(panels.length, 1, "Reset must not nest a second width/padding/border/background shell inside DialogFrame");
    assert.equal(panels[0], view.popup());
    assert.deepEqual(view.popup().children.map((node: Host) => node.props.className), [
      "oc-alert-header", "oc-reset-files", "oc-alert-footer",
    ], "header, checkbox and footer belong directly to the shared alert panel");
  } finally { await view.dispose(); }
});

test("Reset chat selects the existing rounded alert variant on its sole panel", async () => {
  const view = await fixture();
  try {
    assert.ok(classes(view.popup().props.className).includes("project-confirmation"), "Reset must opt into the shared 12px alert corners, not ordinary-dialog 6px corners");
  } finally { await view.dispose(); }
});

test("Reset chat keeps Cancel as the focus target and cancellation never resets", async () => {
  const view = await fixture();
  try {
    assert.equal(view.cancel().props["data-dialog-cancel"], true);
    assert.notEqual(view.reset().props.autoFocus, true);
    await act(async () => { view.cancel().props.onClick(); });
    assert.equal(view.closes(), 1);
    assert.deepEqual(view.confirmations, []);
  } finally { await view.dispose(); }
});

for (const resetFiles of [true, false]) {
  test(`Reset chat frame preserves reset-files=${resetFiles} and pending confirmation`, async () => {
    const view = await fixture();
    try {
      if (!resetFiles) await act(async () => { view.checkbox().props.onChange({ target: { checked: false } }); });
      await act(async () => { view.reset().props.onClick(); });
      assert.deepEqual(view.confirmations, [resetFiles]);
      assert.equal(view.reset().props.disabled, true);
      assert.equal(view.closes(), 0, "reset does not close before its operation succeeds");
      await view.complete();
      assert.equal(view.closes(), 1);
      assert.deepEqual(view.confirmations, [resetFiles]);
    } finally { await view.dispose(); }
  });
}
