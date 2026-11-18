import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { Overrides } from "../keybindings/overrides.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const custom = { "dialog.primaryAction": [{ key: { kind: "logical", value: "d" }, modifiers: ["meta"] }] } as Overrides;

// Follow submitPromptPendingHint.test.ts: real component, provider and shortcut
// display, with only external opener, motion and DOM listener ports inert.
// Form callbacks are not trusted keyboard/browser or native handoff evidence.
async function fixture(overrides: Overrides = {}) {
  const requests: { url: string; resolve: () => void; reject: (error: Error) => void }[] = [];
  const events = { addEventListener() {}, removeEventListener() {} };
  const modules = new Map<string, { exports: any }>();
  let closes = 0;
  function load(path: string): any {
    if (modules.has(path)) return modules.get(path)!.exports;
    assert.ok(/[/\\]keybindings[/\\]/.test(path) || ["FeedbackDialog.tsx", "feedback.ts", "helpMenuItems.ts"].some((name) => path === resolve(sourceRoot, "components", name)), `Unexpected source module: ${path}`);
    const module = { exports: {} as any };
    modules.set(path, module);
    const javascript = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(javascript, {
      exports: module.exports, module, Error, URLSearchParams,
      window: events, document: { ...events, activeElement: null }, HTMLElement: class {},
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        if (name === "../backend" && path.endsWith("FeedbackDialog.tsx")) return {
          openUrl(url: string) {
            let resolve = () => {};
            let reject = (_error: Error) => {};
            const request = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
            void request.catch(() => {});
            requests.push({ url, resolve, reject });
            return request;
          },
        };
        if (name === "./motion/dialogMotion" && path.endsWith("FeedbackDialog.tsx")) return { useDialogMotion: () => React.useRef(null) };
        assert.ok(name.startsWith("."), `Unexpected dependency: ${name}`);
        const target = resolve(dirname(path), name);
        const file = [target, `${target}.ts`, `${target}.tsx`].find((candidate) => existsSync(candidate));
        assert.ok(file, `Unresolved source: ${name}`);
        return load(file);
      },
    }, { filename: path });
    return module.exports;
  }
  const { KeybindingsProvider } = load(resolve(sourceRoot, "keybindings/KeybindingsProvider.tsx"));
  const { FeedbackDialog } = load(resolve(sourceRoot, "components/FeedbackDialog.tsx"));
  function Host() {
    const [open, setOpen] = React.useState(true);
    return open ? React.createElement(FeedbackDialog, {
      appVersion: "0.test", platform: "synthetic",
      onClose() { closes++; setOpen(false); },
    }) : null;
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(KeybindingsProvider, {
      loadOverrides: async () => JSON.stringify({ version: 1, overrides }),
    }, React.createElement(Host)));
  });
  const input = () => renderer.root.findByProps({ id: "feedback-message" });
  const text = (node: any): string => typeof node === "string" ? node : node.children.map(text).join("");
  return {
    requests, input,
    get closes() { return closes; },
    hint: () => renderer.root.findAllByProps({ className: "submit-prompt-kbd" }).map(text),
    button: () => renderer.root.findByProps({ type: "submit" }),
    buttonText() { return text(this.button()); },
    fill(value = "  Keep this synthetic feedback  ") { act(() => {
      input().props.onChange({ target: { value } });
    }); },
    submit() { act(() => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} })); },
    async resolve(index = 0) { await act(async () => { requests[index].resolve(); }); },
    async reject(index = 0) { await act(async () => { requests[index].reject(new Error("Synthetic opener rejected")); }); },
    json: () => renderer.toJSON(),
    dispose() { act(() => renderer.unmount()); },
  };
}

test("Feedback shows the default hint while idle", async () => {
  const view = await fixture();
  try {
    assert.deepEqual(view.hint(), ["⌘↵"]);
    assert.equal(view.button().props.disabled, true);
    assert.equal(view.buttonText(), "Continue on GitHub⌘↵");
  } finally { view.dispose(); }
});

test("Feedback shows the configured hint while idle", async () => {
  const view = await fixture(custom);
  try {
    view.fill();
    assert.deepEqual(view.hint(), ["⌘D"]);
    assert.equal(view.button().props.disabled, false);
  } finally { view.dispose(); }
});

for (const [name, overrides, hint] of [["default", {}, "⌘↵"], ["custom", custom, "⌘D"]] as const) {
  test(`Feedback hides the ${name} hint while the opener is pending`, async () => {
    const view = await fixture(overrides);
    try {
      view.fill();
      assert.deepEqual(view.hint(), [hint]);
      view.submit();
      assert.equal(view.requests.length, 1);
      assert.equal(view.closes, 0);
      assert.equal(view.button().props.disabled, true);
      assert.deepEqual(view.hint(), [], "pending button must not advertise an idle shortcut");
      assert.equal(view.buttonText(), "Opening GitHub...");
    } finally { view.dispose(); }
  });

  test(`Feedback restores the ${name} hint and draft after rejection, then retries`, async () => {
    const view = await fixture(overrides);
    try {
      view.fill();
      view.submit();
      await view.reject();
      assert.equal(view.closes, 0);
      assert.deepEqual(view.hint(), [hint]);
      assert.equal(view.button().props.disabled, false);
      assert.equal(view.input().props.value, "  Keep this synthetic feedback  ");
      view.submit();
      assert.equal(view.requests.length, 2);
      assert.equal(view.requests[1].url, view.requests[0].url);
      await view.resolve(1);
      assert.equal(view.closes, 1);
      assert.equal(view.json(), null);
    } finally { view.dispose(); }
  });
}

test("Feedback falls back to the default hint after an invalid stored shortcut", async () => {
  const view = await fixture({ "dialog.primaryAction": [] });
  try {
    assert.deepEqual(view.hint(), ["⌘↵"]);
    view.fill();
    view.submit();
    assert.equal(view.requests.length, 1);
    assert.equal(view.button().props.disabled, true);
    await view.reject();
    assert.deepEqual(view.hint(), ["⌘↵"]);
    assert.equal(view.buttonText(), "Continue on GitHub⌘↵");
  } finally { view.dispose(); }
});

test("Feedback waits, disables the message and suppresses duplicate submits", async () => {
  const view = await fixture();
  try {
    view.fill();
    view.submit();
    view.submit();
    assert.equal(view.requests.length, 1);
    assert.equal(view.closes, 0);
    assert.equal(view.input().props.disabled, true);
    await view.resolve();
    assert.equal(view.closes, 1);
    assert.equal(view.json(), null);
  } finally { view.dispose(); }
});

test("Feedback does not open a blank or whitespace draft", async () => {
  const view = await fixture();
  try {
    view.submit();
    view.fill(" \n\t ");
    view.submit();
    assert.equal(view.requests.length, 0);
    assert.equal(view.closes, 0);
    assert.deepEqual(view.hint(), ["⌘↵"]);
  } finally { view.dispose(); }
});
