import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { applyCodexPayload, codexChat, startTurn, type CodexPayload, type CodexTool } from "./codex.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import type { ToolRowProps } from "./ToolRows.tsx";

type Case = { id: string; method: string; item: { type: string; id: string; query: string }; expectedOutput: string | null; expectedHeader: string; expectedBody: string | null };
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string>; findAll: (predicate: (node: Node) => boolean) => Node[] };
const fixture: { cases: Case[] } = JSON.parse(readFileSync(new URL("./webSearchCompletion.inputs.json", import.meta.url), "utf8"));
const probe = process.env.WEB_COMPLETION_PROBE;
assert.ok(probe, "WEB_COMPLETION_PROBE must point to the compiled actual-Rust-source probe; no synthetic mapped-payload fallback");
const result = spawnSync(probe, [], { input: JSON.stringify(fixture), encoding: "utf8", timeout: 30000 });
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr);
const results: Array<{ id: string; payloads: CodexPayload[] }> = JSON.parse(result.stdout);
assert.deepEqual(results.map((r) => r.id), fixture.cases.map((c) => c.id));
const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);

function actualPayload(c: Case): CodexPayload & CodexTool {
  const rows = results.find((r) => r.id === c.id)!.payloads;
  assert.equal(rows.length, 1, "one actual producer payload per native item");
  assert.equal(rows[0]!.type, "tool");
  return { ...rows[0]!, chatId: "codex-web-fixture" } as CodexPayload & CodexTool;
}

for (const c of fixture.cases) {
  test(`producer ${c.id}: completed web search has the retained result summary; running does not`, () => {
    const payload = actualPayload(c);
    assert.equal(payload.id, c.item.id);
    assert.equal(payload.kind, "webSearch");
    assert.equal(payload.title, `Search the web: ${c.item.query}`);
    assert.deepEqual(payload.input, { query: c.item.query });
    assert.equal(payload.status, c.method === "item/started" ? "running" : "completed");
    assert.equal(payload.output, c.expectedOutput, "CODEX_WEBSEARCH_COMPLETION_RESULT_MISSING");
    assert.equal(payload.exitCode, null);
  });

  test(`mounted ${c.id}: actual Rust payload to Codex adapter, reducer, view and production row`, async () => {
    const payload = actualPayload(c);
    const at = new Date(0);
    const start = startTurn(codexChat(payload.chatId), "Look up configuration", at);
    const step = applyCodexPayload(start.state, payload, at);
    const reduced = applyChatEvents(emptyTranscript(payload.chatId), [...start.events, ...step.events]);
    assert.ok(reduced.ok);
    const assistant = buildRows(reduced.transcript).find((r) => r.kind === "assistant");
    assert.ok(assistant?.kind === "assistant");
    const part = assistant.parts.find((p) => p.kind === "tool");
    assert.ok(part?.kind === "tool");
    const call = part.call;
    assert.deepEqual(call.tool, { name: "WebSearch", input: { query: c.item.query } });
    assert.equal(call.result, c.method === "item/started" ? undefined : payload.output ?? "");
    const production: Record<string, unknown> = {};
    const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
      fileName: "ToolRows.tsx",
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
    });
    assert.equal(compiled.diagnostics?.filter((d: { category: number }) => d.category === ts.DiagnosticCategory.Error).length, 0);
    const unrelated = () => { throw new Error("Unrelated dependency executed in web completion fixture"); };
    runInNewContext(compiled.outputText, {
      exports: production,
      require(name: string) {
        switch (name) {
          case "react": case "react/jsx-runtime": return dependencies(name);
          case "./conductorTools.ts": return tools;
          case "./toolIconData.ts": return icons;
          case "./thinkingChip.ts": return { thinkingChipText };
          case "./markdown.ts": return { highlight: unrelated, Markdown: unrelated };
          case "./LinkMenu.tsx": return { LinkWithMenu: unrelated };
          case "../../backend.ts": return { openUrl: unrelated };
          default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
        }
      },
    }, { filename: "ToolRows.tsx" });
    function Scene() {
      const [open, setOpen] = React.useState(false);
      const props: ToolRowProps = { tool: call.tool, status: call.status, result: call.result, isError: false, open, onToggle: () => setOpen((v: boolean) => !v) };
      return React.createElement(production.ConductorToolRow, props);
    }
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(React.createElement(Scene)); });
    const nodes = (name: string): Node[] => renderer.root.findAll((n: Node) => typeof n.type === "string" && hasClass(n, name));
    try {
      const headers = nodes("oc-tool-head");
      assert.equal(headers.length, 1);
      const header = headers[0]!;
      assert.equal(text(header).includes("Web Search"), true);
      assert.deepEqual(nodes("oc-code-chip").map(text), c.expectedHeader ? [c.expectedHeader] : []);
      assert.deepEqual(nodes("oc-tool-content"), []);
      if (c.expectedBody === null) {
        assert.equal(header.props["aria-expanded"], undefined);
        assert.equal(header.props.onClick, undefined);
      } else {
        assert.equal(header.props["aria-expanded"], false, "CODEX_WEBSEARCH_COMPLETION_ROW_HAS_NO_DISCLOSURE");
        assert.equal(typeof header.props.onClick, "function");
        await act(async () => { (header.props.onClick as () => void)(); });
        assert.equal(nodes("oc-tool-head")[0]!.props["aria-expanded"], true);
        assert.deepEqual(nodes("oc-tool-content").map(text), [c.expectedBody]);
        assert.equal(renderer.root.findAll((n: Node) => ["script", "img", "strong"].includes(String(n.type)) || "dangerouslySetInnerHTML" in n.props).length, 0);
        await act(async () => { (nodes("oc-tool-head")[0]!.props.onClick as () => void)(); });
        assert.equal(nodes("oc-tool-head")[0]!.props["aria-expanded"], false);
        assert.deepEqual(nodes("oc-tool-content"), []);
      }
    } finally { await act(async () => { renderer.unmount(); }); }
  });
}
