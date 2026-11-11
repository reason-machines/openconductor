import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { highlight } from "./markdown.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string> };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const trigger = "File has not been read yet. Read it first before writing to it.";
const note = "Claude Code has to retry the file edit because of a bug in its permissions logic. Just a moment!";

async function fixture(name: "Edit" | "Write", result: string, isError = true) {
  const production: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
    fileName: "ToolRows.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);
  runInNewContext(compiled.outputText, {
    exports: production, setTimeout, clearTimeout,
    require(dependency: string) {
      switch (dependency) {
        case "react": case "react/jsx-runtime": return dependencies(dependency);
        case "./conductorTools.ts": return tools;
        case "./toolIconData.ts": return icons;
        case "./thinkingChip.ts": return { thinkingChipText };
        case "./markdown.ts": return { highlight, Markdown: () => { throw new Error("Unrelated Markdown leaf rendered"); } };
        case "./LinkMenu.tsx": return { LinkWithMenu: () => { throw new Error("Unrelated link menu rendered"); } };
        case "../../backend.ts": return { openUrl: () => { throw new Error("External opener invoked"); } };
        default: throw new Error(`Unexpected ToolRows dependency: ${dependency}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  const props: ToolRowProps = {
    tool: { name, input: { file_path: "/repo/example.ts", old_string: "before", new_string: "after", content: "after" } },
    status: "done", result, isError, open: false, onToggle: () => { throw new Error("Outer row unexpectedly toggled"); },
  };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(production.ConductorToolRow, props)); });
  const all = (predicate: (node: Node) => boolean): Node[] =>
    renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const one = (predicate: (node: Node) => boolean): Node => {
    const found = all(predicate);
    assert.equal(found.length, 1, "one production control exists");
    return found[0]!;
  };
  const error = () => one((node) => hasClass(node, "oc-tool") && node.props["data-tone"] === "error");
  return {
    all,
    content: () => text(renderer.root),
    note: () => all((node) => hasClass(node, "oc-tool-aside") && text(node) === note),
    errors: () => all((node) => hasClass(node, "oc-tool") && node.props["data-tone"] === "error"),
    errorContent: () => text(error()),
    expanded: () => one((node) => hasClass(node, "oc-tool-head") && error().children.includes(node)).props["aria-expanded"],
    async toggle() {
      const header = one((node) => hasClass(node, "oc-tool-head") && error().children.includes(node));
      const handler = header.props.onClick;
      assert.equal(typeof handler, "function");
      if (typeof handler === "function") await act(async () => { handler(); });
    },
    async update(next: string) {
      await act(async () => { renderer.update(React.createElement(production.ConductorToolRow, { ...props, result: next })); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const name of ["Edit", "Write"] as const) {
  for (const [label, result] of [["exact", trigger], ["embedded", `prefix\n${trigger}\nsuffix`]] as const) {
    test(`${name} ${label} read-before-write failure shows only the retry explanation`, async () => {
      const view = await fixture(name, result);
      try {
        assert.equal(view.note().length, 1, "read-before-write failure needs the exact retry explanation");
        assert.equal(view.errors().length, 0, "special explanation replaces the generic expandable error");
        assert.equal(view.content().includes(result), false, "raw failure text is not displayed");
        assert.equal(view.all((node) => node.type === "button" && /retry/i.test(text(node))).length, 0);
      } finally { await view.close(); }
    });
  }

  for (const [label, result] of [
    ["ordinary", "Permission denied: <script>literal</script>"],
    ["case near miss", "file has not been read yet. Read it first before writing to it."],
    ["punctuation near miss", "File has not been read yet. Read it first before writing to it!"],
  ] as const) {
    test(`${name} ${label} error keeps its independent disclosure and raw text`, async () => {
      const view = await fixture(name, result);
      try {
        assert.equal(view.note().length, 0);
        assert.equal(view.errors().length, 1);
        assert.equal(view.expanded(), false);
        assert.equal(view.errorContent(), `Error${result}`);
        await view.toggle();
        assert.equal(view.expanded(), true);
        assert.equal(view.errorContent(), `Error${result}${result}`);
        assert.equal(view.all((node) => node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
        await view.toggle();
        assert.equal(view.expanded(), false);
        assert.equal(view.errorContent(), `Error${result}`);
      } finally { await view.close(); }
    });
  }

  for (const [label, result, isError] of [["successful matching result", trigger, false], ["empty failed result", "", true]] as const) {
    test(`${name} ${label} does not add an error or retry explanation`, async () => {
      const view = await fixture(name, result, isError);
      try {
        assert.equal(view.note().length, 0);
        assert.equal(view.errors().length, 0);
      } finally { await view.close(); }
    });
  }

  test(`${name} same mounted error survives trigger to generic to trigger without changing hook order`, async () => {
    const view = await fixture(name, trigger);
    try {
      assert.equal(view.note().length, 1, "initial trigger uses the retry explanation");
      await view.update("Permission denied");
      assert.equal(view.note().length, 0);
      assert.equal(view.expanded(), false);
      await view.toggle();
      assert.equal(view.expanded(), true);
      await view.update(trigger);
      assert.equal(view.note().length, 1);
      assert.equal(view.errors().length, 0);
      await view.update("Permission denied again");
      assert.equal(view.expanded(), true, "generic error state survives the intervening special explanation");
      await view.toggle();
      assert.equal(view.expanded(), false);
    } finally { await view.close(); }
  });
}
