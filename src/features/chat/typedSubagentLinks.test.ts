import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import type { TranscriptProps } from "./Transcript.tsx";
import type { ChatEvent } from "./types.ts";
import * as toolHelpers from "./conductorTools.ts";
import * as toolIcons from "./toolIconData.ts";
import { Markdown } from "./markdown.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import * as view from "./view.ts";
import * as groups from "./toolGroups.ts";
import * as time from "./turnTime.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
type Node = {
  type: unknown;
  props: Record<string, unknown>;
  children: Array<Node | string>;
  findAll: (predicate: (node: Node) => boolean) => Node[];
};
type Call = { id: string; name: "Task" | "Agent"; input: Record<string, unknown>; result?: string };
const textOf = (node: Node | string): string => typeof node === "string" ? node : node.children.map(textOf).join("");
const within = (node: Node, predicate: (node: Node) => boolean): Node[] => node.findAll((child) => typeof child.type === "string" && predicate(child));
const call = (name: Call["name"], result?: string, type = "Explore"): Call => ({
  id: name, name, input: { subagent_type: type, description: `Inspect with ${name}` }, result,
});

function transcriptStatements(): string {
  const source = ts.createSourceFile("Transcript.tsx", readFileSync(new URL("./Transcript.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return ["Transcript", "rowTurn", "groupTurns", "Row", "Agent", "SummaryRow", "Part", "ThinkingRow"].map((name) => {
    const node = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name
      || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name));
    assert.ok(node, `Production ${name} exists`);
    return node.getText(source);
  }).join("\n");
}

