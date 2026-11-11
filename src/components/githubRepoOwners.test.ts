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
  const requests: ((value: GitHubOwners) => void)[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const checks: { owner: string; slug: string }[] = [];
  const creations: string[] = [];
  const added: string[] = [];
  const errors: string[] = [];
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
        githubRepoOwners: () => new Promise<GitHubOwners>((resolve) => requests.push(resolve)),
        async githubRepoAvailability(owner: string, slug: string) {
          checks.push({ owner, slug });
          return "available";
        },
        async githubRepoCreate({ owner }: { owner: string }) {
          creations.push(owner);
          return { originRemoteUrl: "https://github.com/test/project.git" };
        },
      };
      throw new Error(`Unexpected GitHub owner test dependency: ${name}`);
    },
  });
  assert.ok(exports.GitHubRepoDialog);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(exports.GitHubRepoDialog, {
      target: { path: "/synthetic/project", name: "Project", needsGitInit: false },
      onClose: () => { closed++; },
      onOpenSettings: () => { throw new Error("Unexpected settings navigation"); },
      onCreated: async (url: string) => { added.push(url); },
      onError: (message: string) => { errors.push(message); },
    }));
  });
  return {
    checks, creations, added, errors,
    closed: () => closed,
    owner: () => renderer.root.findByType("select").props.value,
    submitDisabled: () => renderer.root.findByProps({ type: "submit" }).props.disabled,
    async owners(value: GitHubOwners) {
      const resolve = requests.shift();
      assert.ok(resolve, "the actual dialog requested owners");
      await act(async () => resolve(value));
    },
    async retry() {
      const buttons = renderer.root.findAllByType("button").filter((button: { props: { children: unknown } }) => button.props.children === "Try again");
      assert.equal(buttons.length, 1);
      await act(async () => buttons[0].props.onClick());
    },
    async checkAvailability() {
      assert.equal(timers.size, 1);
      const callbacks = [...timers.values()];
      timers.clear();
      await act(async () => callbacks.forEach((callback) => callback()));
    },
    async submit() {
      await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    },
    close() { act(() => renderer.unmount()); },
  };
}

const personal = (login: string): GitHubOwners => ({ owners: [{ login, kind: "user" }], orgsError: "read:org required" });

test("GitHub owner retry replaces a login absent from the refreshed owners before checking or creating", async () => {
  const view = await fixture();
  try {
    await view.owners(personal("previous-user"));
    await view.checkAvailability();
    assert.equal(view.owner(), "previous-user");
    await view.retry();
    assert.equal(view.submitDisabled(), true);
    await view.owners({ owners: [{ login: "current-user", kind: "user" }], orgsError: null });
    assert.equal(view.owner(), "current-user");
    assert.equal(view.submitDisabled(), true);
    await view.checkAvailability();
    assert.deepEqual(view.checks, [
      { owner: "previous-user", slug: "project" },
      { owner: "current-user", slug: "project" },
    ]);
    assert.equal(view.submitDisabled(), false);
    await view.submit();
    assert.deepEqual(view.creations, ["current-user"]);
    assert.deepEqual(view.added, ["https://github.com/test/project.git"]);
    assert.deepEqual(view.errors, []);
    assert.equal(view.closed(), 1);
  } finally { view.close(); }
});

test("GitHub owner retry preserves a selected login that remains in the refreshed owners", async () => {
  const view = await fixture();
  try {
    await view.owners(personal("same-user"));
    await view.checkAvailability();
    await view.retry();
    await view.owners({ owners: [{ login: "same-user", kind: "user" }, { login: "team", kind: "org" }], orgsError: null });
    assert.equal(view.owner(), "same-user");
    assert.equal(view.submitDisabled(), false);
    await view.submit();
    assert.deepEqual(view.creations, ["same-user"]);
    assert.deepEqual(view.errors, []);
    assert.equal(view.closed(), 1);
  } finally { view.close(); }
});

test("GitHub owners start empty and block submission until the first owner and availability arrive", async () => {
  const view = await fixture();
  try {
    assert.equal(view.owner(), "");
    assert.equal(view.submitDisabled(), true);
    await view.submit();
    assert.deepEqual(view.creations, []);
    await view.owners({ owners: [{ login: "first-user", kind: "user" }, { login: "team", kind: "org" }], orgsError: null });
    assert.equal(view.owner(), "first-user");
    assert.equal(view.submitDisabled(), true);
    await view.checkAvailability();
    assert.equal(view.submitDisabled(), false);
    assert.deepEqual(view.checks, [{ owner: "first-user", slug: "project" }]);
    assert.equal(view.closed(), 0);
  } finally { view.close(); }
});
