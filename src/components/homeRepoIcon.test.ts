import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { Repo } from "../state/types";
import * as home from "../home/allWorkspaces.ts";
import * as status from "../state/rowStatus.ts";
import * as repoIcon from "../state/repoIcon.ts";
import { REPO_ICONS } from "./repoIcons.generated.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";

const EMOJI = "\u{1f30a}";
const IMAGE = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";
const require = createRequire(import.meta.url);

function compile(file: string) {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021 },
  }).outputText;
}

function renderHome({ menuOpen = false, matrix = false, projects = [], repos = fixtures() }: {
  menuOpen?: boolean;
  matrix?: boolean;
  projects?: string[];
  repos?: Repo[];
} = {}) {
  const ioCalls: string[] = [];
  const unexpectedIo = () => { ioCalls.push("native"); throw new Error("Native I/O is not allowed in this component test"); };
  const iconExports: Partial<Pick<typeof import("./RepoIcon"), "RepoIcon">> = {};
  runInNewContext(compile("./RepoIcon.tsx"), { exports: iconExports, require: (name: string) => {
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    if (name === "../state/repoIcon") return repoIcon;
    if (name === "./repoIcons.generated") return { REPO_ICONS };
    if (name === "../backend") return { inspectProjectFolder: unexpectedIo, repoFavicon: unexpectedIo, inTauri: () => false };
    throw new Error(`Unexpected repository-icon dependency: ${name}`);
  } });
  assert.ok(iconExports.RepoIcon);

  const homeExports: Partial<Pick<typeof import("./AllWorkspaces"), "AllWorkspaces">> = {};
  runInNewContext(compile("./AllWorkspaces.tsx"), { exports: homeExports, require: (name: string) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "react") return {
      ...React,
      useState: (initial: unknown) => React.useState(initial === false && menuOpen ? true : initial),
    };
    if (name === "../home/allWorkspaces") return { ...home, loadFilters: () => ({ projects, archiveFilter: "active" }) };
    if (name === "./RepoIcon") return iconExports;
    if (name === "../state/rowStatus") return status;
    if (name === "../state/workspaceNumber") return { workspaceNumberLabel };
    if (name === "../state/chatUnread") return { isWorkspaceUnread: () => false };
    if (name === "../features/chat/useWorkspaceSession") return { useWorkspaceAgentStatus: () => "idle" };
    if (name === "../settings/useStatusMatrix") return { useStatusMatrix: () => matrix };
    if (name === "../settings/useBoolPref") return { useBoolPref: () => false };
    if (name === "../keybindings/overrides") return { effectiveShortcuts: () => [] };
    if (name === "../keybindings/shortcut") return { glyphs: () => "" };
    if (name === "../workspace/archive") return { listArchivedWorkspaces: unexpectedIo };
    if (name === "./Icons") return { ArchiveIcon: () => null, ChevronDownIcon: () => null, FolderIcon: () => null, SearchIcon: () => null, SidebarIcon: () => null };
    if (name === "./RowStatusIcon") return { RowStatusIcon: () => null };
    if (name === "./StatusMatrix") return { StatusMatrix: () => React.createElement("span", { "data-fixture-status-matrix": true }) };
    throw new Error(`Unexpected Home dependency: ${name}`);
  } });
  assert.ok(homeExports.AllWorkspaces);
  const html = renderToStaticMarkup(React.createElement(homeExports.AllWorkspaces, {
    repos, sidebarVisible: true, dispatch() {}, onCreateWorkspace() {},
  }));
  assert.deepEqual(ioCalls, []);
  return html;
}

function fixtures(): Repo[] {
  return [
    { id: "tide", name: "Tide", icon: `emoji:${EMOJI}` },
    { id: "coral", name: "Coral", icon: IMAGE },
  ].map((repo): Repo => ({
    ...repo, path: "", defaultBranch: "main",
    workspaces: [{ id: `${repo.id}-workspace`, name: "Workspace", branch: "feature", status: "idle", diff: { added: 0, removed: 0 }, createdAt: Date.now() }],
  }));
}

function assertCustomIcons(html: string) {
  assert.ok(html.includes(EMOJI), "the configured repository emoji is visible");
  assert.ok(html.includes(`src="${IMAGE}"`), "the uploaded repository image is visible");
}

test("Home rows show configured repository emoji and uploaded image rather than initials", () => {
  assertCustomIcons(renderHome());
});

test("Home project-filter choices show configured repository emoji and uploaded image", () => {
  const html = renderHome({ menuOpen: true });
  const menu = html.match(/<div class="allws-menu-pop" role="menu">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(menu, "the Projects menu is open");
  assertCustomIcons(menu);
});

test("Home rows still hide repository icons when a project is selected", () => {
  const html = renderHome({ projects: ["tide"] });
  assert.ok(html.includes("Workspace"));
  assert.ok(!html.includes(EMOJI));
  assert.ok(!html.includes(IMAGE));
});

test("Home status matrix still replaces row repository icons", () => {
  const html = renderHome({ matrix: true });
  assert.match(html, /data-fixture-status-matrix="true"/);
  assert.ok(!html.includes(EMOJI));
  assert.ok(!html.includes(IMAGE));
});

test("Home retains the repository initial when no custom icon or remote is available", () => {
  const repos = fixtures().map((repo) => ({ ...repo, icon: null }));
  const html = renderHome({ repos });
  assert.match(html, />T<\/span>/);
  assert.match(html, />C<\/span>/);
});
