import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as collapse from "./customSectionCollapse.ts";

type CollapseValue = readonly [ReadonlySet<string>, (id: string) => void];

function mountHook(saved: Map<string, string>) {
  let store: collapse.CustomSectionCollapse | undefined;
  const source = readFileSync(new URL("./useCustomSectionCollapse.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
  } });
  const exports: { useBuiltinSectionCollapse?: () => CollapseValue } = {};
  runInNewContext(outputText, { exports, console, require: (name: string) => {
    if (name === "react") return {
      useState: (initialize: () => collapse.CustomSectionCollapse) => [store ??= initialize()],
      useEffect: (effect: () => void) => effect(),
      useCallback: (callback: (id: string) => void) => callback,
      useSyncExternalStore: (_subscribe: unknown, snapshot: () => ReadonlySet<string>) => snapshot(),
    };
    if (name === "./customSectionCollapse") return collapse;
    if (name === "../lib/local-storage/subsystems") return { ROUTE_USER_STATE: { name: "route-user-state", sizeLimit: 1024 } };
    if (name === "../features/terminal/localStorage") return { subsystemStorage: () => ({
      async getItem(id: string) { return saved.get(id) ?? null; },
      async setItem(id: string, value: string) { saved.set(id, value); },
    }) };
    throw new Error(`Unexpected hook dependency: ${name}`);
  } });
  const render = exports.useBuiltinSectionCollapse;
  assert.ok(render);
  render();
  return {
    render,
    async settle() { assert.ok(store); await store.flush(); },
  };
}

test("production built-in hook restores both groups after remount and saves expansion", async () => {
  const saved = new Map([[collapse.CUSTOM_SECTION_COLLAPSE_ID, '["focus"]']]);
  const first = mountHook(saved);
  await first.settle();
  first.render()[1](collapse.PINNED_COLLAPSE_KEY);
  first.render()[1](collapse.MAIN_COLLAPSE_KEY);
  await first.settle();
  const second = mountHook(saved);
  await second.settle();
  assert.deepEqual([...second.render()[0]].sort(), [collapse.MAIN_COLLAPSE_KEY, collapse.PINNED_COLLAPSE_KEY].sort());
  second.render()[1](collapse.MAIN_COLLAPSE_KEY);
  await second.settle();
  const third = mountHook(saved);
  await third.settle();
  assert.deepEqual([...third.render()[0]], [collapse.PINNED_COLLAPSE_KEY]);
  assert.equal(saved.get(collapse.CUSTOM_SECTION_COLLAPSE_ID), '["focus"]');
});
