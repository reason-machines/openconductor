import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import type { Repo } from "../state/types";
import * as repoIcon from "../state/repoIcon.ts";
import { REPO_EMOJI, searchEmoji } from "./repoEmoji.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

function fixture(icon: string | null = null) {
  const source = readFileSync(new URL("./RepoIconDialog.tsx", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: "RepoIconDialog.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./RepoIconDialog"), "RepoIconDialog">> = {};
  runInNewContext(javascript, {
    exports,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "../backend") return { openUrl: () => assert.fail("Unexpected URL launch in emoji picker test") };
      if (name === "../state/repoIcon") return repoIcon;
      if (name === "./repoEmoji") return { searchEmoji };
      if (name === "./Dialogs") return { Modal: ({ children }: { children: ReactNode }) => children };
      if (name === "./Icons") return { CloseIcon: () => null, SearchIcon: () => null };
      if (name === "./repoIcons.generated") return { REPO_ICONS: { folder: {} } };
      if (name === "./RepoIcon") return {
        isRepoIconName: (value: string) => value === "folder",
        RepoIconGlyph: () => null,
        useRepoFavicon() { throw new Error("Unexpected favicon I/O in emoji picker test"); },
      };
      throw new Error(`Unexpected repository emoji dependency: ${name}`);
    },
  });
  assert.ok(exports.RepoIconDialog);
  const repo: Repo = { id: "test-repo", name: "Test", path: "", defaultBranch: "main", workspaces: [], icon };
  const changes: (string | null)[] = [];
  let closed = 0;
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(exports.RepoIconDialog, {
      repo,
      onChange: (value: string | null) => { changes.push(value); },
      onClose: () => { closed++; },
      onError: (message: string) => { throw new Error(message); },
    }));
  });
  act(() => renderer.root.findByProps({ role: "tab", children: "Emoji" }).props.onClick());
  const options = () => renderer.root.findAllByProps({ className: "repo-icon-cell repo-icon-emoji-cell" });
  return {
    changes,
    closed: () => closed,
    options,
    status: () => renderer.root.findAllByProps({ role: "status" }),
    query(value: string) {
      const input = renderer.root.findByType("input");
      assert.equal(input.props.placeholder, "Search emoji");
      act(() => input.props.onChange({ target: { value } }));
    },
    click(label: string) { act(() => renderer.root.findByProps({ "aria-label": label }).props.onClick()); },
    close() { act(() => renderer.unmount()); },
  };
}

test("repository emoji search shows No emoji found without changing or closing the icon dialog", () => {
  const view = fixture();
  try {
    view.query("no-such-repository-emoji");
    assert.equal(view.options().length, 0);
    assert.equal(view.status().length, 1);
    assert.equal(view.status()[0].props.children, "No emoji found");
    assert.deepEqual(view.changes, []);
    assert.equal(view.closed(), 0);
  } finally { view.close(); }
});

test("repository emoji empty state disappears when the query matches or is cleared", () => {
  const view = fixture();
  try {
    assert.equal(view.status().length, 0);
    assert.equal(view.options().length, REPO_EMOJI.length);
    view.query("no-such-repository-emoji");
    assert.equal(view.status().length, 1);
    view.query(" ROCKET ");
    assert.equal(view.status().length, 0);
    assert.equal(view.options().length, 1);
    assert.equal(view.options()[0].props.children, "\u{1f680}");
    view.query("   ");
    assert.equal(view.status().length, 0);
    assert.equal(view.options().length, REPO_EMOJI.length);
    assert.deepEqual(view.changes, []);
    assert.equal(view.closed(), 0);
  } finally { view.close(); }
});

test("repository emoji search still selects a matching emoji and closes once", () => {
  const view = fixture();
  try {
    view.query("rocket");
    view.click("rocket launch");
    assert.deepEqual(view.changes, ["emoji:\u{1f680}"]);
    assert.equal(view.closed(), 1);
  } finally { view.close(); }
});

test("Remove emoji stays available with no results and clears the repository icon once", () => {
  const view = fixture("emoji:\u{1f525}");
  try {
    view.query("no-such-repository-emoji");
    view.click("Remove emoji");
    assert.deepEqual(view.changes, [null]);
    assert.equal(view.closed(), 1);
  } finally { view.close(); }
});
