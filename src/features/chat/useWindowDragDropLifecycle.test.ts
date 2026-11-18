// Exercise the actual hook with inert React/Tauri imports; never execute the
// retained Conductor renderer or read native files. See window-drop-lifecycle evidence.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const dependencies = createRequire(import.meta.url);
const ts = dependencies("typescript");
const root = resolve(process.env.USE_WINDOW_DRAG_DROP_SOURCE_ROOT ?? ".");
const hookPath = "src/features/chat/useWindowDragDrop.ts";
const javascript = ts.transpileModule(readFileSync(resolve(root, hookPath), "utf8"), {
  fileName: hookPath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

type Payload = { type: "enter" | "drop" | "leave"; paths?: string[]; position?: { x: number; y: number } };

function mount({ tauri = true, unavailable = false } = {}) {
  let state = false;
  let callback: ((event: { payload: Payload }) => void) | undefined;
  let effect: (() => (() => void) | undefined) | undefined;
  let resolveSubscription!: (unlisten: () => void) => void;
  let registrations = 0;
  let unlistens = 0;
  const drops: string[][] = [];
  const subscription = new Promise<() => void>((resolve) => { resolveSubscription = resolve; });
  const imports: Record<string, unknown> = {
    "react": {
      useState: (initial: boolean) => {
        state = initial;
        return [state, (value: boolean) => { state = value; }];
      },
      useRef: (current: unknown) => ({ current }),
      useEffect: (run: typeof effect) => { effect = run; },
    },
    "@tauri-apps/api/webview": {
      getCurrentWebview: () => {
        if (unavailable) throw Error("no live webview");
        return {
          onDragDropEvent: (handler: typeof callback) => {
            registrations++;
            callback = handler;
            return subscription;
          },
        };
      },
    },
    "@tauri-apps/plugin-fs": { readFile: () => { throw Error("lifecycle test must not read native files"); } },
    "../../backend": { inTauri: () => tauri },
  };
  const mod = { exports: {} as { useWindowDragDrop: (onDrop: (paths: string[]) => void) => boolean } };
  const load = runInNewContext(
    `(function(require, module, exports) {\n${javascript}\n})`,
    { console },
    { filename: hookPath },
  );
  load((name: string) => {
    if (!(name in imports)) throw Error(`unexpected import: ${name}`);
    return imports[name];
  }, mod, mod.exports);
  mod.exports.useWindowDragDrop((paths) => drops.push([...paths]));
  assert.ok(effect, "the actual hook installs its effect");
  const cleanup = effect();
  return {
    state: () => state,
    registrations: () => registrations,
    unlistens: () => unlistens,
    drops,
    emit: (payload: Payload) => { assert.ok(callback, "registered real hook callback"); callback({ payload }); },
    unmount: () => cleanup?.(),
    resolve: async () => { resolveSubscription(() => { unlistens++; }); await subscription; await Promise.resolve(); },
  };
}

test("original LNi enter contract: an empty native path list does not advertise a file drop", () => {
  const hook = mount();
  hook.emit({ type: "enter", paths: [], position: { x: 0, y: 0 } });
  assert.equal(hook.state(), false);
  assert.deepEqual(hook.drops, []);
});

test("original LNi cleanup contract: unmount before registration resolves still unsubscribes once", async () => {
  const hook = mount();
  hook.unmount();
  assert.equal(hook.unlistens(), 0, "pending subscription has no handle yet");
  await hook.resolve();
  assert.equal(hook.unlistens(), 1, "the resolved native listener must not survive its owner");
});

test("control: nonempty enter shows overlay and leave clears it", () => {
  const hook = mount();
  hook.emit({ type: "enter", paths: ["/fixture/a.txt"] });
  assert.equal(hook.state(), true);
  hook.emit({ type: "leave" });
  assert.equal(hook.state(), false);
  assert.deepEqual(hook.drops, []);
});

test("control: drop clears overlay and forwards the exact nonempty path list once", () => {
  const hook = mount();
  hook.emit({ type: "enter", paths: ["/fixture/a.txt"] });
  hook.emit({ type: "drop", paths: ["/fixture/a.txt", "/fixture/b.txt"] });
  assert.equal(hook.state(), false);
  assert.deepEqual(hook.drops, [["/fixture/a.txt", "/fixture/b.txt"]]);
});

test("control: empty drop clears overlay without attaching", () => {
  const hook = mount();
  hook.emit({ type: "enter", paths: ["/fixture/a.txt"] });
  hook.emit({ type: "drop", paths: [] });
  assert.equal(hook.state(), false);
  assert.deepEqual(hook.drops, []);
});

test("control: registration resolved before unmount unsubscribes once", async () => {
  const hook = mount();
  await hook.resolve();
  hook.unmount();
  assert.equal(hook.unlistens(), 1);
});

test("control: a non-Tauri surface does not subscribe", () => {
  const hook = mount({ tauri: false });
  assert.equal(hook.registrations(), 0);
  assert.equal(hook.state(), false);
  hook.unmount();
});

test("control: unavailable webview exits without a listener or native read", () => {
  const hook = mount({ unavailable: true });
  assert.equal(hook.registrations(), 0);
  assert.equal(hook.state(), false);
  hook.unmount();
});
