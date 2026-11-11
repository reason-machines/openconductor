import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Mode = "default" | "plan";
function deferred() {
  let resolve!: (value: Mode) => void;
  const promise = new Promise<Mode>((done) => { resolve = done; });
  return { resolve, promise };
}

function fixture() {
  const reads = new Map<string, ReturnType<typeof deferred>>();
  const writes: { chatId: string; mode: Mode; response: ReturnType<typeof deferred> }[] = [];
  const errors: string[] = [];
  const listeners = new Set<(event: { payload: { chatId: string; mode: string } }) => void>();
  const source = ts.transpileModule(readFileSync(new URL("./useLocalPlanMode.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(source, { exports, console, require(name: string) {
    if (name === "react") return React;
    if (name === "@tauri-apps/api/core") return { invoke(command: string, args: { chatId: string; mode: Mode }) {
      const response = deferred();
      if (command === "local_plan_mode_get") reads.set(args.chatId, response);
      else if (command === "local_plan_mode_set") writes.push({ ...args, response });
      else throw new Error("Unexpected IPC " + command);
      return response.promise;
    } };
    if (name === "@tauri-apps/api/event") return { listen: async (_event: string, deliver: (event: { payload: { chatId: string; mode: string } }) => void) => { listeners.add(deliver); return () => listeners.delete(deliver); } };
    throw new Error("Unexpected import " + name);
  } });
  const useMode = exports.useLocalPlanMode as (chatId: string, workspaceId: string, enabled: boolean, busy: boolean, onError: (message: string) => void) => { isPlanMode: boolean; disabled: boolean; onToggle: () => void } | undefined;
  const error = (message: string) => { errors.push(message); };
  function Host({ chatId }: { chatId: string }) {
    const mode = useMode(chatId, "workspace", true, false, error);
    return React.createElement("button", { disabled: !mode || mode.disabled, onClick: mode?.onToggle }, !mode ? "loading" : mode.isPlanMode ? "plan" : "default");
  }
  let renderer: ReturnType<typeof create>;
  return {
    reads, writes, errors,
    async mount(chatId: string) { await act(async () => { renderer = create(React.createElement(Host, { chatId })); }); },
    async select(chatId: string) { await act(async () => renderer.update(React.createElement(Host, { chatId }))); },
    async read(chatId: string, value: Mode) { await act(async () => { const response = reads.get(chatId); assert.ok(response); response.resolve(value); }); },
    async resolveWrite(index: number) { await act(async () => writes[index].response.resolve(writes[index].mode)); },
    capture: () => renderer.root.findByType("button").props.onClick as () => void,
    async click() { await act(async () => renderer.root.findByType("button").props.onClick()); },
    async call(callback: () => void) { await act(async () => callback()); },
    text: () => renderer.root.findByType("button").children.join(""),
    async event(chatId: string, mode: string) { await act(async () => { for (const fn of listeners) fn({ payload: { chatId, mode } }); }); },
    async dispose() { await act(async () => renderer.unmount()); },
  };
}

test("late mode reads cannot replace the selected chat's state", async () => {
  const f = fixture(); await f.mount("a");
  try { await f.select("b"); await f.read("b", "default"); await f.read("a", "plan"); assert.equal(f.text(), "default"); assert.deepEqual(f.errors, []); }
  finally { await f.dispose(); }
});

test("late mode saves stay bound to their original chat and switchback rehydrates", async () => {
  const f = fixture(); await f.mount("a");
  try {
    await f.read("a", "default"); await f.click(); assert.equal(f.writes[0].chatId, "a"); assert.equal(f.writes[0].mode, "plan");
    await f.select("b"); await f.read("b", "default"); await f.resolveWrite(0); assert.equal(f.text(), "default");
    await f.select("a"); await f.read("a", "plan"); assert.equal(f.text(), "plan");
  } finally { await f.dispose(); }
});

test("a stale toggle callback cannot mutate a chat after selection changes", async () => {
  const f = fixture(); await f.mount("a");
  try { await f.read("a", "default"); const stale = f.capture(); await f.select("b"); await f.read("b", "default"); await f.call(stale); assert.equal(f.writes.length, 0); assert.equal(f.text(), "default"); }
  finally { await f.dispose(); }
});

test("a committed plan exit event outranks an earlier mode read", async () => {
  const f = fixture(); await f.mount("a");
  try { await f.event("a", "default"); await f.read("a", "plan"); assert.equal(f.text(), "default"); await f.event("b", "plan"); assert.equal(f.text(), "default"); }
  finally { await f.dispose(); }
});
