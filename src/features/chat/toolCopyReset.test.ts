import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
  fileName: "ToolRows.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);

type Target = "plan" | "subagent";
type Node = {
  type: unknown;
  props: Record<string, unknown>;
  findAll: (predicate: (node: Node) => boolean) => Node[];
};
const payloads = {
  plan: "# Literal plan\n\n- Keep approval unchanged.\n- Preserve `code`.\n",
  subagent: "First block\nSecond block\n",
};
const unrelated = () => { throw new Error("Unrelated tool-row branch executed"); };

async function fixture(target: Target, empty = false) {
  const writes: string[] = [];
  const pending: Array<() => void> = [];
  const timers = new Map<number, { at: number; callback: () => void }>();
  let now = 0, nextTimer = 0, toggles = 0, stopped = 0;
  const production: {
    ConductorToolRow?: React.ComponentType<ToolRowProps>;
    Lucide?: React.ComponentType<{ name: string }>;
    opensByDefault?: (tool: tools.ConductorTool) => boolean;
  } = {};
  runInNewContext(compiled.outputText, {
    exports: production,
    navigator: { clipboard: { writeText: (value: string) => {
      writes.push(value);
      return new Promise<void>((resolve) => { pending.push(resolve); });
    } } },
    setTimeout(callback: () => void, delay: number) {
      const id = ++nextTimer;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "./conductorTools.ts": return tools;
        case "./toolIconData.ts": return icons;
        case "./thinkingChip.ts": return { thinkingChipText };
        // Only unrelated presentation is stubbed; production row dispatch,
        // disclosure, payload selection, CopyIcon and React hooks stay real.
        case "./markdown.ts": return {
          Markdown: ({ text }: { text: string }) => React.createElement("pre", null, text),
          highlight: unrelated,
        };
        case "./LinkMenu.tsx": return { LinkWithMenu: unrelated };
        case "../../backend.ts": return { openUrl: unrelated };
        default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  assert.ok(production.ConductorToolRow && production.Lucide && production.opensByDefault);
  const tool: tools.ConductorTool = target === "plan"
    ? { name: "ExitPlanMode", input: { plan: empty ? "" : payloads.plan } }
    : { name: "Task", input: { subagent_type: "Explore", model: "sonnet", description: "Inspect literal output" } };
  function Scene() {
    const [open, setOpen] = React.useState(production.opensByDefault!(tool));
    return React.createElement(production.ConductorToolRow!, {
      tool, status: "done", isError: false, open,
      result: target === "subagent" && !empty ? "Rendered fallback must not be copied" : undefined,
      rawResult: target === "subagent" && !empty ? [{ text: "First block\n" }, { text: "Second block\n" }] : undefined,
      onToggle: () => { toggles++; setOpen((value) => !value); },
    });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const nodes = (className: string): Node[] => renderer.root.findAll((node: Node) =>
    typeof node.type === "string" && String(node.props.className ?? "").split(" ").includes(className));
  if (target === "subagent" && !empty) {
    const head = nodes("oc-tool-head")[0]!;
    assert.equal(typeof head.props.onClick, "function");
    await act(async () => { (head.props.onClick as () => void)(); });
  }
  const button = () => {
    const matches = nodes("oc-copy-icon");
    assert.equal(matches.length, 1, "Actual caller exposes one production CopyIcon");
    return matches[0]!;
  };
  return {
    writes, timers, nodes,
    get toggles() { return toggles; },
    get stopped() { return stopped; },
    copied() {
      const matches = button().findAll((node) => node.type === production.Lucide);
      assert.equal(matches.length, 1);
      return matches[0]!.props.name === "check";
    },
    async click() {
      await act(async () => {
        (button().props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation: () => { stopped++; } });
      });
    },
    async fulfill() {
      const resolve = pending.shift();
      assert.ok(resolve, "Production copy waits for a real pending clipboard Promise");
      await act(async () => { resolve(); });
    },
    async advanceTo(at: number) {
      assert.ok(at >= now);
      await act(async () => {
        now = at;
        for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
      });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const target of ["plan", "subagent"] as const) {
  test(`${target}: confirmation survives 1500 and 1999ms, then resets at 2000ms`, async () => {
    const f = await fixture(target);
    try {
      await f.click();
      assert.equal(f.copied(), false, "Pending clipboard writes do not confirm");
      assert.equal(f.timers.size, 0);
      await f.fulfill();
      assert.equal(f.copied(), true);
      await f.advanceTo(1499); assert.equal(f.copied(), true);
      await f.advanceTo(1500); assert.equal(f.copied(), true, "TOOL_COPY_RESET_MUST_NOT_FIRE_AT_1500");
      await f.advanceTo(1999); assert.equal(f.copied(), true);
      await f.advanceTo(2000); assert.equal(f.copied(), false);
      assert.equal(f.timers.size, 0);
      assert.deepEqual(f.writes, [payloads[target]]);
    } finally { await f.close(); }
  });

  test(`${target}: every successful copy retains its independent 2000ms reset`, async () => {
    const f = await fixture(target);
    try {
      await f.click(); await f.fulfill();
      await f.advanceTo(1000); await f.click(); await f.fulfill();
      assert.equal(f.timers.size, 2);
      await f.advanceTo(1999); assert.equal(f.copied(), true, "TOOL_COPY_FIRST_RESET_MUST_WAIT_UNTIL_2000");
      await f.advanceTo(2000); assert.equal(f.copied(), false);
      assert.equal(f.timers.size, 1);
      await f.advanceTo(2500); await f.click(); await f.fulfill();
      assert.equal(f.copied(), true);
      await f.advanceTo(2999); assert.equal(f.copied(), true);
      await f.advanceTo(3000); assert.equal(f.copied(), false, "The older successful copy still owns its reset");
      assert.equal(f.timers.size, 1);
      await f.advanceTo(4500); assert.equal(f.copied(), false);
      assert.equal(f.timers.size, 0);
      assert.deepEqual(f.writes, [payloads[target], payloads[target], payloads[target]]);
    } finally { await f.close(); }
  });

  test(`${target}: exact caller payload, propagation and delayed-fulfillment controls`, async () => {
    const f = await fixture(target);
    try {
      const initialToggles = f.toggles;
      await f.click();
      assert.equal(f.stopped, 1);
      assert.equal(f.toggles, initialToggles);
      assert.deepEqual(f.writes, [payloads[target]]);
      await f.advanceTo(2500);
      assert.equal(f.copied(), false);
      assert.equal(f.timers.size, 0);
      await f.fulfill();
      assert.equal(f.copied(), true);
      assert.equal(f.timers.size, 1);
      assert.equal(f.toggles, initialToggles);
    } finally { await f.close(); }
  });

  test(`${target}: absent caller payload exposes no copy button`, async () => {
    const f = await fixture(target, true);
    try {
      assert.equal(f.nodes("oc-copy-icon").length, 0);
      assert.deepEqual(f.writes, []);
      assert.equal(f.timers.size, 0);
    } finally { await f.close(); }
  });
}
