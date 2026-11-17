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
const accounts: GitHubOwners = {
  owners: [{ login: "person", kind: "user" }, { login: "team", kind: "org" }],
  orgsError: null,
};

// Mount the actual dialog, replacing only its outer frame and backend ports.
// Callback invocation here proves component state, not native select delivery,
// dialog focus/keyboard behavior, real authentication or GitHub operations.
async function fixture() {
  const source = readFileSync(new URL("./GitHubRepoDialog.tsx", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: "GitHubRepoDialog.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./GitHubRepoDialog"), "GitHubRepoDialog">> = {};
  const ownerRequests: { resolve: (value: GitHubOwners) => void; reject: (error: Error) => void }[] = [];
  const requests: {
    args: { owner: string; repoPath: string; repositoryName: string; existingOriginUrl?: string };
    resolve: (value: { originRemoteUrl: string }) => void;
    reject: (error: Error) => void;
  }[] = [];
  const timers = new Map<number, () => void>();
  const checks: string[] = [];
  const added: string[] = [];
  const errors: string[] = [];
  let timerId = 0;
  let closed = 0;
  runInNewContext(javascript, {
    exports, Error,
    setTimeout(callback: () => void, milliseconds: number) {
      assert.equal(milliseconds, 300);
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout(id: number) { timers.delete(id); },
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "../state/githubRepoDialog") return model;
      if (name === "./DialogFrame") return { DialogFrame: ({ children }: { children: ReactNode }) => children };
      if (name === "../backend") return {
        githubRepoOwners: () => new Promise<GitHubOwners>((resolve, reject) => ownerRequests.push({ resolve, reject })),
        async githubRepoAvailability(owner: string, slug: string) {
          checks.push(`${owner}/${slug}`);
          return "available";
        },
        githubRepoCreate(args: typeof requests[number]["args"]) {
          return new Promise<{ originRemoteUrl: string }>((resolve, reject) => {
            requests.push({ args: { ...args }, resolve, reject });
          });
        },
      };
      throw new Error(`Unexpected pending-owner test dependency: ${name}`);
    },
  });
  assert.ok(exports.GitHubRepoDialog);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(exports.GitHubRepoDialog, {
      target: { path: "/synthetic/project", name: "Notes", needsGitInit: false, existingOriginUrl: "https://example.invalid/original.git" },
      onClose: () => { closed++; },
      onOpenSettings: () => { throw new Error("Unexpected settings navigation"); },
      onCreated: async (url: string) => { added.push(url); },
      onError: (message: string) => { errors.push(message); },
    }));
  });
  const text = (node: any): string => typeof node === "string" ? node : node.children.map(text).join("");
  return {
    requests, checks, added, errors,
    get closed() { return closed; },
    owner: () => renderer.root.findByType("select").props,
    button: () => renderer.root.findByProps({ type: "submit" }),
    buttonText() { return text(this.button()); },
    async owners(value = accounts) {
      const request = ownerRequests.shift();
      assert.ok(request, "the actual component requested owners");
      await act(async () => request.resolve(value));
    },
    async ownersFail() {
      const request = ownerRequests.shift();
      assert.ok(request);
      await act(async () => request.reject(new Error("Synthetic owner failure")));
    },
    async checkAvailability() {
      assert.equal(timers.size, 1, "one current owner/name availability timer");
      const callbacks = [...timers.values()];
      timers.clear();
      await act(async () => callbacks.forEach((callback) => callback()));
    },
    async ready() { await this.owners(); await this.checkAvailability(); },
    async choose(owner: string) {
      assert.equal(this.owner().disabled, false, "assert enabled before invoking selection");
      await act(async () => this.owner().onChange({ target: { value: owner } }));
    },
    async name(value: string) {
      await act(async () => renderer.root.findByType("input").props.onChange({ target: { value } }));
    },
    async submit() {
      await act(async () => { void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    },
    async reject(index = 0) {
      await act(async () => requests[index].reject(new Error("Synthetic creation rejected")));
    },
    async resolve(index = 0) {
      await act(async () => requests[index].resolve({ originRemoteUrl: `https://example.invalid/${requests[index].args.owner}/notes.git` }));
    },
    async retryOwners() {
      const buttons = renderer.root.findAllByType("button").filter((button: any) => button.props.children === "Try again");
      assert.equal(buttons.length, 1);
      await act(async () => buttons[0].props.onClick());
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

const first = {
  owner: "person", repoPath: "/synthetic/project", repositoryName: "notes",
  existingOriginUrl: "https://example.invalid/original.git",
};

// The two pending-owner assertions below are the intended pre-fix failures.
test("Owner stays enabled while creation is pending", async () => {
  const view = await fixture();
  try {
    await view.ready();
    await view.submit();
    assert.equal(view.requests.length, 1);
    assert.deepEqual(view.requests[0].args, first);
    assert.equal(view.button().props.disabled, true);
    assert.equal(view.buttonText(), "Creating...");
    assert.equal(view.closed, 0);
    assert.equal(view.owner().disabled, false, "create pending must not disable a loaded Owner selector");
  } finally { view.dispose(); }
});

test("pending Owner edits preserve the captured request and rejection draft through retry", async () => {
  const view = await fixture();
  try {
    await view.ready();
    await view.submit();
    await view.choose("team");
    assert.equal(view.owner().value, "team");
    assert.deepEqual(view.requests.map((request) => request.args), [first]);
    assert.equal(view.button().props.disabled, true);
    await view.checkAvailability();
    await view.submit();
    assert.equal(view.requests.length, 1, "availability for the draft must not bypass pending");
    await view.reject();
    assert.deepEqual(view.errors, ["Synthetic creation rejected"]);
    assert.equal(view.closed, 0);
    assert.equal(view.owner().value, "team");
    assert.equal(view.owner().disabled, false);
    assert.equal(view.button().props.disabled, false);
    await view.submit();
    assert.deepEqual(view.requests.map((request) => request.args), [first, { ...first, owner: "team" }]);
    await view.resolve(1);
    assert.deepEqual(view.added, ["https://example.invalid/team/notes.git"]);
    assert.equal(view.closed, 1);
  } finally { view.dispose(); }
});

test("initial owner loading keeps selection and submission disabled", async () => {
  const view = await fixture();
  try {
    assert.equal(view.owner().disabled, true);
    assert.equal(view.owner().value, "");
    assert.equal(view.button().props.disabled, true);
    await view.submit();
    assert.equal(view.requests.length, 0);
  } finally { view.dispose(); }
});

test("idle owner selection updates availability before creating", async () => {
  const view = await fixture();
  try {
    await view.ready();
    assert.equal(view.owner().disabled, false);
    await view.choose("team");
    assert.equal(view.button().props.disabled, true);
    await view.checkAvailability();
    assert.deepEqual(view.checks, ["person/notes", "team/notes"]);
    await view.submit();
    assert.deepEqual(view.requests[0].args, { ...first, owner: "team" });
  } finally { view.dispose(); }
});

test("pending creation blocks duplicates even after availability changes", async () => {
  const view = await fixture();
  try {
    await view.ready();
    await view.submit();
    await view.name("other-notes");
    await view.checkAvailability();
    await view.submit();
    assert.deepEqual(view.requests.map((request) => request.args), [first]);
    assert.equal(view.button().props.disabled, true);
  } finally { view.dispose(); }
});

test("resolved creation adds the captured remote and closes once", async () => {
  const view = await fixture();
  try {
    await view.ready();
    await view.submit();
    await view.resolve();
    assert.deepEqual(view.requests[0].args, first);
    assert.deepEqual(view.added, ["https://example.invalid/person/notes.git"]);
    assert.deepEqual(view.errors, []);
    assert.equal(view.closed, 1);
  } finally { view.dispose(); }
});

test("rejected creation retains the loaded owner and allows retry", async () => {
  const view = await fixture();
  try {
    await view.ready();
    await view.submit();
    await view.reject();
    assert.equal(view.owner().value, "person");
    assert.equal(view.owner().disabled, false);
    assert.equal(view.button().props.disabled, false);
    assert.equal(view.closed, 0);
    await view.submit();
    assert.deepEqual(view.requests.map((request) => request.args), [first, first]);
  } finally { view.dispose(); }
});

// Existing refetch/error gating is a preservation control, not claimed query
// parity: the reference uses query.isLoading; this app models an OwnersState.
test("owner refetch keeps existing loading behavior until refreshed owners arrive", async () => {
  const view = await fixture();
  try {
    await view.owners({ ...accounts, orgsError: "Synthetic organization retry" });
    await view.checkAvailability();
    await view.retryOwners();
    assert.equal(view.owner().disabled, true);
    assert.equal(view.button().props.disabled, true);
    await view.owners();
    assert.equal(view.owner().disabled, false);
    assert.equal(view.owner().value, "person");
    assert.equal(view.requests.length, 0);
  } finally { view.dispose(); }
});

test("owner failure keeps existing empty-owner and submit guards", async () => {
  const view = await fixture();
  try {
    await view.ownersFail();
    assert.equal(view.owner().disabled, true);
    assert.equal(view.owner().value, "");
    assert.equal(view.button().props.disabled, true);
    await view.submit();
    assert.equal(view.requests.length, 0);
    assert.equal(view.closed, 0);
  } finally { view.dispose(); }
});
