import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";

// Like transcriptAgentSummary.test.ts, this exercises production callbacks during
// SSR rerenders. It is not mounted/browser or native interaction evidence.
const scenario = `
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === "function") return expand(node.type(node.props));
  return React.cloneElement(node, {}, React.Children.map(node.props.children, expand));
}
function Scenario({ rowProps, steps, inspect }) {
  const [open, setOpen] = React.useState(rowProps.open);
  const [step, setStep] = React.useState(0);
  const tree = expand(ConductorToolRow({
    ...rowProps, open, onToggle: () => setOpen(value => !value),
  }));
  inspect?.(tree, step);
  if (step < steps.length) {
    steps[step](tree);
    setStep(step + 1);
  }
  return tree;
}
exports.Scenario = Scenario;
`;
const compiled = ts.transpileModule(`${readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8")}\n${scenario}`, {
  fileName: "ToolRows.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
type Step = (tree: React.ReactNode) => void;
interface ScenarioProps {
  rowProps: ToolRowProps;
  steps: Step[];
  inspect?: (tree: React.ReactNode, step: number) => void;
}
const renderers: { Scenario?: React.ComponentType<ScenarioProps> } = {};
const localRequire = createRequire(import.meta.url);
runInNewContext(compiled.outputText, {
  exports: renderers,
  React,
  require(name: string) {
    switch (name) {
      case "react": return React;
      case "react/jsx-runtime": return localRequire(name);
      case "./conductorTools.ts": return tools;
      case "./toolIconData.ts": return icons;
      case "./thinkingChip.ts": return { thinkingChipText };
      case "./markdown.ts": return { Markdown: () => { throw new Error("Unexpected Markdown leaf"); } };
      case "./LinkMenu.tsx": return { LinkWithMenu: () => { throw new Error("Unrelated link menu rendered"); } };
      case "../../backend.ts": return { openUrl: () => { throw new Error("Unrelated external opener invoked"); } };
      default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
    }
  },
}, { filename: "ToolRows.tsx" });
assert.ok(renderers.Scenario);
const ProductionScenario = renderers.Scenario;

interface HostProps {
  children?: React.ReactNode;
  className?: string;
  title?: string;
  role?: string;
  "aria-label"?: string;
  "aria-expanded"?: boolean;
  "data-tone"?: string;
  onClick?: (event: { stopPropagation: () => void }) => void;
}
type Host = React.ReactElement<HostProps>;
function nodes(tree: React.ReactNode): Host[] {
  const result: Host[] = [];
  React.Children.forEach(tree, (child) => {
    if (!React.isValidElement<HostProps>(child)) return;
    result.push(child, ...nodes(child.props.children));
  });
  return result;
}
function hasClass(node: Host, name: string): boolean {
  return node.props.className?.split(" ").includes(name) ?? false;
}
function text(tree: React.ReactNode): string {
  return React.Children.toArray(tree).map((child): string => React.isValidElement<HostProps>(child)
    ? text(child.props.children) : String(child)).join("");
}
function one(tree: React.ReactNode, match: (node: Host) => boolean): Host {
  const found = nodes(tree).filter(match);
  assert.equal(found.length, 1, "one matching production control exists");
  return found[0]!;
}
function outer(tree: React.ReactNode): Host {
  const header = nodes(tree).find((node) => hasClass(node, "oc-tool-head"));
  assert.ok(header, "production RowShell header exists");
  return header;
}
function edit(tree: React.ReactNode, index: number): Host {
  return one(tree, (node) => node.type === "button" && node.props["aria-label"] === `Edit ${index}`);
}
function click(node: Host): void {
  assert.ok(node.props.onClick, "production control has an active callback");
  node.props.onClick({ stopPropagation() {} });
}
function diffs(tree: React.ReactNode): string[] {
  return nodes(tree).filter((node) => hasClass(node, "diff")).map((node) => text(node));
}
function counts(tree: React.ReactNode): number[][] {
  return nodes(tree).filter((node) => hasClass(node, "oc-line-counts")).map((node) =>
    nodes(node.props.children).filter((child) => hasClass(child, "add") || hasClass(child, "del")).map((child) => Number(text(child))));
}
const defaultEdits = [
  { old_string: "same preview", new_string: "first replacement" },
  { old_string: "same preview", new_string: "second replacement" },
];
function props(input: Record<string, unknown> = { edits: defaultEdits }, overrides: Partial<ToolRowProps> = {}): ToolRowProps {
  return {
    tool: { name: "MultiEdit", input: { file_path: "/repo/src/example.ts", ...input } },
    status: "done", isError: false, open: false, onToggle() {}, ...overrides,
  };
}
function render(rowProps = props(), steps: Step[] = [], inspect?: ScenarioProps["inspect"]): string {
  return renderToStaticMarkup(React.createElement(ProductionScenario, { rowProps, steps, inspect }));
}

test("MultiEdit collapsed outer row remains expandable without showing inner edits", () => {
  render(props(), [], (tree) => {
    assert.equal(outer(tree).props["aria-expanded"], false);
    assert.equal(text(one(tree, (node) => hasClass(node, "oc-tool-left"))), "2 edits");
    assert.equal(one(tree, (node) => hasClass(node, "oc-file-badge")).props.title, "/repo/src/example.ts");
    assert.deepEqual(counts(tree), [[2, 2]]);
    assert.equal(nodes(tree).filter((node) => node.props["aria-label"]?.startsWith("Edit ")).length, 0);
    assert.deepEqual(diffs(tree), []);
  });
});

test("actual outer callback reveals two collapsed edit controls", () => {
  render(props(), [(tree) => click(outer(tree))], (tree, step) => {
    if (step === 0) return;
    assert.equal(outer(tree).props["aria-expanded"], true);
    assert.equal(edit(tree, 1).props["aria-expanded"], false);
    assert.equal(edit(tree, 2).props["aria-expanded"], false);
    assert.deepEqual(diffs(tree), []);
    assert.deepEqual(counts(tree), [[2, 2], [1, 1], [1, 1]]);
    assert.ok(one(tree, (node) => hasClass(node, "oc-file-badge")), "file navigation remains visible when open");
  });
});

test("duplicate previews toggle independently and survive outer close/reopen", () => {
  const states: Array<[boolean | undefined, boolean | undefined, string[]]> = [];
  render(props(), [
    (tree) => click(outer(tree)),
    (tree) => click(edit(tree, 1)),
    (tree) => click(edit(tree, 2)),
    (tree) => click(edit(tree, 1)),
    (tree) => click(outer(tree)),
    (tree) => click(outer(tree)),
  ], (tree, step) => {
    if (step === 0 || step === 5) {
      assert.equal(outer(tree).props["aria-expanded"], false);
      assert.deepEqual(diffs(tree), []);
      return;
    }
    states.push([edit(tree, 1).props["aria-expanded"], edit(tree, 2).props["aria-expanded"], diffs(tree)]);
  });
  assert.deepEqual(states, [
    [false, false, []],
    [true, false, ["-same preview+first replacement"]],
    [true, true, ["-same preview+first replacement", "-same preview+second replacement"]],
    [false, true, ["-same preview+second replacement"]],
    [false, true, ["-same preview+second replacement"]],
  ]);
});

test("a separately rendered tool row never inherits another row's inner selection", () => {
  render(props(), [(tree) => click(outer(tree)), (tree) => click(edit(tree, 1))]);
  render(props(undefined, { open: true }), [], (tree) => {
    assert.equal(edit(tree, 1).props["aria-expanded"], false);
    assert.equal(edit(tree, 2).props["aria-expanded"], false);
    assert.deepEqual(diffs(tree), []);
  });
});

test("real diff rows normalize markers and preserve individual and total counts", () => {
  const row = props({ edits: [
    { old_string: "- same\n- old", new_string: "+ same\n+ new" },
    { old_string: "", new_string: "+ inserted" },
  ] }, { open: true });
  render(row, [(tree) => click(edit(tree, 1)), (tree) => click(edit(tree, 2))], (tree, step) => {
    assert.deepEqual(counts(tree), [[2, 1], [1, 1], [1, 0]]);
    if (step !== 2) return;
    assert.deepEqual(diffs(tree), ["-same-old+same+new", "+inserted"]);
    assert.equal(text(edit(tree, 2)).includes("Empty"), true);
  });
});

test("preview uses first raw old line, forty characters, Empty and full-text ellipsis", () => {
  const multiline = "short first line\n" + "x".repeat(50);
  render(props({ edits: [
    { old_string: "a".repeat(41), new_string: "new" },
    { old_string: multiline, new_string: "new" },
    { old_string: "", new_string: "new" },
  ] }, { open: true }), [], (tree) => {
    const previews = nodes(tree).filter((node) => hasClass(node, "oc-multi-edit-preview")).map((node) => text(node));
    assert.deepEqual(previews, ["a".repeat(40) + "...", "short first line...", "Empty"]);
  });
});

test("actual file badge callback stops propagation and opens its path exactly once", () => {
  const opened: string[] = [];
  let stopped = false;
  render(props(undefined, { onOpenFile: (path) => opened.push(path) }), [(tree) => {
    const badge = one(tree, (node) => hasClass(node, "oc-file-badge"));
    assert.ok(badge.props.onClick);
    badge.props.onClick({ stopPropagation() { stopped = true; } });
    if (!stopped) click(outer(tree));
  }], (tree) => assert.equal(outer(tree).props["aria-expanded"], false));
  assert.equal(stopped, true);
  assert.deepEqual(opened, ["/repo/src/example.ts"]);
});

test("failed MultiEdit keeps its separate expandable error and edit details", () => {
  render(props(undefined, { isError: true, result: "Permission denied", open: true }), [(tree) => {
    const error = one(tree, (node) => node.props["data-tone"] === "error");
    click(one(error.props.children, (node) => hasClass(node, "oc-tool-head")));
  }], (tree, step) => {
    assert.equal(edit(tree, 1).props["aria-expanded"], false);
    assert.deepEqual(counts(tree), [[2, 2], [1, 1], [1, 1]]);
    const error = one(tree, (node) => node.props["data-tone"] === "error");
    assert.equal(one(error.props.children, (node) => hasClass(node, "oc-tool-head")).props["aria-expanded"], step === 1);
    assert.equal(nodes(error).filter((node) => hasClass(node, "oc-tool-content")).length, step === 1 ? 1 : 0);
    assert.ok(text(error).includes("Permission denied"));
  });
});

test("native Codex file changes retain actual Edit/Write/Bash projection", () => {
  const projected = tools.conductorTools("file_change", { changes: [
    { path: "/repo/edit.ts", kind: "update", diff: "@@ -1 +1 @@\n-old\n+new" },
    { path: "/repo/add.ts", kind: "add", diff: "@@ -0,0 +1 @@\n+created" },
    { path: "/repo/delete.ts", kind: "delete", diff: "@@ -1 +0,0 @@\n-removed" },
  ] });
  assert.deepEqual(projected, [
    { name: "Edit", input: { file_path: "/repo/edit.ts", old_string: "old", new_string: "new" } },
    { name: "Write", input: { file_path: "/repo/add.ts", content: "created" } },
    { name: "Bash", input: { command: "rm /repo/delete.ts" } },
  ]);
  for (const tool of projected) {
    const html = render(props(undefined, { tool, open: true }));
    assert.doesNotMatch(html, /oc-multi-edit/);
    assert.match(html, /oc-tool-content/);
  }
});
