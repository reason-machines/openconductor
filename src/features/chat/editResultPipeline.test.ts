import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { applyReasonPayload, reasonChat, startTurn, type ReasonPayload } from "./reason.ts";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import { diffForSave, restoreEvents } from "./persist.ts";
import { buildRows } from "./view.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const fixtureBytes = readFileSync(resolve(root, "evidence/chat/edit-result-diff/fixtures.json"));
assert.equal(createHash("sha256").update(fixtureBytes).digest("hex"), "7d600865d2019d247938172fef1d2c751087b9e17c1f3d525782f85e69f2e662");
interface Case {
  id: string;
  content: unknown;
  expected_old: string;
  expected_new: string;
  counts: { added: number; removed: number } | null;
  is_error?: boolean;
}
const cases: Case[] = JSON.parse(fixtureBytes.toString()).cases;
const produced: { id: string; payloads: ReasonPayload[] }[] = JSON.parse(execFileSync("bash", [resolve(root, "evidence/chat/edit-result-diff/run-producer.sh")], { encoding: "utf8", timeout: 180_000 }));
const at = new Date("2026-11-12T00:00:00Z");
type Node = { type: unknown; props: Record<string, unknown>; parent: Node | null; children: Array<Node | string>; findAll: (predicate: (node: Node) => boolean) => Node[] };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const lines = (node: Node): string[] => node.findAll((child) => typeof child.type === "string" && hasClass(child, "oc-code-line")).map(text);

function transcript(id: string): ChatTranscript {
  const native = produced.find((entry) => entry.id === id);
  assert.ok(native);
  const started = startTurn(reasonChat("edit-result-chat"), "", at);
  let state = started.state;
  let reduced = applyChatEvents(emptyTranscript(state.chatId), started.events);
  assert.ok(reduced.ok);
  let current = reduced.transcript;
  for (const payload of native.payloads) {
    const step = applyReasonPayload(state, payload, at);
    state = step.state;
    reduced = applyChatEvents(current, step.events);
    assert.ok(reduced.ok);
    current = reduced.transcript;
  }
  return current;
}

function restored(current: ChatTranscript): ChatTranscript {
  const batch = diffForSave(null, current);
  const result = applyChatEvents(emptyTranscript(current.sessionId), restoreEvents(current.sessionId, batch.upserts.map((row) => row.fullMessage)));
  assert.ok(result.ok);
  return result.transcript;
}

