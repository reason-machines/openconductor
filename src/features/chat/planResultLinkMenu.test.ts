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
import { highlight, Markdown } from "./markdown.ts";
import { thinkingChipText } from "./thinkingChip.ts";

// The complete production rows, Markdown renderer and LinkWithMenu execute.
// Only host clipboard/backend and the DOM-only menu portal are test adapters.
// Retained original default/tufte styles share pEi/cEi/EQ. The current plan has
// one Markdown pipeline, not two style implementations; this is not CSS proof.
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
type Node = {
  type: unknown;
  props: Record<string, unknown>;
  children: Array<Node | string>;
};
const textOf = (node: Node | string): string => typeof node === "string" ? node : node.children.map(textOf).join("");
const compiled = (file: string) => {
  const result = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);
  return result.outputText;
};
const rowCode = compiled("./ToolRows.tsx"), linkCode = compiled("./LinkMenu.tsx");

async function fixture(initialPlan: string, options: { reject?: boolean; status?: ToolRowProps["status"]; isError?: boolean } = {}) {
  const copied: string[] = [], directOpened: string[] = [], openedFiles: string[] = [], planCopies: string[] = [];
  const notices: Array<[string, string]> = [];
  const timers: Array<{ delay: number; callback: () => void }> = [];
  let toggles = 0, plan = initialPlan;
  const links: Partial<typeof import("./LinkMenu.tsx")> = {};
  runInNewContext(linkCode, {
    exports: links,
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "../openIn/apps.ts": return { copyText: async (href: string) => {
          copied.push(href);
          if (options.reject) throw new Error("Fixture clipboard rejection");
        } };
        case "../../components/menu/ContextMenu": return {
          ContextMenu: ({ at, label, onClose, children }: { at: { x: number; y: number }; label: string; onClose: () => void; children?: React.ReactNode }) =>
            React.createElement("div", { role: "menu", "aria-label": label, "data-x": at.x, "data-y": at.y },
              children, React.createElement("button", { "data-dismiss": true, onClick: onClose }, "Dismiss")),
          MenuItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect: () => void }) =>
            React.createElement("button", { role: "menuitem", onClick: onSelect }, children),
        };
        case "../../components/menu/menuIcons": return { CopyIcon: () => null };
        default: throw new Error(`Unexpected LinkMenu dependency ${name}`);
      }
    },
  }, { filename: "LinkMenu.tsx" });
  const rows: Partial<typeof import("./ToolRows.tsx")> = {};
  runInNewContext(rowCode, {
    exports: rows,
    navigator: { clipboard: { writeText: async (value: string) => { planCopies.push(value); } } },
    setTimeout(callback: () => void, delay: number) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() { throw new Error("Unexpected plan-copy timer cancellation"); },
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "./conductorTools.ts": return tools;
        case "./toolIconData.ts": return icons;
        case "./markdown.ts": return { Markdown, highlight };
        case "./thinkingChip.ts": return { thinkingChipText };
        case "./LinkMenu.tsx": return links;
        case "../../backend.ts": return { openUrl: async (href: string) => { directOpened.push(href); } };
        default: throw new Error(`Unexpected ToolRows dependency ${name}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  assert.ok(rows.ConductorToolRow && rows.opensByDefault && links.LinkMenuNotify);
  const Row = rows.ConductorToolRow, Notify = links.LinkMenuNotify.Provider;
  function Scene() {
    const tool: tools.ConductorTool = { name: "ExitPlanMode", input: { plan } };
    const [open, setOpen] = React.useState(rows.opensByDefault!(tool));
    return React.createElement(Notify, { value: (kind: string, message: string) => { notices.push([kind, message]); } },
      React.createElement(Row, {
        tool, status: options.status ?? "done", isError: options.isError ?? false, open,
        result: "[Wrong flattened result](https://invalid.example/result)",
        rawResult: [{ text: "[Wrong structured result](https://invalid.example/raw)" }],
        workspacePath: "/workspace", onOpenFile: (path: string) => { openedFiles.push(path); },
        onToggle: () => { toggles++; setOpen((value) => !value); },
      }));
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const withClass = (className: string) => all((node) => String(node.props.className ?? "").split(" ").includes(className));
  async function event(node: Node, name: string, payload: Record<string, unknown> = {}) {
    assert.equal(typeof node.props[name], "function", `Production ${name} callback exists`);
    await act(async () => { await (node.props[name] as (value: Record<string, unknown>) => unknown)(payload); });
  }
  return {
    copied, directOpened, openedFiles, planCopies, notices, timers, all, withClass, event,
    get toggles() { return toggles; },
    anchors: () => all((node) => node.type === "a"),
    head: () => withClass("oc-tool-head")[0]!,
    async toggle() { await event(this.head(), "onClick"); },
    async update(next: string) { plan = next; await act(async () => { renderer.update(React.createElement(Scene)); }); },
    async menu(this: { anchors: () => Node[] }, anchor = this.anchors()[0]!) {
      assert.equal(typeof anchor.props.onContextMenu, "function", "PLAN_RESULT_LINK_MUST_EXPOSE_CUSTOM_MENU");
      let prevented = 0;
      await event(anchor, "onContextMenu", { clientX: 40, clientY: 50, preventDefault: () => { prevented++; } });
      assert.equal(prevented, 1);
      const menus = all((node) => node.props.role === "menu");
      assert.equal(menus.length, 1); assert.equal(menus[0]!.props["aria-label"], "Link actions");
      assert.equal(menus[0]!.props["data-x"], 40); assert.equal(menus[0]!.props["data-y"], 50);
      const items = all((node) => node.props.role === "menuitem");
      assert.equal(items.length, 1); assert.equal(textOf(items[0]!), "Copy link address");
      return items[0]!;
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const href of ["http://example.com/a?q=one&b=two#part", "https://example.net/b?q=two#end"]) {
  test(`plan custom menu copies the exact address ${href}`, async () => {
    const f = await fixture(`Inspect [reference](${href}) before proceeding.`);
    try {
      assert.equal(f.head().props["aria-expanded"], true);
      assert.equal(f.anchors().length, 1); assert.equal(f.anchors()[0]!.props.href, href);
      await f.event(await f.menu(), "onClick");
      assert.deepEqual(f.copied, [href]);
      assert.deepEqual(f.notices, [["info", "Copied address to clipboard"]]);
      assert.deepEqual(f.directOpened, []); assert.deepEqual(f.planCopies, []);
      assert.equal(f.toggles, 0); assert.equal(f.head().props["aria-expanded"], true);
    } finally { await f.close(); }
  });
}

test("plan inline-code URL uses the same custom link menu", async () => {
  const href = "https://example.com/code?q=exact#fragment";
  const f = await fixture(`Inspect \`${href}\`.`);
  try {
    assert.equal(f.anchors().length, 1); assert.equal(f.anchors()[0]!.props.href, href);
    await f.event(await f.menu(), "onClick");
    assert.deepEqual(f.copied, [href]); assert.deepEqual(f.directOpened, []); assert.equal(f.toggles, 0);
  } finally { await f.close(); }
});

