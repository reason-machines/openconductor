import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { MAX_INLINE_TEXT_BYTES, restoreComposerAttachments, type ComposerAttachment } from "./composerAttachments.ts";
import { ComposerSession } from "./composerSession.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type RenderNode = { type: unknown; props: Record<string, unknown>; parent: RenderNode | null; children: Array<RenderNode | string> };
const content = (node: RenderNode | string): string => typeof node === "string" ? node : node.children.map(content).join("");
const attachment = { name: ".context/attachments/abc123/notes.txt", label: "notes.txt", text: "Original text <script>never execute</script>\nsecond line", preview: "text" } satisfies ComposerAttachment;

function fixture(initial: readonly ComposerAttachment[] = [attachment]) {
  let now = 0;
  let timerId = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  const removed: ComposerAttachment[] = [];
  const props = { attachments: initial, editorEpoch: 0, onRemove: (item: ComposerAttachment) => removed.push(item) };
  let chipModule: { exports: Record<string, unknown> } | undefined;
  const globals = {
    document: { body: {} }, window: { innerWidth: 1024, innerHeight: 768 },
    setTimeout: (run: () => void, delay: number) => { const id = ++timerId; timers.set(id, { at: now + delay, run }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
  };
  function javascript(source: string, fileName: string) {
    return ts.transpileModule(source, { fileName, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  }
  function require(name: string) {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    if (name === "react-dom") return { createPortal: (children: unknown) => children };
    if (name.endsWith(".css")) return {};
    throw new Error(`Unexpected preview dependency ${name}`);
  }
  function lazyChip(componentProps: unknown) {
    if (!chipModule) {
      chipModule = { exports: {} };
      const path = resolve("src/features/chat/ComposerAttachmentChip.tsx");
      const compiled = javascript(readFileSync(path, "utf8"), path);
      runInNewContext(`(function(require,module,exports){${compiled}\n})`, globals, { filename: path })(require, chipModule, chipModule.exports);
    }
    return React.createElement(chipModule.exports.ComposerAttachmentChip, componentProps);
  }
  const workspace = readFileSync("src/components/WorkspaceView.tsx", "utf8");
  const start = workspace.indexOf("attachments.map((a) => (");
  const end = workspace.indexOf("))}", start);
  assert.ok(start >= 0 && end > start, "actual WorkspaceView attachment consumer must be present");
  const rows = workspace.slice(start, end + 2);
  const module = { exports: {} as Record<string, unknown> };
  const wrapper = `export function Rows({attachments,editorEpoch,onRemove}) { const attachmentPreviewEpoch=editorEpoch; const removeAttachment=onRemove; return <> {${rows}} </>; }`;
  runInNewContext(`(function(require,module,exports){${javascript(wrapper, "Rows.tsx")}\n})`, { ComposerAttachmentChip: lazyChip }, { filename: "actual-attachment-consumer.tsx" })(require, module, module.exports);
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(module.exports.Rows, props), {
      createNodeMock: () => ({ getBoundingClientRect: () => ({ left: 100, top: 600, width: 300, height: 200 }) }),
    });
  });
  const all = (predicate: (node: RenderNode) => boolean): RenderNode[] => renderer.root.findAll((node: RenderNode) => typeof node.type === "string" && predicate(node));
  const chips = () => all((node) => String(node.props.className).split(" ").includes("composer-attachment"));
  const preview = () => all((node) => node.props["aria-label"] === "Text attachment preview");
  function event(node: RenderNode, name: string) {
    const callback = node.props[name];
    if (typeof callback === "function") act(() => callback({ pointerType: "mouse" }));
  }
  function tick(ms: number) {
    const end = now + ms;
    for (;;) {
      const next = [...timers].filter(([, entry]) => entry.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); act(() => next[1].run());
    }
    now = end;
  }
  return {
    all, chips, preview, event, tick, removed,
    hover() { event(chips()[0], "onPointerEnter"); tick(150); },
    update(next: Partial<typeof props>) { Object.assign(props, next); act(() => renderer.update(React.createElement(module.exports.Rows, props))); },
    close() { act(() => renderer.unmount()); assert.equal(timers.size, 0, "unmount cancels all preview timers"); },
  };
}

test("ordinary draft chips do not open eagerly", () => {
  const f = fixture(); try { assert.equal(f.preview().length, 0); } finally { f.close(); }
});

test("actual draft chip opens after 150ms, not before", () => {
  const f = fixture(); try {
    f.event(f.chips()[0], "onPointerEnter"); f.tick(149); assert.equal(f.preview().length, 0);
    f.tick(1); assert.equal(f.preview().length, 1);
    assert.ok(content(f.preview()[0]).includes(attachment.text));
  } finally { f.close(); }
});

test("leaving before the open delay never opens the preview", () => {
  const f = fixture(); try {
    f.event(f.chips()[0], "onPointerEnter"); f.tick(100); f.event(f.chips()[0], "onPointerLeave"); f.tick(1000);
    assert.equal(f.preview().length, 0);
  } finally { f.close(); }
});

test("the 100ms close delay preserves pointer travel into the card", () => {
  const f = fixture(); try {
    f.hover(); assert.equal(f.preview().length, 1);
    f.event(f.chips()[0], "onPointerLeave"); f.tick(99); assert.equal(f.preview().length, 1);
    f.event(f.preview()[0], "onPointerEnter"); f.tick(1000); assert.equal(f.preview().length, 1);
    f.event(f.preview()[0], "onPointerLeave"); f.tick(100); assert.equal(f.preview().length, 0);
  } finally { f.close(); }
});

test("an editor interaction epoch dismisses visible preview without changing attachment", () => {
  const f = fixture(); try {
    f.hover(); assert.equal(f.preview().length, 1);
    f.update({ editorEpoch: 1 }); assert.equal(f.preview().length, 0);
    assert.ok(content(f.chips()[0]).includes("notes.txt")); assert.deepEqual(f.removed, []);
  } finally { f.close(); }
});

test("an editor epoch also cancels an outstanding delayed open", () => {
  const f = fixture(); try {
    f.event(f.chips()[0], "onPointerEnter"); f.tick(100); f.update({ editorEpoch: 1 }); f.tick(1000);
    assert.equal(f.preview().length, 0);
  } finally { f.close(); }
});

test("replacement content cannot leave the previous text visible", () => {
  const f = fixture(); try {
    f.hover(); assert.equal(f.preview().length, 1);
    f.update({ attachments: [{ ...attachment, text: "replacement" }] }); assert.equal(f.preview().length, 0);
    f.hover(); assert.equal(f.preview().length, 1); assert.ok(content(f.preview()[0]).includes("replacement"));
  } finally { f.close(); }
});

test("preview text remains text, never an executable HTML node", () => {
  const f = fixture(); try {
    f.hover(); assert.equal(f.preview().length, 1);
    assert.equal(f.all((node) => node.type === "script" || node.props.dangerouslySetInnerHTML !== undefined).length, 0);
    assert.ok(content(f.preview()[0]).includes("<script>never execute</script>"));
  } finally { f.close(); }
});

test("historical or generic chips are not mistaken for original text", () => {
  const { preview: _preview, ...legacy } = attachment;
  const f = fixture([legacy]); try { f.hover(); assert.equal(f.preview().length, 0); } finally { f.close(); }
});

test("the original remove action retains its exact attachment", () => {
  const f = fixture(); try {
    const remove = f.all((node) => node.type === "button" && node.props["aria-label"] === "Remove notes.txt")[0];
    f.event(remove, "onClick"); assert.deepEqual(f.removed, [attachment]);
  } finally { f.close(); }
});

test("unmount cancels pending open instead of publishing after departure", () => {
  const f = fixture(); f.event(f.chips()[0], "onPointerEnter"); f.tick(100); f.close(); f.tick(1000);
});

test("typed text metadata survives the existing persisted-chip boundary", () => {
  assert.deepEqual(restoreComposerAttachments([attachment]), [attachment]);
});

test("unknown preview metadata does not turn a generic record into text", () => {
  const { preview: _preview, ...legacy } = attachment;
  assert.deepEqual(restoreComposerAttachments([{ ...legacy, preview: "image" }]), [legacy]);
});

test("actual file intake marks exact inline text, not just the display filename", async () => {
  const session = new ComposerSession("preview-text", { async load() { return ""; }, async save() { return true; }, async clear() {} });
  await session.connect();
  try {
    const bytes = new TextEncoder().encode("hello\noriginal bytes");
    await session.attach([{ name: "notes.txt", size: bytes.length, async arrayBuffer() { return bytes.buffer; } }]);
    assert.equal(session.snapshot().attachments[0]?.text, "hello\noriginal bytes");
    assert.equal(session.snapshot().attachments[0]?.preview, "text");
  } finally { session.disconnect(); }
});

test("actual file intake does not label binary, invalid UTF-8 or large placeholders as original text", async () => {
  const session = new ComposerSession("preview-nontext", { async load() { return ""; }, async save() { return true; }, async clear() {} });
  await session.connect();
  try {
    const inputs = [new Uint8Array([0, 1]), new Uint8Array([0xff]), new Uint8Array(MAX_INLINE_TEXT_BYTES + 1).fill(65)];
    await session.attach(inputs.map((bytes, index) => ({ name: `file-${index}.txt`, size: bytes.length, async arrayBuffer() { return bytes.buffer; } })));
    assert.equal(session.snapshot().attachments.length, 3);
    for (const chip of session.snapshot().attachments) {
      assert.equal(chip.preview, undefined);
      assert.match(chip.text, /not shown here/);
    }
  } finally { session.disconnect(); }
});
