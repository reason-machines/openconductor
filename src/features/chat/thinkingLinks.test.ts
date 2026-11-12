import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import type { TranscriptProps } from "./Transcript.tsx";
import { Markdown } from "./markdown.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { assistantDisplayText } from "./assistantText.ts";
import * as view from "./view.ts";
import * as groups from "./toolGroups.ts";
import * as time from "./turnTime.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string> };
const textOf = (node: Node | string): string => typeof node === "string" ? node : node.children.map(textOf).join("");

function transcriptStatements(): string {
  const source = ts.createSourceFile("Transcript.tsx", readFileSync(new URL("./Transcript.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return ["toolDisclosure", "Transcript", "rowTurn", "groupTurns", "Row", "Agent", "SummaryRow", "Part", "ThinkingRow"].map((name) => {
    const node = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name
      || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name));
    assert.ok(node, `Production ${name} exists`);
    return node.getText(source);
  }).join("\n");
}

async function fixture({ text, streaming = false, assistantText }: { text: string; streaming?: boolean; assistantText?: string }) {
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
    useBoolPref: () => false, assistantDisplayText,
    ...view, ...groups, ...time, ...links,
    Markdown, thinkingChipText,
    openUrl: async (href: string) => { opened.push(href); },
    Lucide: () => null,
    TurnFooter: () => null,
    ConductorToolRow: unexpected("ConductorToolRow"),
    UserText: unexpected("UserText"),
    SentUserContent: unexpected("SentUserContent"),
    MessageActions: unexpected("MessageActions"),
    reportLabel: unexpected("reportLabel"),
  }, { filename: "Transcript.tsx" });
  assert.equal(typeof production.Transcript, "function");
  assert.ok(production.Transcript);
  const ProductionTranscript = production.Transcript;

  function transcript(thinking: string, running: boolean) {
    const result = applyChatEvents(emptyTranscript("thinking-links"), [
      { type: "turn_status", sessionId: "thinking-links", turnId: "turn", status: "running" },
      { type: "upsert", message: {
        id: "assistant", sessionId: "thinking-links", turnId: "turn", role: "assistant", createdAt: "2026-11-10T00:00:00Z",
        blocks: [{ type: "thinking", text: thinking }, ...(assistantText === undefined ? [] : [{ type: "text" as const, text: assistantText }])],
      } },
      ...(running ? [] : [{ type: "turn_status" as const, sessionId: "thinking-links", turnId: "turn", status: "completed" as const }]),
    ]);
    assert.ok(result.ok);
    return result.transcript;
  }
  const props = (thinking: string, running: boolean) => ({ transcript: transcript(thinking, running), now: () => Date.parse("2026-11-10T00:00:00Z") });
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(ProductionTranscript, props(text, streaming))); });
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  return {
    opened, copied, all,
    anchors: () => all((node) => node.type === "a"),
    thinking: () => all((node) => typeof node.props.className === "string" && node.props.className.includes("chat-thinking")),
    async event(node: Node, name: string, payload: Record<string, unknown> = {}) {
      const callback = node.props[name];
      assert.equal(typeof callback, "function", `Production ${name} callback exists`);
      if (typeof callback === "function") await act(async () => { await callback(payload); });
    },
    async toggle() {
      const trigger = all((node) => node.props.className === "oc-tool-head opens");
      assert.equal(trigger.length, 1, "The actual Thinking row has one toggle");
      await this.event(trigger[0]!, "onClick");
    },
    async update(thinking: string, running: boolean) {
      await act(async () => { renderer.update(React.createElement(ProductionTranscript, props(thinking, running))); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const href of ["http://example.com/a?q=one&b=two#part", "https://example.net/b?q=two#end"]) {
  test(`expanded Thinking uses the existing external opener for ${href}`, async () => {
    const f = await fixture({ text: `Inspect [reference](${href}) before proceeding.` });
    try {
      assert.equal(f.anchors().length, 0, "Completed thinking starts collapsed");
      await f.toggle();
      assert.equal(f.anchors().length, 1);
      const anchor = f.anchors()[0]!;
      assert.equal(anchor.props.href, href);
      assert.equal(textOf(anchor), "reference");
      assert.equal(anchor.props.target, "_blank");
      assert.match(String(anchor.props.rel), /noopener/);
      let prevented = 0;
      await f.event(anchor, "onClick", { preventDefault: () => { prevented++; } });
      assert.equal(prevented, 1, "Thinking links must intercept navigation through the app opener");
      assert.deepEqual(f.opened, [href]);
      assert.deepEqual(f.copied, []);
    } finally { await f.close(); }
  });

  test(`expanded Thinking exposes the existing link-copy action for ${href}`, async () => {
    const f = await fixture({ text: `Inspect [reference](${href}).` });
    try {
      await f.toggle();
      const anchor = f.anchors()[0]!;
      assert.equal(anchor.props.href, href);
      let prevented = 0;
      await f.event(anchor, "onContextMenu", { preventDefault: () => { prevented++; }, clientX: 40, clientY: 50 });
      assert.equal(prevented, 1);
      const menu = f.all((node) => node.props.role === "menuitem");
      assert.equal(menu.length, 1);
      assert.equal(textOf(menu[0]!), "Copy link address");
      await f.event(menu[0]!, "onClick");
      assert.deepEqual(f.copied, [href]);
      assert.deepEqual(f.opened, []);
    } finally { await f.close(); }
  });
}

test("Thinking keeps its link route after streaming completes and the row is collapsed and reopened", async () => {
  const href = "https://example.com/stream?q=one#complete";
  const f = await fixture({ text: `[reference](${href})`, streaming: true });
  try {
    assert.equal(f.anchors().length, 1, "Streaming thinking is expanded");
    await f.update(`[reference](${href}) and completed text.`, false);
    assert.equal(f.anchors().length, 0, "Completed thinking uses the existing collapsed default");
    await f.toggle();
    assert.equal(f.anchors().length, 1);
    await f.toggle(); assert.equal(f.anchors().length, 0);
    await f.toggle(); assert.equal(f.anchors().length, 1);
    assert.match(textOf(f.thinking()[0]!), /and completed text\./);
    let prevented = 0;
    await f.event(f.anchors()[0]!, "onClick", { preventDefault: () => { prevented++; } });
    assert.equal(prevented, 1, "Reopened Thinking links keep the app opener");
    assert.deepEqual(f.opened, [href]);
  } finally { await f.close(); }
});

test("ordinary assistant links keep their existing opener and menu beside a Thinking block", async () => {
  const href = "https://example.com/final?q=unchanged#part";
  const f = await fixture({ text: "Private planning stays collapsed.", assistantText: `Final [reference](${href}).` });
  try {
    assert.equal(f.anchors().length, 1);
    const anchor = f.anchors()[0]!;
    let prevented = 0;
    await f.event(anchor, "onClick", { preventDefault: () => { prevented++; } });
    assert.equal(prevented, 1); assert.deepEqual(f.opened, [href]);
    await f.event(anchor, "onContextMenu", { preventDefault: () => { prevented++; }, clientX: 10, clientY: 20 });
    const menu = f.all((node) => node.props.role === "menuitem");
    assert.equal(menu.length, 1); assert.equal(textOf(menu[0]!), "Copy link address");
    await f.event(menu[0]!, "onClick");
    assert.deepEqual(f.copied, [href]); assert.deepEqual(f.opened, [href]);
    assert.equal(prevented, 2);
  } finally { await f.close(); }
});

test("Thinking still renders Markdown and escaped HTML without adding links to plain text or code", async () => {
  const f = await fixture({ text: "**Plan** and plain text.\n\n<script>not executable</script>\n\n```ts\nconst answer = 42;\n```" });
  try {
    await f.toggle();
    assert.equal(f.anchors().length, 0);
    assert.equal(f.all((node) => node.type === "strong").length, 1);
    assert.equal(f.all((node) => node.type === "script" || node.type === "iframe" || "dangerouslySetInnerHTML" in node.props).length, 0);
    assert.equal(f.all((node) => node.type === "button" && node.props["aria-label"] === "Copy code").length, 1);
    assert.match(textOf(f.thinking()[0]!), /const answer = 42;/);
    assert.deepEqual(f.opened, []); assert.deepEqual(f.copied, []);
  } finally { await f.close(); }
});