test("plan custom menu preserves clipboard-rejection feedback without navigation", async () => {
  const href = "https://example.com/rejected?q=one#part";
  const f = await fixture(`[reference](${href})`, { reject: true });
  try {
    await f.event(await f.menu(), "onClick");
    assert.deepEqual(f.copied, [href]);
    assert.deepEqual(f.notices, [["error", "Failed to copy to clipboard"]]);
    assert.deepEqual(f.directOpened, []); assert.deepEqual(f.planCopies, []); assert.equal(f.toggles, 0);
  } finally { await f.close(); }
});

test("updated plan reopens with the current link address, not stale result data", async () => {
  const first = "https://example.com/first", next = "https://example.net/next?q=two#updated";
  const f = await fixture(`[first](${first})`);
  try {
    await f.toggle(); assert.equal(f.anchors().length, 0);
    await f.update(`[next](${next})`); assert.equal(f.anchors().length, 0);
    await f.toggle(); assert.equal(f.anchors().length, 1);
    assert.equal(f.anchors()[0]!.props.href, next);
    await f.event(await f.menu(), "onClick");
    assert.deepEqual(f.copied, [next]); assert.deepEqual(f.directOpened, []); assert.equal(f.toggles, 2);
  } finally { await f.close(); }
});

test("plan ordinary and modified clicks retain the existing system-opening anchor contract", async () => {
  const href = "https://example.com/default?q=unchanged#native";
  const f = await fixture(`[reference](${href})`);
  try {
    const anchor = f.anchors()[0]!;
    assert.equal(anchor.props.href, href); assert.equal(anchor.props.target, "_blank");
    assert.equal(anchor.props.rel, "noreferrer noopener"); assert.equal(textOf(anchor), "reference");
    for (const flags of [{ button: 0 }, { button: 0, metaKey: true }, { button: 0, altKey: true }, { button: 1 }]) {
      let prevented = 0;
      await f.event(anchor, "onClick", { ...flags, preventDefault: () => { prevented++; } });
      assert.equal(prevented, 0, "No direct opener interception is added to the existing native anchor path");
    }
    assert.deepEqual(f.directOpened, []); assert.deepEqual(f.copied, []); assert.equal(f.toggles, 0);
  } finally { await f.close(); }
});

