import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import type { ReactNode } from "react";

const deps = createRequire(new URL("../../../package.json", import.meta.url));
const React: typeof import("react") = deps("react");
const ts: typeof import("typescript") = deps("typescript");
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[]; findAll: (predicate: (node: Node) => boolean) => Node[] };
type Renderer = { root: Node; update: (element: ReactNode) => void; unmount: () => void };
const { create, act }: {
  create: (element: ReactNode, options: { createNodeMock: () => unknown }) => Renderer;
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");

function appRoot(Host: typeof import("./BrowserPreview").BrowserPreviewHost) {
  const path = resolve("src/App.tsx");
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const app = source.statements.find((node): node is import("typescript").FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "App");
  assert.ok(app?.body);
  const returns = app.body.statements.flatMap((node) => ts.isReturnStatement(node) ? [node] : ts.isIfStatement(node) && ts.isReturnStatement(node.thenStatement) ? [node.thenStatement] : []);
  assert.equal(returns.length, 3, "exercise all actual App root return branches");
  const roots = returns.map((node) => {
    assert.ok(node.expression && ts.isParenthesizedExpression(node.expression));
    const fragment = node.expression.expression;
    assert.ok(ts.isJsxFragment(fragment));
    const page = fragment.children.find((child) => !ts.isJsxText(child));
    assert.ok(page && (ts.isJsxElement(page) || ts.isJsxFragment(page)));
    const start = fragment.getStart(source);
    const jsx = fragment.getText(source);
    return jsx.slice(0, page.getStart(source) - start) + '<div data-view={view} />' + jsx.slice(page.end - start);
  });
  const compiled = ts.transpileModule(`function AppRoot({view = "workspace"}) {
    if (view === "diagnostics") return (${roots[0]});
    if (view === "settings") return (${roots[1]});
    return (${roots[2]});
  }`, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const toaster = React.createElement("span", { "data-testid": "retained-toast" }, "Toast");
  const Root: (props: { view?: string }) => ReactNode = runInThisContext(`(function(require,exports,BrowserPreviewHost,toaster){${compiled}\nreturn AppRoot;})`, { filename: path })(deps, {}, Host, toaster);
  return Root;
}

async function fixture(withAppRoot = false) {
  const external: string[] = [];
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const directory = resolve("src/features/browser");
  function load(path: string): Record<string, unknown> {
    const existing = cache.get(path);
    if (existing) return existing.exports;
    const module = { exports: {} };
    cache.set(path, module);
    const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } });
    const require = (name: string): unknown => {
      if (name === "react" || name === "react/jsx-runtime") return deps(name);
      if (name === "../../backend") return { openUrl: async (url: string) => { external.push(url); } };
      if (name.endsWith(".css")) return {};
      const child = resolve(dirname(path), name);
      assert.ok(child.startsWith(directory + "/"), `Unexpected dependency ${name}`);
      return load(child);
    };
    runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const view = load(resolve(directory, "BrowserPreview.tsx"));
  const source = load(resolve(directory, "store.ts"));
  assert.equal(typeof view.BrowserPreviewHost, "function");
  assert.equal(typeof source.openBrowserPreview, "function");
  const Host = view.BrowserPreviewHost as typeof import("./BrowserPreview").BrowserPreviewHost;
  const store = source as typeof import("./store.ts");
  const Root = withAppRoot ? appRoot(Host) : undefined;
  const tree = (view = "workspace") => Root ? React.createElement(Root, { view }) : React.createElement(Host);
  let renderer: Renderer;
  await act(async () => { renderer = create(tree(), { createNodeMock: () => null }); });
  const byLabel = (label: string) => {
    const node = renderer.root.findAll((item) => item.type === "button" && item.props["aria-label"] === label)[0];
    assert.ok(node, `mounted ${label} button`);
    return node;
  };
  const call = async (node: Node, name: string, event?: unknown) => {
    const handler = node.props[name];
    assert.equal(typeof handler, "function");
    await act(async () => { if (typeof handler === "function") handler(event); });
  };
  return {
    external, store,
    view: (view: string) => act(async () => { renderer.update(tree(view)); }),
    toast: () => renderer.root.findAll((node) => node.props["data-testid"] === "retained-toast")[0],
    frames: () => renderer.root.findAll((node) => node.type === "iframe"),
    surface: () => renderer.root.findAll((node) => node.props.className === "oc-browser-surface"),
    open: (workspaceId: string, url: string) => act(async () => { assert.equal(store.openBrowserPreview(workspaceId, url), true); }),
    place: (workspaceId: string, url: string) => act(async () => { store.placeBrowserPreview({ owner: Symbol(workspaceId), workspaceId, url, rect: { left: 25, top: 100, width: 800, height: 500 } }); }),
    park: () => act(async () => { const owner = store.browserSnapshot().placement?.owner; if (owner) store.parkBrowserPreview(owner); }),
    closePage: (workspaceId: string) => act(async () => { store.closeBrowserPreview(workspaceId); }),
    click: (label: string) => call(byLabel(label), "onClick"),
    fail: () => call(renderer.root.findAll((node) => node.type === "iframe")[0], "onError"),
    text: () => {
      const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
      return text(renderer.root);
    },
    edit: async (value: string) => {
      const input = renderer.root.findAll((node) => node.type === "input")[0];
      await call(input, "onChange", { target: { value } });
      await call(input, "onKeyDown", { key: "Enter", preventDefault() {}, currentTarget: { blur() {} } });
    },
    close: () => act(async () => { renderer.unmount(); }),
  };
}

