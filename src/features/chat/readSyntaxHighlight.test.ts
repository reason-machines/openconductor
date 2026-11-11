import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { highlight, MAX_HIGHLIGHT_CHARS } from "./markdown.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string>; findAll: (predicate: (node: Node) => boolean) => Node[] };
type Read = { path?: string; output: string; offset?: number; error?: boolean };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);
const syntax = (node: Node): Node[] => node.findAll((child) => child.type === "span" && String(child.props.className).includes("hljs-"));
function host(node: Node): ReactElement {
  assert.equal(typeof node.type, "string");
  return React.createElement(node.type, node.props, ...node.children.map((child) => typeof child === "string" ? child : host(child)));
}

function normalizedRead(read: Read) {
  const chatId = "workspace:claude";
  const at = new Date(0);
  const started = startTurn(reasonChat(chatId), "Read the file", at);
  const rawInput = { file_path: read.path ?? "/repo/src/example.ts", offset: read.offset ?? 7 };
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: "ordinary-read", title: "Read file", kind: "read",
    toolName: "Read", rawInput, status: read.error ? "failed" : "completed",
    output: read.output, diffs: [], locations: [],
  }, at);
  const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
  assert.ok(reduced.ok);
  const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
  assert.ok(assistant?.kind === "assistant");
  const part = assistant.parts.find((part) => part.kind === "tool");
  assert.ok(part?.kind === "tool");
  assert.deepEqual(part.call.tool, { name: "Read", input: rawInput });
  return part.call;
}