test("plan workspace-file buttons retain their exact existing open-file route", async () => {
  const f = await fixture("Inspect `src/lib/a.ts` before proceeding.");
  try {
    assert.equal(f.anchors().length, 0);
    const files = f.withClass("md-file-link"); assert.equal(files.length, 1);
    assert.equal(files[0]!.props.title, "Open /workspace/src/lib/a.ts");
    await f.event(files[0]!, "onClick");
    assert.deepEqual(f.openedFiles, ["/workspace/src/lib/a.ts"]);
    assert.deepEqual(f.copied, []); assert.deepEqual(f.directOpened, []); assert.equal(f.toggles, 0);
  } finally { await f.close(); }
});

test("plan copy retains exact input payload, propagation and the existing 2000ms reset", async () => {
  const plan = "# Exact plan\n\nInspect [reference](https://example.com/plan).\n";
  const f = await fixture(plan);
  try {
    const copy = f.withClass("oc-copy-icon"); assert.equal(copy.length, 1);
    assert.equal(copy[0]!.props.title, "Copy plan");
    let stopped = 0;
    await f.event(copy[0]!, "onClick", { stopPropagation: () => { stopped++; } });
    assert.equal(stopped, 1); assert.equal(f.toggles, 0);
    assert.deepEqual(f.planCopies, [plan]); assert.deepEqual(f.copied, []);
    assert.deepEqual(f.timers.map((timer) => timer.delay), [2000]);
    assert.equal(f.head().props["aria-expanded"], true);
  } finally { await f.close(); }
});

for (const options of [{ status: "running" as const }, { status: "done" as const, isError: true }]) {
  test(`plan keeps input/result selection and disclosure for ${JSON.stringify(options)}`, async () => {
    const href = "https://example.com/input-plan";
    const f = await fixture(`[input plan](${href})`, options);
    try {
      assert.equal(f.anchors().length, 1); assert.equal(f.anchors()[0]!.props.href, href);
      assert.equal(f.withClass("oc-tool-left").map(textOf).join(""), "Propose plan");
      assert.equal(f.withClass("oc-plan").length, 1);
      await f.toggle(); assert.equal(f.anchors().length, 0);
      await f.toggle(); assert.equal(f.anchors()[0]!.props.href, href);
      assert.deepEqual(f.directOpened, []); assert.deepEqual(f.copied, []); assert.deepEqual(f.planCopies, []);
      assert.equal(f.toggles, 2);
    } finally { await f.close(); }
  });
}

test("empty plan does not acquire links, copy actions or result fallbacks", async () => {
  const f = await fixture("");
  try {
    assert.equal(f.head().props["aria-expanded"], true);
    assert.equal(f.anchors().length, 0); assert.equal(f.withClass("oc-copy-icon").length, 0);
    assert.equal(f.all((node) => node.props.role === "menuitem").length, 0);
    assert.deepEqual(f.copied, []); assert.deepEqual(f.planCopies, []); assert.deepEqual(f.directOpened, []);
  } finally { await f.close(); }
});
