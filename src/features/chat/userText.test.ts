import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import { emptyTranscript } from "./reducer.ts";
import type { SentUserContentV1 } from "./userContent.ts";
import * as userContent from "./userContent.ts";
import * as view from "./view.ts";
import * as groups from "./toolGroups.ts";
import * as time from "./turnTime.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string>; findAll: (predicate: (node: Node) => boolean) => Node[] };
const textOf = (node: Node | string): string => typeof node === "string" ? node : node.children.map(textOf).join("");

function statements(names: string[]): string {
  const source = ts.createSourceFile("Transcript.tsx", readFileSync(new URL("./Transcript.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return names.map((name) => {
    const node = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name
      || ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name));
    assert.ok(node, `Production ${name} exists`);
    return node.getText(source);
  }).join("\n");
}

async function fixture(text: string, rich?: SentUserContentV1) {
  const opened: string[] = [], files: string[] = [], copied: string[] = [], linkCopies: string[] = [];
  const modules = new Map<string, Record<string, unknown>>();
  function load(name: string): Record<string, unknown> {
    const cached = modules.get(name);
    if (cached) return cached;
    assert.ok(["SentUserContent.tsx", "UserText.tsx", "LinkMenu.tsx"].includes(name), `Unexpected production module ${name}`);
    const exports = {};
    modules.set(name, exports);
    const result = ts.transpileModule(readFileSync(new URL(`./${name}`, import.meta.url), "utf8"), {
      fileName: name,
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    assert.equal(result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
    runInNewContext(result.outputText, {
      exports, URL,
      require(name: string) {
        switch (name) {
          case "react": case "react/jsx-runtime": return dependencies(name);
          case "./userContent.ts": return userContent;
          case "./UserText.tsx": return load("UserText.tsx");
          case "./LinkMenu.tsx": return load("LinkMenu.tsx");
          case "../../backend.ts": return { openUrl: async (href: string) => { opened.push(href); } };
          case "../openIn/apps.ts": return { copyText: async (href: string) => { linkCopies.push(href); } };
          case "../../components/menu/ContextMenu": return {
            ContextMenu: ({ children }: { children?: React.ReactNode }) => React.createElement("div", { role: "menu" }, children),
            MenuItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect: () => void }) => React.createElement("button", { role: "menuitem", onClick: onSelect }, children),
          };
          case "../../components/menu/menuIcons": return { CopyIcon: () => null };
          default: throw new Error(`Unexpected ${name} dependency`);
        }
      },
    }, { filename: name });
    return exports;
  }
  const bindings = load("LinkMenu.tsx");
  const production = {};
  const compiled = ts.transpileModule(statements(["Transcript", "rowTurn", "groupTurns", "Row", "MessageActions", "CopyButton"]), {
    fileName: "Transcript.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  runInNewContext(compiled.outputText, {
    exports: production,
    require(name: string) { assert.equal(name, "react/jsx-runtime"); return dependencies(name); },
    React, Fragment: React.Fragment, useMemo: React.useMemo, useState: React.useState, useSyncExternalStore: React.useSyncExternalStore,
    ...view, ...groups, ...time, ...bindings,
    SentUserContent: load("SentUserContent.tsx").SentUserContent,
    UserText: existsSync(new URL("./UserText.tsx", import.meta.url)) ? load("UserText.tsx").UserText : undefined,
    Tooltip: ({ children }: { children?: React.ReactNode }) => children,
    Lucide: () => null,
    TurnFooter: () => null,
    Agent: () => { throw new Error("Unrelated assistant row reached"); },
    reportLabel: () => { throw new Error("Unrelated report row reached"); },
    navigator: { clipboard: { writeText: async (value: string) => { copied.push(value); } } },
    setTimeout: () => 1,
  }, { filename: "Transcript.tsx" });
  const transcript = { ...emptyTranscript("user-links"), messages: [{
    id: "user-message", sessionId: "user-links", turnId: "turn", role: "user", createdAt: "2026-11-10T00:00:00Z",
    blocks: [{ type: "text", text }], ...(rich ? { userContent: rich } : {}),
  }] };
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(Reflect.get(production, "Transcript"), {
      transcript, now: () => Date.parse("2026-11-10T00:00:00Z"), workspacePath: "/repo", onOpenFile: (path: string) => files.push(path),
    }));
  });
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const content = () => {
    const nodes = all((node) => node.props.className === "oc-user-text");
    assert.equal(nodes.length, 1);
    return nodes[0]!;
  };
  return {
    opened, files, copied, linkCopies, all, content,
    links: () => all((node) => node.type === "a"),
    async event(node: Node, name: string, payload: Record<string, unknown> = {}) {
      const callback = node.props[name];
      assert.equal(typeof callback, "function", `Production ${name} callback exists`);
      if (typeof callback === "function") await act(async () => { await callback(payload); });
    },
    async copy() {
      const button = all((node) => node.type === "button" && node.props["aria-label"] === "Copy message");
      assert.equal(button.length, 1);
      await this.event(button[0]!, "onClick");
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const examples: Array<{ name: string; text: string; targets: string[] }> = [
  { name: "HTTP and HTTPS in order", text: "See http://example.com/a then https://example.net/b?x=1&y=2 end", targets: ["http://example.com/a", "https://example.net/b?x=1&y=2"] },
  { name: "punctuation and quotes", text: `Before 'https://example.com/a.,!?;:' and "http://example.net/b" after`, targets: ["https://example.com/a", "http://example.net/b"] },
  { name: "balanced and excess closing brackets", text: "(https://example.com/a(b)) [https://example.net/x[y]]] https://example.org/z{q}}!", targets: ["https://example.com/a(b)", "https://example.net/x[y]", "https://example.org/z{q}"] },
  { name: "multiline raw HTML and Markdown", text: "<script>literal & safe</script>\n**raw** <https://example.com/a>\nhttp://example.net/end!", targets: ["https://example.com/a", "http://example.net/end"] },
];

for (const sample of examples) {
  test(`sent plain user text autolinks ${sample.name} without changing content or copy text`, async () => {
    const f = await fixture(sample.text);
    try {
      assert.deepEqual(f.links().map((link) => link.props.href), sample.targets, "Ordinary HTTP(S) targets are accessible anchors");
      assert.deepEqual(f.links().map(textOf), sample.targets);
      assert.equal(textOf(f.content()), sample.text);
      assert.equal(f.all((node) => node.type === "script" || node.type === "iframe" || "dangerouslySetInnerHTML" in node.props).length, 0);
      assert.equal(f.all((node) => node.type === "strong" || node.type === "em").length, 0, "User text does not become Markdown");
      await f.copy(); assert.deepEqual(f.copied, [sample.text]);
      assert.deepEqual(f.opened, []); assert.deepEqual(f.files, []);
    } finally { await f.close(); }
  });
}

test("sent user anchors use the unchanged production LinkWithMenu opener callback and context action", async () => {
  const href = "https://example.com/a?q=one&b=two#part";
  const f = await fixture(`Open ${href}.`);
  try {
    assert.equal(f.links().length, 1, "Plain sent text has a production link");
    const link = f.links()[0]!;
    assert.equal(link.props.href, href); assert.equal(textOf(link), href);
    assert.equal(link.props.target, "_blank"); assert.match(String(link.props.rel), /noopener/);
    let prevented = 0;
    await f.event(link, "onClick", { preventDefault: () => { prevented++; } });
    assert.equal(prevented, 1); assert.deepEqual(f.opened, [href]); assert.deepEqual(f.files, []);
    await f.event(link, "onContextMenu", { preventDefault: () => { prevented++; }, clientX: 40, clientY: 50 });
    assert.equal(prevented, 2);
    const menu = f.all((node) => node.props.role === "menuitem");
    assert.equal(menu.length, 1); assert.equal(textOf(menu[0]!), "Copy link address");
    await f.event(menu[0]!, "onClick");
    assert.deepEqual(f.linkCopies, [href]); assert.deepEqual(f.opened, [href]);
  } finally { await f.close(); }
});

test("rich sent text autolinks around unchanged file and attachment chips with isolated callbacks", async () => {
  const rich: SentUserContentV1 = {
    version: 1,
    parts: [{ kind: "text", text: "https://example.com/a " }, { kind: "file", path: "src/a.ts", label: "a.ts", directory: false }, { kind: "text", text: "\nthen http://example.net/b!" }],
    attachments: [{ kind: "workspace-file", name: "notes.txt", path: "notes.txt", label: "notes.txt" }, { kind: "embedded", name: "image.png", label: "image.png" }],
  };
  const originalText = "https://example.com/a @src/a.ts\nthen http://example.net/b!";
  const f = await fixture(originalText, rich);
  try {
    assert.deepEqual(f.links().map((link) => link.props.href), ["https://example.com/a", "http://example.net/b"], "Both rich text parts use production autolinks");
    assert.equal(textOf(f.content()), "https://example.com/a a.ts\nthen http://example.net/b!\n\nnotes.txt\n\nAttached: image.png");
    const chips = f.all((node) => node.props.className === "oc-sent-file-chip");
    assert.equal(chips.length, 2); assert.ok(chips.every((chip) => chip.type === "button"));
    assert.deepEqual(chips.map((chip) => chip.props.title), ["src/a.ts", "notes.txt"]);
    for (const chip of chips) await f.event(chip, "onClick");
    assert.deepEqual(f.files, ["/repo/src/a.ts", "/repo/notes.txt"]); assert.deepEqual(f.opened, []);
    let prevented = 0;
    for (const link of f.links()) await f.event(link, "onClick", { preventDefault: () => { prevented++; } });
    assert.equal(prevented, 2); assert.deepEqual(f.opened, ["https://example.com/a", "http://example.net/b"]);
    assert.deepEqual(f.files, ["/repo/src/a.ts", "/repo/notes.txt"]);
    await f.copy(); assert.deepEqual(f.copied, [originalText]);
  } finally { await f.close(); }
});

for (const input of [
  "No URL: **literal** <img src=x> user@example.com mailto:person@example.com javascript:alert(1) data:text/plain,hi ftp://example.com HTTPS://example.com",
  "https://en.wikipedia.org/wiki/Test https://en.wiktionary.org/wiki/test https://example.com/?q=wikipedia.org",
  "https://app.conductor.build/workspace/one?session=two https://stage-app.conductor.build/workspace/id http://localhost:3000/workspace/id http://127.0.0.1:4000/workspace/id",
  "conductor-file://src/a.ts conductor-file-code://src/b.ts file:///repo/c.ts",
]) {
  test(`excluded user text stays literal without ordinary navigation: ${input.slice(0, 45)}`, async () => {
    const f = await fixture(input);
    try {
      assert.equal(f.links().length, 0); assert.equal(textOf(f.content()), input);
      assert.equal(f.all((node) => node.type === "iframe" || node.type === "img" || node.type === "script" || "dangerouslySetInnerHTML" in node.props).length, 0);
      await f.copy(); assert.deepEqual(f.copied, [input]);
      assert.deepEqual(f.opened, []); assert.deepEqual(f.files, []);
    } finally { await f.close(); }
  });
}

test("only exact special-workspace routes are excluded; ordinary origin and path variants stay web links", async () => {
  const targets = ["https://app.conductor.build/help", "https://app.conductor.build/workspace/id/more", "https://example.com/workspace/id", "https://localhost:3000/workspace/id", "http://localhost:3000/workspace/id/", "https://example.com/Wikipedia.org"];
  const input = targets.join("\n");
  const f = await fixture(input);
  try {
    assert.deepEqual(f.links().map((link) => link.props.href), targets);
    assert.equal(textOf(f.content()), input);
  } finally { await f.close(); }
});
