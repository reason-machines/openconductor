/**
 * Deferred-create fixture for GitHubRepoDialog pending-name editability.
 *
 * Conductor does not disable the repository name input while a create request is in
 * flight (census github-name-pending-census-6013). The already-captured submit
 * arguments are scalar values snapshotted at invocation; editing the name field
 * afterwards does not mutate that captured request. After a creation failure the
 * edited draft is retained and pending is cleared.
 */
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
  let rejectCreation: ((err: Error) => void) | undefined;
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const checks: string[] = [];
  const creations: { owner: string; repoPath: string; repositoryName: string }[] = [];
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
        githubRepoOwners: () => new Promise<GitHubOwners>((resolve) => { resolveOwners = resolve; }),
        async githubRepoAvailability(owner: string, slug: string) {
          checks.push(`${owner}/${slug}`);
          return "available";
        },
        githubRepoCreate(value: { owner: string; repoPath: string; repositoryName: string }) {
          creations.push({ owner: value.owner, repoPath: value.repoPath, repositoryName: value.repositoryName });
          return new Promise<{ originRemoteUrl: string }>((_, reject) => { rejectCreation = reject; });
        },
      };
      throw new Error(`Unexpected pending-name test dependency: ${name}`);
    },
  });
  assert.ok(exports.GitHubRepoDialog);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(exports.GitHubRepoDialog, {
      target: { path: "/synthetic/project", name: "Notes", needsGitInit: false },
      onClose: () => { closed++; },
      onOpenSettings: () => { throw new Error("Unexpected settings navigation"); },
      onCreated: async () => {},
      onError: (message: string) => { errors.push(message); },
    }));
  });
  return {
    checks, creations, errors,
    closed: () => closed,
    input: () => renderer.root.findByType("input").props,
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
    async failCreation(message: string) {
      assert.ok(rejectCreation, "a creation request must be in flight");
      const reject = rejectCreation;
      await act(async () => reject(new Error(message)));
    },
    close() { act(() => renderer.unmount()); },
  };
}

test("name input is not disabled while creation is pending and the captured request is unaffected by later edits", async () => {
  const view = await fixture();
  try {
    await view.name("  My Notes  ");
    await view.owners();
    await view.checkAvailability();
    assert.deepEqual(view.checks, ["me/my-notes"]);
    assert.equal(view.submitDisabled(), false);
    await view.submit();
    assert.deepEqual(view.creations, [{ owner: "me", repoPath: "/synthetic/project", repositoryName: "my-notes" }]);
    // Name input remains interactive while the create request is in flight.
    assert.equal(view.input().disabled, undefined, "name is not disabled while creation is pending");
    assert.equal(view.submitDisabled(), true, "submit is still blocked during pending");
    // Editing the name draft does not mutate the already-captured repositoryName.
    await view.name("edited-after-submit");
    assert.deepEqual(view.creations, [{ owner: "me", repoPath: "/synthetic/project", repositoryName: "my-notes" }],
      "already-captured first request is unaffected by editing the name during pending");
    // After failure, the edited draft is retained and pending is cleared.
    await view.failCreation("network error");
    assert.equal(view.errors.length, 1, "onError was called once");
    assert.ok(view.errors[0].includes("network error"), `expected error message to include 'network error', got: ${view.errors[0]}`);
    assert.equal(view.input().value, "edited-after-submit", "edited draft is retained after failure");
    assert.equal(view.input().disabled, undefined, "name is not disabled after failure clears pending");
    assert.equal(view.submitDisabled(), true, "submit remains blocked until availability is re-confirmed");
    assert.equal(view.closed(), 0, "dialog is not closed on failure");
  } finally { view.close(); }
});

test("duplicate submit is blocked while creation is pending regardless of name editability", async () => {
  const view = await fixture();
  try {
    await view.name("my-project");
    await view.owners();
    await view.checkAvailability();
    await view.submit();
    assert.deepEqual(view.creations, [{ owner: "me", repoPath: "/synthetic/project", repositoryName: "my-project" }]);
    await view.submit();
    assert.deepEqual(view.creations, [{ owner: "me", repoPath: "/synthetic/project", repositoryName: "my-project" }],
      "second submit while pending must not start another creation");
  } finally { view.close(); }
});
