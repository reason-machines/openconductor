import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import * as model from "../state/githubRepoDialog.ts";
import type { GitHubOwners } from "../state/githubRepoDialog.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

async function fixture() {
  const source = readFileSync(new URL("./GitHubRepoDialog.tsx", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: "GitHubRepoDialog.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./GitHubRepoDialog"), "GitHubRepoDialog">> = {};
  let resolveOwners: ((value: GitHubOwners) => void) | undefined;
  let resolveCreation: ((value: { originRemoteUrl: string }) => void) | undefined;
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const checks: string[] = [];
  const creations: { owner: string; repoPath: string; repositoryName: string }[] = [];
  const added: string[] = [];
  let closed = 0;
  runInNewContext(javascript, {
    exports,
    setTimeout(callback: () => void, milliseconds: number) {
      assert.equal(milliseconds, 300);
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout(id: number) { timers.delete(id); },
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "../state/githubRepoDialog") return model;
      if (name === "./Dialogs") return { Modal: ({ children }: { children: ReactNode }) => children };
      if (name === "../backend") return {
        githubRepoOwners: () => new Promise<GitHubOwners>((resolve) => { resolveOwners = resolve; }),
        async githubRepoAvailability(owner: string, slug: string) {
          checks.push(`${owner}/${slug}`);
          return "available";
        },
        githubRepoCreate(value: { owner: string; repoPath: string; repositoryName: string }) {
          creations.push({ owner: value.owner, repoPath: value.repoPath, repositoryName: value.repositoryName });
          return new Promise<{ originRemoteUrl: string }>((resolve) => { resolveCreation = resolve; });
        },
      };
      throw new Error(`Unexpected GitHub name test dependency: ${name}`);
    },
  });
  assert.ok(exports.GitHubRepoDialog);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(exports.GitHubRepoDialog, {
      target: { path: "/synthetic/project", name: "Notes", needsGitInit: false },
      onClose: () => { closed++; },
      onOpenSettings: () => { throw new Error("Unexpected settings navigation"); },
      onCreated: async (url: string) => { added.push(url); },
      onError: (message: string) => { throw new Error(message); },
    }));
  });
  return {
    checks, creations, added,
    closed: () => closed,
    input: () => renderer.root.findByType("input").props,
    status: () => renderer.root.findAllByProps({ role: "status" }).map((node: { props: { children: string } }) => node.props.children),
    submitDisabled: () => renderer.root.findByProps({ type: "submit" }).props.disabled,
    async name(value: string) {
      await act(async () => renderer.root.findByType("input").props.onChange({ target: { value } }));
    },
    async owners() {
      assert.ok(resolveOwners, "the actual dialog requested owners");
      const resolve = resolveOwners;
      await act(async () => resolve({ owners: [{ login: "me", kind: "user" }], orgsError: null }));
    },
    async checkAvailability() {
      assert.equal(timers.size, 1);
      const callbacks = [...timers.values()];
      timers.clear();
      await act(async () => callbacks.forEach((callback) => callback()));
    },
    async submit() {
      await act(async () => { void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    },
    async finishCreation() {
      assert.ok(resolveCreation);
      const resolve = resolveCreation;
      await act(async () => resolve({ originRemoteUrl: "https://github.com/me/my-notes.git" }));
    },
    close() { act(() => renderer.unmount()); },
  };
}

for (const name of ["", "   ", "\t \n", "\u00a0"]) {
  test(`GitHub private repo name ${JSON.stringify(name)} stays neutral and cannot submit`, async () => {
    const view = await fixture();
    try {
      await view.name(name);
      assert.deepEqual(view.status(), ["Loading GitHub owners..."]);
      assert.equal(view.submitDisabled(), true);
      await view.owners();
      assert.equal(view.input()["aria-invalid"], false);
      assert.deepEqual(view.status(), []);
      assert.equal(view.submitDisabled(), true);
      await view.submit();
      assert.deepEqual(view.checks, []);
      assert.deepEqual(view.creations, []);
      assert.equal(view.closed(), 0);
    } finally { view.close(); }
  });
}

test("GitHub private repo nonblank invalid name keeps its error and cannot submit", async () => {
  const view = await fixture();
  try {
    await view.name(" !-- ");
    await view.owners();
    assert.equal(view.input()["aria-invalid"], true);
    assert.deepEqual(view.status(), ["Repository name must include letters or numbers."]);
    assert.equal(view.submitDisabled(), true);
    await view.submit();
    assert.deepEqual(view.checks, []);
    assert.deepEqual(view.creations, []);
  } finally { view.close(); }
});

test("GitHub private repo normalizes a valid name and blocks repeated pending submission", async () => {
  const view = await fixture();
  try {
    await view.name("  My Notes  ");
    await view.owners();
    assert.equal(view.submitDisabled(), true);
    await view.checkAvailability();
    assert.deepEqual(view.checks, ["me/my-notes"]);
    assert.equal(view.input()["aria-invalid"], false);
    assert.equal(view.submitDisabled(), false);
    await view.submit();
    assert.equal(view.input().disabled, true);
    assert.equal(view.submitDisabled(), true);
    await view.submit();
    assert.deepEqual(view.creations, [{ owner: "me", repoPath: "/synthetic/project", repositoryName: "my-notes" }]);
    await view.finishCreation();
    assert.deepEqual(view.added, ["https://github.com/me/my-notes.git"]);
    assert.equal(view.closed(), 1);
  } finally { view.close(); }
});
