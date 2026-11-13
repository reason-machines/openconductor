import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { SlashMatch } from "./slashCommands.ts";
import type { MentionItem } from "./fileMentions.ts";
import * as slashCommands from "./slashCommands.ts";
import * as fileMentions from "./fileMentions.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const slashItems: SlashMatch[] = ["clear", "restart", "compact"].map((name) => ({
  command: { name, description: name, argumentHint: "", effect: "agent", supportedAgents: ["claude"] },
  indices: [],
}));
const mentionItems: MentionItem[] = [
  { kind: "terminal" },
  { kind: "add-directory" },
  { kind: "file", match: {
    relative_path: "src/entry.ts", match_indices: [], score: 0,
    file: { name: "entry.ts", is_directory: false, path: "/workspace/src/entry.ts" },
  } },
];

type Menu = "slash" | "mention";

function fixture(kind: Menu) {
  const listeners = new Map<EventListenerOrEventListenerObject, { once: boolean }>();
  const doc = new EventTarget();
  const document = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) {
      assert.equal(type, "mousemove");
      listeners.set(listener, { once: options?.once ?? false });
      doc.addEventListener(type, listener, options);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      assert.equal(type, "mousemove");
      listeners.delete(listener);
      doc.removeEventListener(type, listener);
    },
  };
  const modules = new Map<string, Record<string, unknown>>();
  function load(name: string): Record<string, unknown> {
    const cached = modules.get(name);
    if (cached) return cached;
    const exports: Record<string, unknown> = {};
    modules.set(name, exports);
    const source = readFileSync(new URL(name, import.meta.url), "utf8");
    const javascript = ts.transpileModule(source, {
      fileName: name,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(javascript, {
      exports, document,
      require(path: string) {
        if (path === "react" || path === "react/jsx-runtime") return dependencies(path);
        if (path === "./slashCommands.ts") return slashCommands;
        if (path === "./fileMentions.ts") return fileMentions;
        if (path === "./useSuggestionPointer.ts") return load(path);
        if (path === "../../components/FileIcons") return { FileTypeIcon: () => null, FolderTypeIcon: () => null };
        if (path === "../../components/Icons") return { TerminalIcon: () => null };
        throw new Error(`Unexpected suggestion dependency: ${path}`);
      },
    });
    return exports;
  }
  const component = load(kind === "slash" ? "./SlashMenu.tsx" : "./FileMentionMenu.tsx")[kind === "slash" ? "SlashMenu" : "FileMentionMenu"];
  assert.equal(typeof component, "function");
  const changes: number[] = [];
  const picked: unknown[] = [];
  let focused = 0;
  let enabled = true;
  let hasQuery = false;
  let renderer: ReturnType<typeof create>;
  function render() {
    const matches = enabled ? kind === "slash" ? slashItems : mentionItems : [];
    const element = React.createElement(component, { matches, focused, hasQuery, onFocus: (index: number) => changes.push(index), onPick: (item: unknown) => picked.push(item) });
    if (renderer) renderer.update(element);
    else renderer = create(element, { createNodeMock: () => ({ querySelector: () => ({ scrollIntoView() {} }) }) });
  }
  act(render);
  const rows = () => renderer.root.findAllByProps({ role: "option" });
  function moveDocument() {
    doc.dispatchEvent(new Event("mousemove"));
    for (const [listener, options] of listeners) if (options.once) listeners.delete(listener);
  }
  return {
    changes, picked,
    outsideMove() { act(moveDocument); },
    enter(index: number) {
      act(() => {
        rows()[index].props.onMouseEnter?.();
        rows()[index].props.onMouseMove?.();
        moveDocument();
      });
    },
    moveInside(index: number) {
      act(() => {
        rows()[index].props.onMouseMove?.();
        moveDocument();
      });
    },
    pick(index: number) {
      let prevented = false;
      act(() => rows()[index].props.onMouseDown({ preventDefault() { prevented = true; } }));
      assert.equal(prevented, true, "picking keeps focus in the editor");
    },
    select(index: number) { act(() => { focused = index; render(); }); },
    setEnabled(value: boolean) { act(() => { enabled = value; render(); }); },
    setQuery(value: boolean) { act(() => { hasQuery = value; render(); }); },
    selected() { return rows().map((row: { props: { "aria-selected": boolean } }) => row.props["aria-selected"]); },
    expectedPick(index: number) { return kind === "slash" ? slashItems[index].command : mentionItems[index]; },
    close() { act(() => renderer.unmount()); assert.equal(listeners.size, 0, "unmount leaves no document movement subscription"); },
  };
}

for (const kind of ["slash", "mention"] satisfies Menu[]) {
  test(`${kind}: initial pointer entry preserves keyboard highlight until movement is ready`, () => {
    const f = fixture(kind);
    try { f.enter(1); assert.deepEqual(f.changes, []); } finally { f.close(); }
  });

  test(`${kind}: a fresh row entry after outside movement selects that row`, () => {
    const f = fixture(kind);
    try { f.outsideMove(); f.enter(1); assert.deepEqual(f.changes, [1]); } finally { f.close(); }
  });

  test(`${kind}: movement within the hovered row does not overwrite a later keyboard selection`, () => {
    const f = fixture(kind);
    try {
      f.outsideMove(); f.enter(1); f.select(2); f.moveInside(1);
      assert.deepEqual(f.changes, [1]);
      assert.deepEqual(f.selected(), [false, false, true]);
    } finally { f.close(); }
  });

  test(`${kind}: entering the selected row does not issue a redundant selection`, () => {
    const f = fixture(kind);
    try { f.outsideMove(); f.enter(0); assert.deepEqual(f.changes, []); } finally { f.close(); }
  });

  test(`${kind}: picking before pointer readiness still chooses the exact item once`, () => {
    const f = fixture(kind);
    try {
      f.pick(2); assert.equal(f.picked.length, 1); assert.equal(f.picked[0], f.expectedPick(2));
      assert.deepEqual(f.changes, []);
    } finally { f.close(); }
  });

  test(`${kind}: picking after pointer readiness keeps the exact existing action`, () => {
    const f = fixture(kind);
    try {
      f.outsideMove(); f.pick(1); assert.equal(f.picked.length, 1); assert.equal(f.picked[0], f.expectedPick(1));
      assert.deepEqual(f.changes, []);
    } finally { f.close(); }
  });

  test(`${kind}: re-enabling an empty menu resets pointer readiness`, () => {
    const f = fixture(kind);
    try {
      f.outsideMove(); f.setEnabled(false); f.setEnabled(true); f.enter(1);
      assert.deepEqual(f.changes, []);
    } finally { f.close(); }
  });

  test(`${kind}: query presentation updates do not reset an already-ready pointer`, () => {
    const f = fixture(kind);
    try { f.outsideMove(); f.setQuery(true); f.enter(2); assert.deepEqual(f.changes, [2]); } finally { f.close(); }
  });

  test(`${kind}: external keyboard selection updates highlighting without pointer side effects`, () => {
    const f = fixture(kind);
    try { f.select(2); assert.deepEqual(f.selected(), [false, false, true]); assert.deepEqual(f.changes, []); } finally { f.close(); }
  });

  test(`${kind}: unmount before movement removes the pending document listener`, () => {
    const f = fixture(kind);
    f.close();
    f.outsideMove();
    assert.deepEqual(f.changes, []);
  });
}