async function fixture(calls: Call[], running = false) {
  const opened: string[] = [], copied: string[] = [];
  const links: Record<string, unknown> = {};
  const linkModule = ts.transpileModule(readFileSync(new URL("./LinkMenu.tsx", import.meta.url), "utf8"), {
    fileName: "LinkMenu.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(linkModule.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  runInNewContext(linkModule.outputText, {
    exports: links,
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "../openIn/apps.ts": return { copyText: async (href: string) => { copied.push(href); } };
        case "../../components/menu/ContextMenu": return {
          ContextMenu: ({ children }: { children?: React.ReactNode }) => React.createElement("div", { role: "menu" }, children),
          MenuItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect: () => void }) => React.createElement("button", { role: "menuitem", onClick: onSelect }, children),
        };
        case "../../components/menu/menuIcons": return { CopyIcon: () => null };
        default: throw new Error(`Unexpected LinkMenu dependency ${name}`);
      }
    },
  }, { filename: "LinkMenu.tsx" });
  const toolRows: Partial<typeof import("./ToolRows.tsx")> = {};
  const toolModule = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
    fileName: "ToolRows.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(toolModule.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  runInNewContext(toolModule.outputText, {
    exports: toolRows,
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "./conductorTools.ts": return toolHelpers;
        case "./toolIconData.ts": return toolIcons;
        case "./markdown.ts": return { Markdown };
        case "./thinkingChip.ts": return { thinkingChipText };
        case "./LinkMenu.tsx": return links;
        case "../../backend.ts": return { openUrl: async (href: string) => { opened.push(href); } };
        default: throw new Error(`Unexpected ToolRows dependency ${name}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  assert.equal(typeof toolRows.ConductorToolRow, "function");
  assert.equal(typeof toolRows.opensByDefault, "function");
  const production: { Transcript?: React.ComponentType<TranscriptProps> } = {};
  const compiled = ts.transpileModule(transcriptStatements(), {
    fileName: "Transcript.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  const unexpected = (name: string) => () => { throw new Error(`Unrelated production branch reached: ${name}`); };
  runInNewContext(compiled.outputText, {
    exports: production,
    require(name: string) { assert.equal(name, "react/jsx-runtime"); return dependencies(name); },
    React, Fragment: React.Fragment,
    useMemo: React.useMemo, useState: React.useState, useSyncExternalStore: React.useSyncExternalStore,
    ...view, ...groups, ...time, ...links,
    Markdown, thinkingChipText,
    openUrl: async (href: string) => { opened.push(href); },
    ...toolRows,
    TurnFooter: () => null,
    UserText: unexpected("UserText"),
    SentUserContent: unexpected("SentUserContent"),
    MessageActions: unexpected("MessageActions"),
    reportLabel: unexpected("reportLabel"),
  }, { filename: "Transcript.tsx" });
  assert.equal(typeof production.Transcript, "function");
  assert.ok(production.Transcript);
  const ProductionTranscript = production.Transcript;

  function transcript(nextCalls: Call[], active: boolean) {
    const sessionId = "typed-subagent-links", turnId = "turn", createdAt = "2026-11-11T00:00:00Z";
    const events: ChatEvent[] = [
      { type: "turn_status", sessionId, turnId, status: "running" },
      { type: "upsert", message: {
        id: "assistant", sessionId, turnId, role: "assistant", createdAt,
        blocks: nextCalls.map(({ id, name, input }) => ({ type: "tool_use", id, name, input })),
      } },
    ];
    for (const next of nextCalls) {
      if (next.result !== undefined) events.push({ type: "upsert", message: {
        id: `result-${next.id}`, sessionId, turnId, role: "user", createdAt,
        blocks: [{ type: "tool_result", toolUseId: next.id, content: next.result }],
      } });
    }
    if (!active) events.push({ type: "turn_status", sessionId, turnId, status: "completed" });
    const result = applyChatEvents(emptyTranscript(sessionId), events);
    assert.ok(result.ok);
    return result.transcript;
  }
  const props = (nextCalls: Call[], active: boolean): TranscriptProps => ({
    transcript: transcript(nextCalls, active), now: () => Date.parse("2026-11-11T00:00:00Z"),
  });
  let renderer: ReturnType<typeof create>;
  let currentCalls = calls;
  await act(async () => { renderer = create(React.createElement(ProductionTranscript, props(calls, running))); });
  const all = (predicate: (node: Node) => boolean): Node[] => within(renderer.root, predicate);
  function row(id: string): Node {
    const current = currentCalls.find((item) => item.id === id);
    assert.ok(current);
    const matches = all((node) => node.props["data-tool-input"] === JSON.stringify(current.input));
    assert.equal(matches.length, 1, `Actual transcript row for ${id}`);
    return matches[0]!;
  }
  return {
    opened, copied, all, row,
    anchors: (id: string) => within(row(id), (node) => node.type === "a"),
    head(id: string) {
      const heads = within(row(id), (node) => typeof node.props.className === "string" && node.props.className.startsWith("oc-tool-head"));
      assert.equal(heads.length, 1);
      return heads[0]!;
    },
    async event(node: Node, name: string, payload: Record<string, unknown> = {}) {
      const callback = node.props[name];
      assert.equal(typeof callback, "function", `Production ${name} callback exists`);
      if (typeof callback === "function") await act(async () => { await callback(payload); });
    },
    async toggle(id: string) { await this.event(this.head(id), "onClick"); },
    async tab(id: string, label: "Raw" | "Formatted") {
      const tabs = within(row(id), (node) => node.type === "button" && textOf(node) === label);
      assert.equal(tabs.length, 1);
      await this.event(tabs[0]!, "onClick");
    },
    async update(nextCalls: Call[], active = false) {
      currentCalls = nextCalls;
      await act(async () => { renderer.update(React.createElement(ProductionTranscript, props(nextCalls, active))); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const name of ["Task", "Agent"] as const) {
  for (const href of ["http://example.com/a?q=one&b=two#part", "https://example.net/b?q=two#end"]) {
    test(`formatted typed ${name} opens the exact external link ${href}`, async () => {
      const f = await fixture([call(name, `Inspect [reference](${href}) before proceeding.`, name === "Task" ? "Explore" : "Plan")]);
      try {
        assert.equal(f.head(name).props["aria-expanded"], false, "Completed typed result starts collapsed");
        assert.equal(f.anchors(name).length, 0);
        await f.toggle(name);
        const tabs = within(f.row(name), (node) => node.props.className === "oc-subagent-tab active");
        assert.equal(tabs.length, 1); assert.equal(textOf(tabs[0]!), "Formatted");
        assert.equal(f.anchors(name).length, 1);
        const anchor = f.anchors(name)[0]!;
        assert.equal(anchor.props.href, href); assert.equal(textOf(anchor), "reference");
        assert.equal(anchor.props.target, "_blank"); assert.match(String(anchor.props.rel), /noopener/);
        let prevented = 0;
        await f.event(anchor, "onClick", { preventDefault: () => { prevented++; } });
        assert.equal(prevented, 1, "Typed subagent links intercept navigation through the app opener");
        assert.deepEqual(f.opened, [href]); assert.deepEqual(f.copied, []);
        assert.equal(f.head(name).props["aria-expanded"], true, "Link activation does not toggle the row");
      } finally { await f.close(); }
    });

    test(`formatted typed ${name} copies the exact external link ${href}`, async () => {
      const f = await fixture([call(name, `Inspect [reference](${href}).`, name === "Task" ? "Explore" : "Plan")]);
      try {
        await f.toggle(name);
        assert.equal(f.anchors(name).length, 1);
        const anchor = f.anchors(name)[0]!;
        assert.equal(anchor.props.href, href);
        let prevented = 0;
        await f.event(anchor, "onContextMenu", { preventDefault: () => { prevented++; }, clientX: 40, clientY: 50 });
        assert.equal(prevented, 1);
        const menu = within(f.row(name), (node) => node.props.role === "menuitem");
        assert.equal(menu.length, 1); assert.equal(textOf(menu[0]!), "Copy link address");
        await f.event(menu[0]!, "onClick");
        assert.deepEqual(f.copied, [href]); assert.deepEqual(f.opened, []);
        assert.equal(f.head(name).props["aria-expanded"], true, "Copying a link does not toggle the row");
      } finally { await f.close(); }
    });
  }
}

test("typed results preserve Raw text, updates, reopen state and isolation between Task and Agent", async () => {
  const taskHref = "https://example.com/task?q=one#result", agentHref = "https://example.net/agent?q=two#result";
  const taskText = `[task](${taskHref})`, agentText = `[agent](${agentHref})`;
  const f = await fixture([call("Task", taskText), call("Agent", agentText, "Plan")]);
  try {
    await f.toggle("Task"); await f.toggle("Agent");
    assert.equal(f.anchors("Task").length, 1); assert.equal(f.anchors("Agent").length, 1);
    await f.tab("Task", "Raw");
    assert.equal(f.anchors("Task").length, 0); assert.equal(f.anchors("Agent").length, 1);
    const raw = within(f.row("Task"), (node) => node.props.className === "oc-subagent-raw");
    assert.equal(raw.length, 1); assert.equal(textOf(raw[0]!), taskText);
    await f.toggle("Task"); await f.toggle("Task");
    assert.equal(f.anchors("Task").length, 0, "The same row retains its Raw tab across collapse");
    const updatedHref = "https://example.org/updated?q=three&v=4#fresh", updatedText = `[updated](${updatedHref})`;
    await f.update([call("Task", updatedText), call("Agent", agentText, "Plan")]);
    assert.equal(textOf(within(f.row("Task"), (node) => node.props.className === "oc-subagent-raw")[0]!), updatedText);
    await f.tab("Task", "Formatted");
    assert.equal(f.anchors("Task")[0]!.props.href, updatedHref);
    assert.equal(f.anchors("Agent")[0]!.props.href, agentHref);
    let prevented = 0;
    for (const id of ["Task", "Agent"]) await f.event(f.anchors(id)[0]!, "onClick", { preventDefault: () => { prevented++; } });
    assert.equal(prevented, 2); assert.deepEqual(f.opened, [updatedHref, agentHref]);
    assert.deepEqual(f.copied, []);
  } finally { await f.close(); }
});

for (const name of ["Task", "Agent"] as const) {
  test(`typed ${name} pending and empty results do not invent expandable content`, async () => {
    const f = await fixture([call(name)], true);
    try {
      assert.equal(f.anchors(name).length, 0);
      assert.equal(f.head(name).props["aria-expanded"], undefined);
      assert.equal(f.head(name).props.onClick, undefined);
      await f.update([call(name, "")]);
      assert.equal(f.head(name).props["aria-expanded"], undefined);
      assert.equal(within(f.row(name), (node) => node.props.className === "oc-subagent-tabs").length, 0);
      assert.equal(f.anchors(name).length, 0);
      const href = "https://example.com/arrived?q=one#complete";
      await f.update([call(name, `[arrived](${href})`)]);
      assert.equal(f.head(name).props["aria-expanded"], false);
      await f.toggle(name);
      assert.equal(f.anchors(name)[0]!.props.href, href);
    } finally { await f.close(); }
  });

  for (const type of [undefined, "", "general-purpose"]) {
    test(`${name} with ${type === undefined ? "missing" : JSON.stringify(type)} type retains its generic result`, async () => {
      const href = "https://example.com/generic?q=one#unchanged";
      const input = { description: `Generic ${name}`, ...(type === undefined ? {} : { subagent_type: type }) };
      const f = await fixture([{ id: name, name, input, result: `[reference](${href})` }]);
      try {
        assert.equal(within(f.row(name), (node) => node.props.className === "oc-subagent-type").length, 0);
        assert.equal(f.anchors(name).length, 0);
        await f.toggle(name);
        assert.equal(within(f.row(name), (node) => node.props.className === "oc-subagent-tabs").length, 0);
        assert.equal(f.anchors(name).length, 0);
        assert.match(textOf(f.row(name)), /reference/);
        assert.deepEqual(f.opened, []); assert.deepEqual(f.copied, []);
      } finally { await f.close(); }
    });
  }
}
