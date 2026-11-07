import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { DEFAULT_SETTINGS, type Settings } from "../types.ts";

// Run the production component's effects with controlled IPC and timers, without a desktop or DOM.
const source = ts.createSourceFile("ReasonTab.tsx", readFileSync(new URL("./ReasonTab.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "DefaultModelRows");
assert.ok(component);
const compiled = ts.transpileModule(`${component.getText(source)}\nexports.render = DefaultModelRows;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

type Model = { value: string; name: string };
type Effect = { deps: unknown[]; cleanup?: () => void };

function fixture(workspace: string | null) {
  let settings: Settings = { ...DEFAULT_SETTINGS, reason: { workspace } };
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const effects: Effect[] = [];
  const timers = new Map<number, () => void>();
  const requests: { workspace: string | null; fresh: boolean; resolve: (models: Model[]) => void }[] = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0, timerId = 0;
  let pending: (() => void)[] = [];
  let values: string[] = [];
  const exported: { render?: (props: { settings: Settings; setDefault: () => void }) => void } = {};
  const jsx = (type: unknown, props: { "aria-label"?: string; value?: string; children?: unknown }) => {
    if (type === "select" && props["aria-label"] === "Default Reason model") {
      values = [];
      const visit = (child: unknown): void => {
        if (Array.isArray(child)) child.forEach(visit);
        else if (child && typeof child === "object" && "value" in child && typeof child.value === "string") values.push(child.value);
      };
      visit(props.children);
    }
    return props;
  };
  runInNewContext(compiled, {
    exports: exported,
    require: (name: string) => {
      assert.equal(name, "react/jsx-runtime");
      return { jsx, jsxs: jsx };
    },
    Row: "row", REASON_EFFORT_OPTIONS: [],
    useState(initial: unknown) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value: unknown) => { states[index] = value; }];
    },
    useRef(initial: unknown) {
      const index = refIndex++;
      return refs[index] ??= { current: initial };
    },
    useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
      const index = effectIndex++;
      const previous = effects[index];
      if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      pending.push(() => {
        previous?.cleanup?.();
        effects[index] = { deps, cleanup: effect() };
      });
    },
    setTimeout(callback: () => void) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    reasonModels(fresh: boolean) {
      return new Promise<Model[]>((resolve) => requests.push({ workspace: settings.reason?.workspace ?? null, fresh, resolve }));
    },
  });
  function render() {
    stateIndex = refIndex = effectIndex = 0;
    exported.render?.({ settings, setDefault() {} });
    const queued = pending; pending = [];
    queued.forEach((effect) => effect());
  }
  render();
  return {
    requests,
    values: () => values,
    update(next: Partial<Settings>) { settings = { ...settings, ...next }; render(); },
    timers() { const queued = [...timers.values()]; timers.clear(); queued.forEach((callback) => callback()); },
    async answer(index: number, value: string | null) {
      assert.ok(requests[index], `model request ${index} exists`);
      requests[index].resolve(value === null ? [] : [{ value, name: value }]);
      await Promise.resolve();
      render();
    },
    render,
    unmount() { effects.forEach((effect) => effect.cleanup?.()); },
  };
}

test("selecting a workspace after an unbound model request loads its models without remounting", async () => {
  const f = fixture(null);
  f.timers();
  await f.answer(0, null);
  assert.deepEqual(f.values(), [""]);
  f.update({ reason: { workspace: "alpha" } });
  f.timers();
  assert.equal(f.requests.length, 2, "workspace selection must refetch the empty model picker");
  assert.equal(f.requests[1].workspace, "alpha");
  assert.equal(f.requests[1].fresh, true, "workspace selection bypasses the previous model cache");
  await f.answer(1, "alpha-model");
  assert.deepEqual(f.values(), ["", "alpha-model"]);
  f.unmount();
});

test("switching workspaces replaces options and ignores a late previous-workspace response", async () => {
  const f = fixture("alpha");
  f.timers();
  f.update({ reason: { workspace: "beta" } });
  f.timers();
  assert.equal(f.requests.length, 2, "workspace switches must request that workspace's models");
  assert.equal(f.requests[1].workspace, "beta");
  assert.equal(f.requests[1].fresh, true);
  await f.answer(1, "beta-model");
  await f.answer(0, "alpha-model");
  assert.deepEqual(f.values(), ["", "beta-model"]);
  f.update({ reason: { workspace: "gamma" } });
  f.render();
  assert.deepEqual(f.values(), [""], "old workspace options are cleared while the new list loads");
  f.timers();
  await f.answer(2, "gamma-model");
  assert.deepEqual(f.values(), ["", "gamma-model"]);
  f.unmount();
});

test("executable changes still reload models; choosing a model or effort does not", async () => {
  const f = fixture("alpha");
  f.timers();
  await f.answer(0, "original-model");
  f.update({ reason: { workspace: "alpha", model: "original-model", reasoning_effort: "high" } });
  f.timers();
  assert.equal(f.requests.length, 1);
  f.update({ reason_executable_path: "/custom/reason" });
  f.timers();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].fresh, true);
  await f.answer(1, "custom-model");
  assert.ok(f.values().includes("custom-model"));
  f.unmount();
});
