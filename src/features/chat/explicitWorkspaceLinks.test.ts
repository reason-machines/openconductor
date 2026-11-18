import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import { Markdown } from "./markdown.ts";

// Source preparation only until the existing coordinator grants one bounded run.
// Markdown/remark and LinkMenu are production code. The portal, clipboard and
// external opener are adapters: this is not browser/native/OS clipboard proof.
const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string> };
type Options = { workspacePath?: string; noWorkspace?: boolean; noCallback?: boolean; plainLink?: boolean };
const textOf = (node: Node | string): string => typeof node === "string" ? node : node.children.map(textOf).join("");
const compiled = ts.transpileModule(readFileSync(new URL("./LinkMenu.tsx", import.meta.url), "utf8"), {
  fileName: "LinkMenu.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);

async function fixture(initialText: string, initialOptions: Options = {}) {
  const files: Array<[string, string]> = [], external: string[] = [], copies: string[] = [];
  let text = initialText, options = initialOptions, tag = "first", prevented = 0;
  const links: Partial<typeof import("./LinkMenu.tsx")> = {};
  runInNewContext(compiled.outputText, {
    exports: links,
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "../openIn/apps.ts": return { copyText: async (value: string) => { copies.push(value); } };
        case "../../components/menu/ContextMenu": return {
          ContextMenu: ({ children }: { children?: React.ReactNode }) => React.createElement("div", { role: "menu" }, children),
          MenuItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect: () => void }) =>
            React.createElement("button", { role: "menuitem", onClick: onSelect }, children),
        };
        case "../../components/menu/menuIcons": return { CopyIcon: () => null };
        default: throw new Error(`Unexpected LinkMenu dependency ${name}`);
      }
    },
  }, { filename: "LinkMenu.tsx" });
  assert.ok(links.LinkWithMenu);
  function Scene() {
    const current = tag;
    return React.createElement(Markdown, {
      text,
      workspacePath: options.noWorkspace ? undefined : options.workspacePath ?? "/workspace",
      onOpenFile: options.noCallback ? undefined : (path: string, ...extra: unknown[]) => {
        assert.equal(extra.length, 0, "Markdown must not invent line/origin callback arguments");
        files.push([current, path]);
      },
      onOpenLink: (href) => { external.push(href); },
      Link: options.plainLink ? undefined : links.LinkWithMenu,
    });
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const interactive = (label: string) => all((node) => (node.type === "a" || node.type === "button") && typeof node.props.onClick === "function" && textOf(node) === label);
  async function event(node: Node, name: string) {
    assert.equal(typeof node.props[name], "function", `Observed production ${name} handler exists`);
    await act(async () => {
      await (node.props[name] as (event: Record<string, unknown>) => unknown)({
        preventDefault() { prevented++; }, clientX: 3, clientY: 5,
        metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, button: 0,
      });
    });
  }
  return {
    files, external, copies, all, interactive, event,
    get prevented() { return prevented; },
    async click(label = "source") {
      const nodes = interactive(label);
      assert.equal(nodes.length, 1, "EXPLICIT_WORKSPACE_HREF_MUST_USE_FILE_NAVIGATION");
      await event(nodes[0]!, "onClick");
    },
    async update(nextText: string, nextOptions = options, nextTag = tag) {
      text = nextText; options = nextOptions; tag = nextTag;
      await act(async () => { renderer.update(React.createElement(Scene)); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const positive = [
  { text: "[source](src/a.ts)", expected: "/workspace/src/a.ts" },
  { text: "[source](./src/a.ts)", expected: "/workspace/src/a.ts" },
  { text: "[source](/workspace/src/a.ts)", expected: "/workspace/src/a.ts" },
  { text: "[source](README.md)", expected: "/workspace/README.md" },
  { text: "[source][target]\n\n[target]: src/a.ts", expected: "/workspace/src/a.ts" },
  { text: "[**source**](src/a.ts)", expected: "/workspace/src/a.ts", strong: true },
  { text: "[source](src/My%20File.ts)", expected: "/workspace/src/My File.ts" },
  { text: "[source](src/a%2520b.ts)", expected: "/workspace/src/a%20b.ts" },
  { text: "[source](src/a%3Fraw.ts)", expected: "/workspace/src/a?raw.ts" },
  { text: "[source](src/a%23part.ts)", expected: "/workspace/src/a#part.ts" },
  { text: "[source](src/a%ZZ.ts)", expected: "/workspace/src/a%ZZ.ts" },
  { text: "[source](src/a.ts?view=raw#L8)", expected: "/workspace/src/a.ts" },
  { text: "[source](src/inner/../a.ts:12:4)", expected: "/workspace/src/a.ts" },
] as const;
for (const item of positive) {
  test(`explicit local href navigates within workspace: ${item.text}`, async () => {
    const f = await fixture(item.text);
    try {
      await f.click();
      assert.deepEqual(f.files, [["first", item.expected]], "EXPLICIT_WORKSPACE_HREF_MUST_USE_FILE_NAVIGATION");
      assert.deepEqual(f.external, [], "Workspace navigation must not reach the external opener");
      assert.equal(f.prevented, 1);
      if ("strong" in item) assert.equal(f.all((node) => node.type === "strong" && textOf(node) === "source").length, 1);
    } finally { await f.close(); }
  });
}

test("workspace and callback replacement cannot retain an earlier explicit-link destination", async () => {
  const f = await fixture("[source](src/a.ts)");
  try {
    await f.click();
    assert.deepEqual(f.files, [["first", "/workspace/src/a.ts"]], "EXPLICIT_WORKSPACE_HREF_MUST_USE_FILE_NAVIGATION");
    await f.update("[source](src/b.ts)", { workspacePath: "/second" }, "second");
    await f.click();
    assert.deepEqual(f.files, [["first", "/workspace/src/a.ts"], ["second", "/second/src/b.ts"]]);
    await f.update("[source](src/c.ts)", { workspacePath: "/second", noCallback: true }, "third");
    assert.equal(f.interactive("source").length, 0, "Removed file capability must not retain an old closure");
    assert.deepEqual(f.files, [["first", "/workspace/src/a.ts"], ["second", "/second/src/b.ts"]]);
    assert.deepEqual(f.external, []);
  } finally { await f.close(); }
});

test("default anchor, not just custom Link, intercepts explicit workspace navigation", async () => {
  const f = await fixture("[source](src/a.ts)", { plainLink: true });
  try {
    await f.click();
    assert.deepEqual(f.files, [["first", "/workspace/src/a.ts"]], "EXPLICIT_WORKSPACE_HREF_MUST_USE_FILE_NAVIGATION");
    assert.deepEqual(f.external, []);
    assert.equal(f.prevented, 1);
  } finally { await f.close(); }
});

test("rejected or missing-capability explicit local hrefs remain noninteractive", async () => {
  const cases: Array<{ href: string; options?: Options }> = [
    { href: "../outside.ts" }, { href: "/outside.ts" }, { href: "/workspace-other/a.ts" },
    { href: "/workspace" }, { href: "./" }, { href: "src/../../outside.ts" },
    { href: "%2e%2e/outside.ts" }, { href: "%68ttps%3A%2F%2Fevil.test%2Fa.ts" },
    { href: "%2F%2Fevil.test%2Fa.ts" },
    { href: "src/a.ts", options: { noWorkspace: true } },
    { href: "src/a.ts", options: { workspacePath: "workspace" } },
    { href: "src/a.ts", options: { noCallback: true } },
  ];
  for (const item of cases) {
    const f = await fixture(`[source](${item.href})`, item.options);
    try {
      assert.equal(f.interactive("source").length, 0, `EXPLICIT_FILE_HREF_MUST_NOT_FALL_BACK_TO_EXTERNAL: ${item.href}`);
      const spans = f.all((node) => node.type === "span" && textOf(node) === "source");
      assert.equal(spans.length, 1);
      await f.event(spans[0]!, "onContextMenu");
      const menu = f.all((node) => node.props.role === "menuitem" && textOf(node) === "Copy link address");
      assert.equal(menu.length, 1, "Inert file targets must retain their existing copy menu");
      await f.event(menu[0]!, "onClick");
      assert.deepEqual(f.copies, [item.href]);
      assert.deepEqual(f.files, []);
      assert.deepEqual(f.external, []);
    } finally { await f.close(); }
  }
});

test("external, fragment and protocol-relative anchors retain current opener and menu callbacks", async () => {
  for (const href of ["https://example.test/src/a.ts?x=1#part", "http://example.test/a", "mailto:person@example.test", "#section", "//example.test/src/a.ts"]) {
    const f = await fixture(`[source](${href})`);
    try {
      await f.click();
      assert.deepEqual(f.files, []);
      assert.deepEqual(f.external, [href]);
      const anchor = f.interactive("source")[0]!;
      await f.event(anchor, "onContextMenu");
      const menu = f.all((node) => node.props.role === "menuitem" && textOf(node) === "Copy link address");
      assert.equal(menu.length, 1);
      await f.event(menu[0]!, "onClick");
      assert.deepEqual(f.copies, [href]);
    } finally { await f.close(); }
  }
});

test("existing custom-menu copy remains available on an accepted explicit local href", async () => {
  const f = await fixture("[source](src/a.ts?view=raw#L8)");
  try {
    const nodes = f.interactive("source");
    assert.equal(nodes.length, 1);
    await f.event(nodes[0]!, "onContextMenu");
    const menu = f.all((node) => node.props.role === "menuitem" && textOf(node) === "Copy link address");
    assert.equal(menu.length, 1);
    await f.event(menu[0]!, "onClick");
    assert.deepEqual(f.copies, ["src/a.ts?view=raw#L8"]);
    assert.deepEqual(f.files, []);
    assert.deepEqual(f.external, []);
  } finally { await f.close(); }
});

test("generated code and plain file links keep their current path-only callbacks", async () => {
  const f = await fixture("`src/a.ts` and src/b.ts next.");
  try {
    const buttons = f.all((node) => node.props.className === "md-file-link");
    assert.equal(buttons.length, 2);
    for (const button of buttons) await f.event(button, "onClick");
    assert.deepEqual(f.files, [["first", "/workspace/src/a.ts"], ["first", "/workspace/src/b.ts"]]);
    assert.deepEqual(f.external, []);
  } finally { await f.close(); }
});

test("fenced explicit syntax and sanitized special file URI forms add no file navigation", async () => {
  const f = await fixture("```text\n[source](src/a.ts)\n```\n\n[source](file:///workspace/src/a.ts) [other](conductor-file:///workspace/src/a.ts)");
  try {
    assert.equal(f.all((node) => node.props.className === "md-file-link").length, 0);
    assert.deepEqual(f.files, []);
    assert.deepEqual(f.external, []);
    // Current ReactMarkdown URL sanitization remains in force; no protocol
    // transform is relaxed and no sanitized target handler is manually invoked.
    assert.equal(f.all((node) => typeof node.props.href === "string" && /^(?:file|conductor-file):/.test(String(node.props.href))).length, 0);
  } finally { await f.close(); }
});
