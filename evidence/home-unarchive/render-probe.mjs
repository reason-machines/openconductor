import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as home from "../../src/home/allWorkspaces.ts";
import * as status from "../../src/state/rowStatus.ts";
import { workspaceNumberLabel } from "../../src/state/workspaceNumber.ts";

const require = createRequire(import.meta.url);
const path = new URL("../../src/components/AllWorkspaces.tsx", import.meta.url);
const source = readFileSync(path, "utf8");
const ioCalls = [];
const unexpectedIo = () => {
  ioCalls.push("unexpected I/O");
  throw new Error("No native or archive I/O is allowed in this render probe");
};
const repo = {
  id: "local-repo", name: "Local repo", path: "/fixture/local", defaultBranch: "main",
  workspaces: [
    { id: "archived-workspace", name: "Archived fixture", userSetWorkspaceName: true, branch: "archived-branch", status: "archived", state: "archived", diff: { added: 0, removed: 0 }, createdAt: 1794268800000 },
    { id: "active-workspace", name: "Active fixture", userSetWorkspaceName: true, branch: "active-branch", status: "idle", state: "ready", diff: { added: 0, removed: 0 }, createdAt: 1794268800000 },
  ],
};

function renderHome(archiveFilter) {
  const exports = {};
  const dependencies = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects: [], archiveFilter }) },
    "../state/rowStatus": status,
    "../state/workspaceNumber": { workspaceNumberLabel },
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../settings/useStatusMatrix": { useStatusMatrix: () => false },
    "../settings/useBoolPref": { useBoolPref: () => false },
    "../keybindings/overrides": { effectiveShortcuts: () => [] },
    "../keybindings/shortcut": { glyphs: () => "" },
    "../workspace/archive": { listArchivedWorkspaces: unexpectedIo },
    "./Icons": { ArchiveIcon: () => null, ChevronDownIcon: () => null, FolderIcon: () => null, SearchIcon: () => null, SidebarIcon: () => null },
    "./RepoIcon": { RepoIcon: () => null },
    "./RowStatusIcon": { RowStatusIcon: () => null },
    "./StatusMatrix": { StatusMatrix: () => null },
  };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected Home dependency: ${name}`);
    },
  });
  const html = renderToStaticMarkup(React.createElement(exports.AllWorkspaces, {
    repos: [repo], sidebarVisible: true, dispatch: unexpectedIo, onCreateWorkspace: unexpectedIo,
  }));
  assert.deepEqual(ioCalls, []);
  return html;
}

console.log(`AllWorkspaces.tsx SHA256 ${createHash("sha256").update(source).digest("hex")}`);
console.log("SSR only: effects, event handlers, browser layout, and native operations do not execute.");

test("render control: Only archived renders the archived fixture and its passive archive mark", () => {
  const html = renderHome("archived");
  assert.match(html, /Archived fixture/);
  assert.doesNotMatch(html, /Active fixture/);
  assert.match(html, /class="allws-archived"[^>]*aria-label="Archived"/);
});

test("render control: Hiding archived keeps the active fixture and omits the archived fixture", () => {
  const html = renderHome("active");
  assert.match(html, /Active fixture/);
  assert.doesNotMatch(html, /Archived fixture/);
  assert.doesNotMatch(html, /aria-label="Unarchive workspace"/);
});

test("reference render contract: eligible archived Home row exposes Unarchive workspace", () => {
  assert.match(renderHome("archived"), /<button\b[^>]*aria-label="Unarchive workspace"/);
});
