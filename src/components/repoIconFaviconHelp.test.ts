import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import type { Repo } from "../state/types";
import * as repoIcon from "../state/repoIcon.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const DOCS = "https://github.com/reason-machines/openconductor/blob/main/docs/repository-icons.md";
const FAVICON = "data:image/png;base64,Zml4dHVyZQ==";
const cases = [
  { name: "detected favicon", favicon: FAVICON, remote: undefined, label: "favicon" },
  { name: "GitHub avatar", favicon: null, remote: "https://github.com/fixtures/repo.git", label: "GitHub avatar" },
  { name: "repository initial", favicon: null, remote: undefined, label: null },
];

function fixture(choice: typeof cases[number], icon: string | null) {
  const source = readFileSync(new URL("./RepoIconDialog.tsx", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: "RepoIconDialog.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const opened: string[] = [];
  const changes: (string | null)[] = [];
  let closed = 0;
  const exports: Partial<Pick<typeof import("./RepoIconDialog"), "RepoIconDialog">> = {};
  runInNewContext(javascript, {
    exports,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "../backend") return { openUrl: async (url: string) => { opened.push(url); } };
      if (name === "../state/repoIcon") return repoIcon;
      if (name === "./Dialogs") return { Modal: ({ children }: { children: ReactNode }) => children };
      if (name === "./Icons") return { CloseIcon: () => null, SearchIcon: () => null, ExternalIcon: () => null };
      if (name === "./repoIcons.generated") return { REPO_ICONS: { folder: {} } };
      if (name === "./repoEmoji") return { searchEmoji: () => assert.fail("Unexpected emoji search") };
      if (name === "./RepoIcon") return {
        isRepoIconName: (value: string) => value === "folder",
        RepoIconGlyph: () => null,
        useRepoFavicon: () => choice.favicon,
      };
      throw new Error(`Unexpected favicon help dependency: ${name}`);
    },
  });
  assert.ok(exports.RepoIconDialog);
  const repo: Repo = { id: "favicon-help-fixture", name: "Fixture", path: "", defaultBranch: "main", workspaces: [], remote: choice.remote, icon };
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.RepoIconDialog, {
      repo,
      onChange: (value: string | null) => { changes.push(value); },
      onClose: () => { closed++; },
      onError: assert.fail,
    }));
  });
  act(() => renderer.root.findByProps({ role: "tab", children: "Favicon" }).props.onClick());
  return {
    opened, changes,
    closed: () => closed,
    root: () => renderer.root,
    close() { act(() => renderer.unmount()); },
  };
}

for (const choice of cases) {
  for (const icon of [null, "folder"]) {
    test(`Favicon Learn more opens OpenConductor docs without changing or closing ${choice.name}, saved icon ${icon !== null}`, async () => {
      const view = fixture(choice, icon);
      try {
        const links = view.root().findAllByType("button").filter((button: { children: unknown[] }) => button.children.includes("Learn more"));
        assert.equal(links.length, 1, "the Favicon note exposes one Learn more action");
        assert.equal(links[0].props.type, "button");
        assert.deepEqual(view.opened, []);
        await act(async () => { await links[0].props.onClick(); });
        assert.deepEqual(view.opened, [DOCS]);
        assert.deepEqual(view.changes, []);
        assert.equal(view.closed(), 0);
        assert.equal(view.root().findByProps({ role: "tab", children: "Favicon" }).props["aria-selected"], true);
        assert.ok(readFileSync(new URL("../../docs/repository-icons.md", import.meta.url), "utf8").includes("public/favicon.svg"));
      } finally { view.close(); }
    });
  }

  test(`Favicon preview and selection remain unchanged for ${choice.name}`, () => {
    const view = fixture(choice, "folder");
    try {
      if (choice.label !== null) {
        assert.equal(view.root().findAllByType("img").length, 1);
        const image = view.root().findByType("img");
        assert.equal(image.props.src, choice.favicon ?? "https://github.com/fixtures.png?size=64");
        const button = view.root().findByProps({ children: `Use ${choice.label}` });
        act(() => button.props.onClick());
        assert.deepEqual(view.changes, [null]);
        assert.equal(view.closed(), 1);
      } else {
        assert.equal(view.root().findAllByType("img").length, 0);
        assert.equal(view.root().findByProps({ className: "repo-icon-big-initial" }).props.children, "F");
        assert.equal(view.root().findByProps({ children: "No favicon detected" }).type, "p");
        assert.deepEqual(view.changes, []);
        assert.equal(view.closed(), 0);
      }
      assert.deepEqual(view.opened, []);
    } finally { view.close(); }
  });
}
