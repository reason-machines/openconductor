import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { SectionDialogMode } from "./SectionDialog";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

type Host = { type: unknown; props: Record<string, unknown>; parent: Host | null };

function fixture(data: SectionDialogMode, webkit = false) {
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let nextTimer = 0;
  const modules = new Map<string, Record<string, unknown>>();
  const files: Record<string, string> = {
    "./Dialogs": "./Dialogs.tsx",
    "./sectionEmoji": "./sectionEmoji.ts",
    "./Icons": "./Icons.tsx",
    "./AppMark": "./AppMark.tsx",
    "./ConductorIcon": "./ConductorIcon.tsx",
    "./conductorIcons.generated": "./conductorIcons.generated.ts",
  };
  function load(file: string): Record<string, unknown> {
    const cached = modules.get(file);
    if (cached) return cached;
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const javascript = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    modules.set(file, exports);
    runInNewContext(javascript, {
      exports,
      CSS: { supports: (feature: string) => webkit && feature === "-webkit-backdrop-filter:none" },
      setTimeout(callback: () => void, delay: number) {
        const id = ++nextTimer;
        timers.set(id, { callback, delay });
        return id;
      },
      clearTimeout(id: number) { timers.delete(id); },
      require(name: string) {
        if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
        if (name === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
        if (name in files) return load(files[name]);
        throw new Error(`Unexpected section composition dependency: ${name}`);
      },
    });
    return exports;
  }
  const { SectionDialog } = load("./SectionDialog.tsx");
  assert.equal(typeof SectionDialog, "function");
  const events: string[] = [];
  const submissions: { name: string; emoji?: string }[] = [];
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(SectionDialog, {
      data,
      onSubmit(value: { name: string; emoji?: string }) { submissions.push(value); events.push("submit"); },
      onClose() { events.push("close"); },
    }));
  });
  const input = (): Host => renderer.root.findByProps({ "aria-label": "Section name" });
  function invoke(host: Host, name: string, event: unknown) {
    const handler = host.props[name];
    if (typeof handler === "function") handler(event);
  }
  function dispatch(name: string, key = "", isComposing = false) {
    const path: Host[] = [];
    for (let node: Host | null = input(); node; node = node.parent) {
      if (typeof node.type === "string") path.push(node);
    }
    let stopped = false;
    let prevented = false;
    const event = {
      key, nativeEvent: { isComposing },
      preventDefault() { prevented = true; },
      stopPropagation() { stopped = true; },
    };
    act(() => {
      for (const host of [...path].reverse()) {
        if (stopped) break;
        invoke(host, `${name}Capture`, event);
      }
      for (const host of path) {
        if (stopped) break;
        invoke(host, name, event);
      }
    });
    return { prevented };
  }
  return {
    events, submissions, input, timers,
    name(value: string) { act(() => invoke(input(), "onChange", { target: { value } })); },
    key(key: string, composing = false) { return dispatch("onKeyDown", key, composing); },
    start() { dispatch("onCompositionStart"); },
    end() { dispatch("onCompositionEnd"); },
    flush() {
      act(() => {
        for (const [id, timer] of [...timers]) {
          timers.delete(id);
          timer.callback();
        }
      });
    },
    cancel() {
      const button = renderer.root.findAllByType("button").find((host: Host) => host.props.children === "Cancel");
      assert.ok(button);
      act(() => invoke(button, "onClick", {}));
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

for (const data of [
  { mode: "create" },
  { mode: "edit", sectionId: "synthetic", name: "Existing", emoji: "x" },
] satisfies SectionDialogMode[]) {
  test(`section ${data.mode} keeps the name and dialog open during composition Escape`, () => {
    const view = fixture(data);
    try {
      view.name("Draft name");
      view.start();
      assert.equal(view.key("Escape", true).prevented, false, "Escape must remain available to the IME");
      assert.deepEqual(view.events, [], "Composition Escape must not close or submit the section");
      assert.deepEqual(view.submissions, []);
      assert.equal(view.input().props.value, "Draft name");
      view.end();
      view.flush();
      view.key("Escape");
      assert.deepEqual(view.events, ["close"]);
    } finally { view.dispose(); }
  });

  for (const webkit of [false, true]) {
    test(`section ${data.mode} keeps Escape guarded until the ${webkit ? 5 : 0}ms composition-end timer`, () => {
      const view = fixture(data, webkit);
      try {
        view.name("Unchanged draft");
        view.start();
        view.end();
        view.key("Escape");
        assert.deepEqual(view.events, [], "Immediate post-composition Escape must not close the section");
        assert.equal(view.input().props.value, "Unchanged draft");
        assert.deepEqual([...view.timers.values()].map(timer => timer.delay), [webkit ? 5 : 0]);
        view.flush();
        view.key("Escape");
        assert.deepEqual(view.events, ["close"]);
        assert.deepEqual(view.submissions, []);
      } finally { view.dispose(); }
    });
  }

  test(`section ${data.mode} restarts composition without a stale dismissal timer`, () => {
    const view = fixture(data);
    try {
      view.start();
      view.end();
      view.start();
      view.flush();
      view.key("Escape");
      assert.deepEqual(view.events, [], "A prior composition-end timer must not end the new composition");
      view.end();
      view.flush();
      view.key("Escape");
      assert.deepEqual(view.events, ["close"]);
    } finally { view.dispose(); }
  });

  test(`section ${data.mode} preserves composing Enter, ordinary Enter and idle Escape`, () => {
    const view = fixture(data);
    try {
      view.name("  Submitted name  ");
      view.start();
      view.key("Enter", true);
      assert.deepEqual(view.events, []);
      view.end();
      view.flush();
      view.key("Enter");
      assert.equal(view.submissions.length, 1);
      assert.equal(view.submissions[0].name, "Submitted name");
      assert.equal(view.submissions[0].emoji, data.mode === "edit" ? data.emoji : undefined);
      assert.deepEqual(view.events, ["submit", "close"]);
    } finally { view.dispose(); }
    const idle = fixture(data);
    try {
      idle.key("Escape");
      assert.deepEqual(idle.events, ["close"]);
      assert.deepEqual(idle.submissions, []);
    } finally { idle.dispose(); }
  });

  test(`section ${data.mode} preserves explicit Cancel and clears its timer on unmount`, () => {
    const view = fixture(data);
    try {
      view.start();
      view.end();
      view.cancel();
      assert.deepEqual(view.events, ["close"]);
      assert.deepEqual(view.submissions, []);
    } finally { view.dispose(); }
    assert.equal(view.timers.size, 0);
  });
}
