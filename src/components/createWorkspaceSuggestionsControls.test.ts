import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const { act } = require("react-test-renderer");
const ts = require("typescript");
const fixturePath = resolve(import.meta.dirname, "createWorkspaceSuggestions.test.ts");

// Reuse the frozen mounted route without changing its twenty assertions or
// registering them twice. These test-only extensions expose existing callbacks
// and a deferred IPC response, not alternative product implementations.
function extendedFixture() {
  const original = readFileSync(fixturePath, "utf8");
  const split = original.indexOf("\nfor (const page of [false, true]) {");
  assert.ok(split > 0);
  let source = original.slice(0, split);
  const replace = (before: string, after: string) => { assert.equal(source.split(before).length, 2); source = source.replace(before, after); };
  replace("noRepo?: boolean; reject?: boolean", "noRepo?: boolean; reject?: boolean; lookup?: (args: any) => Promise<any>");
  replace("creates: 0, closes: 0,", "creates: 0, closes: 0, drafts: [] as any[],");
  replace('loadoutPicks: () => [] };', 'loadoutPicks: () => [], pickLaunch: (_current: any, pick: any) => ({ agent: pick.agent, model: pick.model, effort: pick.effort ?? "" }) };');
  replace('if (options.reject) throw new Error("Synthetic lookup failure");', 'if (options.reject) throw new Error("Synthetic lookup failure"); if (options.lookup) return options.lookup(args);');
  replace('if (name === "../workspace/api") return {', 'if (name === "../workspace/createFlow") { const real = load("src/workspace/createFlow.ts"); return { ...real, buildCreateRequest(draft: any, prefix: string) { boundary.drafts.push(draft); return real.buildCreateRequest(draft, prefix); } }; }\n        if (name === "../workspace/api") return {');
  replace('menu(label: string) {', `async branch(value: string) { await act(async () => { renderer.root.findAll((node: any) => typeof node.props.onRetry === "function" && "branches" in node.props)[0].props.onChange(value); }); },
    async from(value: any) { await act(async () => { renderer.root.findAll((node: any) => "repoPath" in node.props && typeof node.props.onChange === "function")[0].props.onChange(value); }); },
    async agent(value: string) { await act(async () => { renderer.root.findAll((node: any) => "favorites" in node.props && typeof node.props.itemAgent === "function")[0].props.onChange({ agent: value, model: "fixture", effort: null }); }); },
    async blur() { await act(async () => { renderer.root.findByType(load("src/features/chat/ComposerEditor.tsx").ComposerEditor).props.onBlur(); }); },
    async repo(value: string) { await act(async () => { renderer.root.findAll((node: any) => "addActions" in node.props && "value" in node.props)[0].props.onChange(value); }); },
    menu(label: string) {`);
  // Both repositories are synthetic; no fixture path is touched on disk.
  replace('defaultBranch: "main", workspaces: [] }]', 'defaultBranch: "main", workspaces: [] }, { id: "second", name: "Other", path: "/synthetic/other", defaultBranch: "other", workspaces: [] }]');
  source = source.replaceAll("import.meta.dirname", JSON.stringify(import.meta.dirname)).replaceAll("import.meta.url", JSON.stringify(pathToFileURL(fixturePath).href));
  const exports: Record<string, any> = {};
  runInNewContext(ts.transpileModule(source + "\nexport { fixture };", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { exports, require, console, process, setTimeout, clearTimeout, TextDecoder, TextEncoder, URL, URLSearchParams, Uint8Array });
  return exports.fixture;
}
const fixture = extendedFixture();
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const snapshot = (name: string) => ({ files: [{ name, path: `src/${name}`, is_directory: false }], slashCommands: [{ name, description: name, argumentHint: "" }], skills: [] });
function deferred() { let resolve!: (value: any) => void; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; }

for (const page of [false, true]) {
  test(`selected branch and source ref replace target/cwd identity (page=${page})`, async () => {
    const view = await fixture(page);
    try {
      await view.branch("release");
      await view.from({ kind: "branch", name: "feature" });
      await view.from({ kind: "pr", number: 2, title: "Fork", headBranch: "feature", baseBranch: "release", headOwner: "fork", crossRepository: true });
      assert.deepEqual(plain(view.boundary.calls.filter((call: any) => call.command === "pre_workspace_completions").map((call: any) => call.args.ref)), ["main", "release", "feature", "fork/feature"]);
    } finally { view.dispose(); }
  });
  test(`old repository/ref result cannot reappear after a newer response (page=${page})`, async () => {
    const pending: { args: any; task: ReturnType<typeof deferred> }[] = [];
    const view = await fixture(page, { lookup: (args: any) => { const task = deferred(); pending.push({ args, task }); return task.promise; } });
    try {
      await view.type("@new");
      await view.branch("next");
      assert.equal(pending.length, 2);
      await act(async () => pending[1].task.resolve(snapshot("new.ts")));
      assert.equal(view.menu("Mention files").length, 1);
      await act(async () => pending[0].task.resolve(snapshot("old.ts")));
      assert.equal(view.menu("Mention files").length, 1);
      await view.key();
      assert.equal(view.parts()[0].path, "src/new.ts");
      await view.repo("second");
      assert.equal(view.menu("Mention files").length, 0);
      assert.equal(pending.at(-1)!.args.repositoryId, "second");
      assert.equal(pending.at(-1)!.args.ref, "other");
    } finally { view.dispose(); }
  });
  test(`response after unmount is discarded (page=${page})`, async () => {
    const task = deferred();
    const view = await fixture(page, { lookup: () => task.promise });
    view.dispose();
    await act(async () => task.resolve(snapshot("late.ts")));
    assert.equal(view.boundary.creates, 0);
  });
  test(`lookup failure leaves ordinary text editable and does not synthesize suggestions (page=${page})`, async () => {
    const view = await fixture(page, { reject: true });
    try {
      await view.type("@entry");
      assert.equal(view.menu("Mention files").length, 0);
      await view.type("/rev");
      assert.equal(view.menu("Slash commands").length, 0);
      assert.equal(view.draft(), "/rev"); assert.equal(view.boundary.creates, 0);
    } finally { view.dispose(); }
  });
  test(`skill selection preserves existing Codex path-link grammar and never creates (page=${page})`, async () => {
    const view = await fixture(page);
    try {
      await view.type("/Guide");
      assert.equal(view.menu("Slash commands").length, 1);
      assert.deepEqual(plain(await view.key("Tab")), { handled: true, prevented: true, stopped: true });
      assert.equal(view.draft(), "[$guide](/synthetic/skills/guide/SKILL.md) ");
      assert.equal(view.boundary.creates, 0);
    } finally { view.dispose(); }
  });
  test(`agent change requests a distinct snapshot; Claude uses existing slash grammar (page=${page})`, async () => {
    const view = await fixture(page);
    try {
      await view.agent("claude"); await view.type("/Guide");
      assert.equal(view.boundary.calls.filter((call: any) => call.command === "pre_workspace_completions").at(-1).args.agentType, "claude");
      await view.key(); assert.equal(view.draft(), "/guide "); assert.equal(view.boundary.creates, 0);
    } finally { view.dispose(); }
  });
  for (const backlog of [false, true]) {
    test(`file atom becomes prompt text at ${backlog ? "backlog" : "submit"} boundary, never envelope (page=${page})`, async () => {
      const view = await fixture(page);
      try {
        await view.type("@entry"); await view.key();
        assert.equal(view.parts()[0].kind, "file");
        await view.key("Enter", backlog ? { altKey: true } : {});
        assert.equal(view.boundary.creates, 1);
        assert.equal(view.boundary.drafts[0].firstMessage, "@src/entry.ts ");
        assert.equal(view.boundary.drafts[0].firstMessage.includes("OpenConductorComposer"), false);
      } finally { view.dispose(); }
    });
  }
  test(`blur and escaped popup cannot consume subsequent ordinary keys (page=${page})`, async () => {
    const view = await fixture(page);
    try {
      await view.type("/rev"); await view.key("Escape");
      assert.equal(view.menu("Slash commands").length, 0);
      await view.type("@entry"); await view.blur();
      assert.equal(view.menu("Mention files").length, 0);
      assert.deepEqual(plain(await view.key("Tab")), { handled: false, prevented: false, stopped: false });
      assert.equal(view.boundary.closes, 0); assert.equal(view.boundary.creates, 0);
    } finally { view.dispose(); }
  });
}