test("actual global host retains iframe identity through chat, Home and workspace hiding; close disposes it", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.open("a", "http://localhost:51001/A");
  await f.place("a", "http://localhost:51001/A");
  const frame = f.frames()[0];
  assert.equal(frame.props.sandbox, "allow-scripts allow-same-origin allow-popups allow-forms allow-modals");
  assert.equal(frame.props.referrerPolicy, "no-referrer");
  assert.equal(f.surface()[0].props["aria-hidden"], false);
  await f.park();
  assert.equal(f.frames()[0], frame, "no page reload while chat/Home has no browser anchor");
  assert.equal(f.surface()[0].props["aria-hidden"], true);
  await f.open("b", "http://localhost:51002/B");
  await f.place("b", "http://localhost:51002/B");
  assert.equal(f.frames()[0], frame, "workspace B cannot replace A's iframe");
  await f.place("a", "http://localhost:51001/A");
  assert.equal(f.frames()[0], frame);
  await f.closePage("a");
  assert.deepEqual(f.frames().map((node) => node.props.src), ["http://localhost:51002/B"]);
});

for (const retained of ["toast", "browser document"]) {
  test(`actual App roots retain the ${retained} through Settings and Diagnostics`, async (t) => {
    const f = await fixture(true); t.after(f.close);
    await f.open("a", "http://localhost:51001/A");
    await f.place("a", "http://localhost:51001/A");
    const current = () => retained === "toast" ? f.toast() : f.frames()[0];
    const initial = current();
    assert.ok(initial);
    for (const view of ["settings", "workspace", "diagnostics", "settings", "workspace"]) {
      await f.park();
      await f.view(view);
      assert.ok(current() === initial, `${view} must not remount the ${retained}`);
      assert.equal(f.surface()[0].props["aria-hidden"], true);
    }
    await f.place("a", "http://localhost:51001/A");
    assert.ok(current() === initial);
    assert.equal(f.surface()[0].props["aria-hidden"], false);
  });
}

test("actual Reload and repeated Run preview replace the iframe document", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.open("a", "http://localhost:51001/A");
  const first = f.frames()[0];
  const originalUrl = first.props.src;
  await f.click("Reload");
  const second = f.frames()[0];
  assert.notEqual(second, first);
  assert.equal(second.props.src, originalUrl);
  await f.open("a", "http://localhost:51001/A");
  assert.notEqual(f.frames()[0], second);
});

test("actual address control navigates port/path on the locked host and rejects credentials", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.open("a", "http://localhost:51001/A");
  await f.edit(":51002@evil.test/");
  assert.equal(f.frames()[0].props.src, "http://localhost:51001/A");
  assert.match(f.text(), /Enter a valid port and path/);
  await f.edit("51002/next?q=1");
  assert.equal(f.frames()[0].props.src, "http://localhost:51002/next?q=1");
  assert.doesNotMatch(f.text(), /Enter a valid/);
});

test("actual iframe error leaves manual external fallback and Reload available without opening a popup", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.open("a", "http://localhost:51001/A");
  await f.fail();
  assert.equal(f.frames().length, 0);
  assert.match(f.text(), /Preview not available/);
  assert.deepEqual(f.external, []);
  await f.click("Open in browser");
  assert.deepEqual(f.external, ["http://localhost:51001/A"]);
  await f.click("Reload");
  assert.equal(f.frames()[0].props.src, "http://localhost:51001/A");
});