async function mount(current: ChatTranscript) {
  let now = 0, id = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const window = {
    innerWidth: 1024, innerHeight: 768,
    addEventListener(name: string, callback: (event: unknown) => void) { const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set); },
    removeEventListener(name: string, callback: (event: unknown) => void) { listeners.get(name)?.delete(callback); },
  };
  function load(path: string): Record<string, unknown> {
    const existing = cache.get(path);
    if (existing) return existing.exports;
    const module = { exports: {} };
    cache.set(path, module);
    const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
    });
    assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);
    runInNewContext(compiled.outputText, {
      module, exports: module.exports, window,
      setTimeout(run: () => void, delay: number) { const key = ++id; timers.set(key, { at: now + delay, run }); return key; },
      clearTimeout(key: number) { timers.delete(key); },
      require(name: string) {
        if (name === "./markdown.ts" || name === "./LinkMenu.tsx" || name === "../../backend.ts") return new Proxy({}, { get() { return () => { throw new Error(`Unrelated leaf invoked: ${name}`); }; } });
        return name.startsWith(".") ? load(resolve(dirname(path), name)) : dependencies(name);
      },
    }, { filename: path });
    return module.exports;
  }
  const tools = load(resolve(root, "src/features/chat/ToolRows.tsx"));
  const path = resolve(root, "src/features/chat/Transcript.tsx");
  const source = readFileSync(path, "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const part = ast.statements.find((statement: { name?: { text: string } }) => ts.isFunctionDeclaration(statement) && statement.name?.text === "Part");
  assert.ok(part, "mount the actual Transcript Part pass-through, not a hand-built props adapter");
  const compiled = ts.transpileModule(`${part.getText(ast)}\nexport { Part };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
  const production: Record<string, unknown> = {};
  runInNewContext(compiled.outputText, { exports: production, ...tools, require: dependencies }, { filename: path });
  const assistant = buildRows(current).find((row) => row.kind === "assistant");
  assert.ok(assistant?.kind === "assistant");
  const tool = assistant.parts.find((part) => part.kind === "tool");
  assert.ok(tool?.kind === "tool");
  function Scene() {
    const [open, setOpen] = React.useState(false);
    return React.createElement(production.Part, { part: tool, partKey: "edit", ctx: { isOpen: () => open, onToggle: () => setOpen(!open), toolNow: () => at.getTime() } });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene), { createNodeMock: () => ({ getBoundingClientRect: () => ({ left: 100, top: 600, right: 220, bottom: 620, width: 120, height: 20 }), contains: () => false }) }); });
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  async function event(node: Node, name: string, optional = false) {
    let target: Node | null = node;
    while (target && typeof target.props[name] !== "function") target = target.parent;
    const handler = target?.props[name];
    if (!optional) assert.equal(typeof handler, "function");
    if (typeof handler === "function") await act(async () => { handler({ pointerType: "mouse" }); });
  }
  return {
    all,
    header: () => all((node) => hasClass(node, "oc-tool-head"))[0]!,
    body: () => all((node) => hasClass(node, "oc-tool-content"))[0],
    preview: () => all((node) => node.props.role === "region" && node.props["aria-label"] === "File change preview"),
    counts: () => all((node) => hasClass(node, "oc-line-counts")).map(text),
    async expand() { await event(this.header(), "onClick"); },
    async hover() {
      await event(all((node) => node.type === "button" && hasClass(node, "oc-file-badge"))[0]!, "onPointerEnter", true);
      now += 150;
      for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); await act(async () => timer.run()); }
    },
    async close() { await act(async () => renderer.unmount()); assert.equal(timers.size, 0); assert.equal([...listeners.values()].reduce((sum, set) => sum + set.size, 0), 0); },
  };
}

test("actual native mapper preserves the colliding display-text control", () => {
  const object = produced[0]!.payloads.at(-1);
  const string = produced[1]!.payloads.at(-1);
  assert.ok(object?.type === "tool");
  assert.ok(string?.type === "tool");
  assert.equal(object.output, string.output);
});

for (const entry of cases) test(`native producer -> reducer -> persisted/live Transcript Part -> Edit: ${entry.id}`, async () => {
  const current = transcript(entry.id);
  for (const [label, state] of [["live", current], ["restored", restored(current)]] as const) {
    const view = await mount(state);
    try {
      assert.deepEqual(view.counts(), entry.counts ? [`${entry.counts.added}${entry.counts.removed}`] : [], `${label} selected-side counts`);
      const available = entry.expected_old.length > 0 || entry.expected_new.length > 0;
      assert.equal(view.header().props["aria-expanded"], available ? false : undefined);
      await view.hover();
      assert.equal(view.preview().length, available ? 1 : 0, `${label} hover availability`);
      if (available) {
        const expected = [...(entry.expected_old ? entry.expected_old.split("\n").map((line) => `-${line}`) : []), ...(entry.expected_new ? entry.expected_new.split("\n").map((line) => `+${line}`) : [])];
        assert.deepEqual(lines(view.preview()[0]!), expected, `${label} result-selected hover sides`);
        await view.expand();
        assert.ok(view.body());
        assert.deepEqual(lines(view.body()!), expected, `${label} expanded sides match hover`);
      } else { assert.equal(view.body(), undefined); }
      assert.equal(view.all((node) => hasClass(node, "tone-error")).length > 0 || view.all((node) => hasClass(node, "oc-error-chip")).length > 0, entry.is_error === true, `${label} separate error presentation`);
    } finally { await view.close(); }
  }
});