async function fixture(read: Read) {
  const production: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
    fileName: "ToolRows.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);
  runInNewContext(compiled.outputText, {
    exports: production,
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "./conductorTools.ts": return tools;
        case "./toolIconData.ts": return icons;
        case "./thinkingChip.ts": return { thinkingChipText };
        case "./markdown.ts": return { highlight, Markdown: () => { throw new Error("Unrelated Markdown leaf"); } };
        case "./LinkMenu.tsx": return { LinkWithMenu: () => { throw new Error("Unrelated link menu"); } };
        case "../../backend.ts": return { openUrl: () => { throw new Error("Unrelated external opener"); } };
        default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  const call = normalizedRead(read);
  const opened: string[] = [];
  function Scene() {
    const [open, setOpen] = React.useState(false);
    const props: ToolRowProps = {
      tool: call.tool, status: call.status, result: call.result, isError: call.status === "error",
      open, onToggle: () => setOpen((value: boolean) => !value), onOpenFile: (path) => opened.push(path),
    };
    return React.createElement(production.ConductorToolRow, props);
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const one = (predicate: (node: Node) => boolean): Node => {
    const found = all(predicate); assert.equal(found.length, 1); return found[0]!;
  };
  return {
    opened, all, one,
    header: () => one((node) => hasClass(node, "oc-tool-head")),
    lines: () => all((node) => hasClass(node, "oc-code-line")),
    async toggle() {
      const callback = this.header().props.onClick;
      assert.equal(typeof callback, "function");
      if (typeof callback === "function") await act(async () => { callback(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

function code(line: Node): Node {
  assert.equal(line.children.length, 2);
  const child = line.children[1]!;
  assert.notEqual(typeof child, "string");
  assert.ok(typeof child !== "string");
  return child;
}

function sameHighlightedLine(line: Node, language: string, value: string) {
  const expected = highlight(language, value);
  assert.ok(expected, "the real registered highlighter accepts the control");
  assert.ok(syntax(code(line)).length > 0, "ordinary Read renders real syntax spans, not a plain line");
  assert.equal(renderToStaticMarkup(host(code(line))), renderToStaticMarkup(React.createElement("span", null, expected)));
  assert.equal(text(code(line)), value);
}

test("ordinary Claude Read opens highlighted TypeScript with exact cleaned text and offset numbers", async () => {
  const view = await fixture({ output: "    7→const enabled: boolean = true;\n    8→\n    9→console.log(enabled);" });
  try {
    assert.equal(view.header().props["aria-expanded"], false);
    assert.deepEqual(view.lines(), []);
    await view.toggle();
    assert.equal(view.header().props["aria-expanded"], true);
    const lines = view.lines();
    assert.deepEqual(lines.map((line) => text(line.children[0]!)), ["7", "8", "9"]);
    assert.deepEqual(lines.map((line) => text(code(line))), ["const enabled: boolean = true;", "", "console.log(enabled);"]);
    assert.ok(syntax(code(lines[0]!)).some((node) => hasClass(node, "hljs-keyword") && text(node) === "const"), "ordinary Read highlights the TypeScript const keyword");
    assert.ok(syntax(code(lines[0]!)).some((node) => hasClass(node, "hljs-literal") && text(node) === "true"));
    sameHighlightedLine(lines[0]!, "typescript", "const enabled: boolean = true;");
    await view.toggle(); assert.deepEqual(view.lines(), []);
  } finally { await view.close(); }
});

for (const [extensions, language, value] of [
  [["js", "jsx"], "javascript", "const enabled = true;"],
  [["ts", "tsx", "TSX"], "typescript", "const enabled: boolean = true;"],
  [["py"], "python", "def enabled(): return True"],
  [["rs"], "rust", "let enabled = true;"],
  [["json"], "json", '{"enabled":true}'],
  [["yml", "yaml"], "yaml", "enabled: true"],
  [["css"], "css", "main { color: red; }"],
  [["html", "htm"], "html", "<main>Hello</main>"],
  [["xml"], "xml", "<main>Hello</main>"],
  [["sh", "bash"], "bash", 'echo "hello"'],
] satisfies Array<[string[], string, string]>) {
  for (const extension of extensions) {
    test(`ordinary Read .${extension} uses canonical ${language} syntax`, async () => {
      const view = await fixture({ path: `/repo/example.${extension}`, output: value });
      try { await view.toggle(); sameHighlightedLine(view.lines()[0]!, language, value); }
      finally { await view.close(); }
    });
  }
}

for (const path of ["/repo/README", "/repo/example.unknown", "/repo/example.go", "/repo/example.dart", ""]) {
  test(`Read unmapped path ${JSON.stringify(path)} keeps literal text without guessed syntax`, async () => {
    const value = "const enabled = true;";
    const view = await fixture({ path, output: value, offset: 1 });
    try {
      await view.toggle(); const line = view.lines()[0]!;
      assert.equal(text(line.children[0]!), "1"); assert.equal(text(code(line)), value); assert.deepEqual(syntax(code(line)), []);
      if (!path) assert.equal(view.all((node) => hasClass(node, "oc-file-badge")).length, 0);
    } finally { await view.close(); }
  });
}

test("Read highlights each result line independently rather than carrying comment state", async () => {
  const view = await fixture({ output: "/* unfinished comment\nconst enabled = true;" });
  try {
    await view.toggle(); const lines = view.lines();
    sameHighlightedLine(lines[0]!, "typescript", "/* unfinished comment");
    sameHighlightedLine(lines[1]!, "typescript", "const enabled = true;");
    assert.ok(syntax(code(lines[1]!)).some((node) => hasClass(node, "hljs-keyword") && text(node) === "const"));
  } finally { await view.close(); }
});

test("Read applies the highlight cutoff to each line, not their combined result", async () => {
  const values = ["first", "second"].map((name) => `const ${name} = "${"x".repeat(50_010)}";`);
  assert.ok(values.join("\n").length > MAX_HIGHLIGHT_CHARS);
  const view = await fixture({ output: values.join("\n") });
  try { await view.toggle(); values.forEach((value, index) => sameHighlightedLine(view.lines()[index]!, "typescript", value)); }
  finally { await view.close(); }
});

test("Read highlights a line at the cutoff but leaves an overlong line plain without suppressing its neighbor", async () => {
  const prefix = 'const value = "', suffix = '";';
  const atLimit = prefix + "x".repeat(MAX_HIGHLIGHT_CHARS - prefix.length - suffix.length) + suffix;
  const overLimit = atLimit + ";";
  const view = await fixture({ output: `${atLimit}\n${overLimit}\nconst next = true;` });
  try {
    await view.toggle(); const lines = view.lines();
    sameHighlightedLine(lines[0]!, "typescript", atLimit);
    assert.equal(text(code(lines[1]!)), overLimit); assert.deepEqual(syntax(code(lines[1]!)), []);
    sameHighlightedLine(lines[2]!, "typescript", "const next = true;");
  } finally { await view.close(); }
});

test("Read syntax keeps markup literal and badge navigation does not expand or collapse the row", async () => {
  const value = 'const literal = "</span><script>unsafe()</script>";';
  const view = await fixture({ output: value });
  try {
    const badge = () => view.one((node) => node.type === "button" && hasClass(node, "oc-file-badge"));
    let stopped = 0;
    const click = badge().props.onClick;
    assert.equal(typeof click, "function");
    if (typeof click === "function") await act(async () => { click({ stopPropagation: () => { stopped++; } }); });
    assert.equal(stopped, 1); assert.deepEqual(view.opened, ["/repo/src/example.ts"]);
    assert.equal(view.header().props["aria-expanded"], false);
    await view.toggle(); sameHighlightedLine(view.lines()[0]!, "typescript", value);
    assert.equal(badge().props.title, "/repo/src/example.ts");
    assert.equal(view.all((node) => node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
  } finally { await view.close(); }
});

for (const read of [{ output: "" }, { output: "Permission denied", error: true }]) {
  test(`Read ${read.error ? "error" : "empty result"} retains its non-content header`, async () => {
    const view = await fixture(read);
    try {
      assert.equal(view.header().props["aria-expanded"], undefined);
      assert.equal(view.header().props.onClick, undefined);
      assert.deepEqual(view.lines(), []);
    } finally { await view.close(); }
  });
}
