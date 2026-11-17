import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as model from "../state/cloneDialog.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

// These tests lock the mounted topology and explicit activation controls.
// React's test renderer does not implement implicit form submission. Actual
// trusted-keyboard Chrome evidence lives in evidence/dialogs/clone-implicit-enter.
async function fixture() {
  const requests: { remoteUrl: string; path: string; name: string }[] = [];
  let rejectClone: (error: Error) => void = () => { throw new Error("No clone is pending"); };
  const source = ts.transpileModule(readFileSync(new URL("./CloneGitHubRepoDialog.tsx", import.meta.url), "utf8"), {
    fileName: "CloneGitHubRepoDialog.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./CloneGitHubRepoDialog"), "CloneGitHubRepoDialog">> = {};
  runInNewContext(source, {
    exports, Error,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "./DialogFrame") return {
        DialogFrame: ({ children }: { children: unknown }) => React.createElement("section", null, children),
      };
      if (name === "../state/cloneDialog") return model;
      if (name === "../backend") return {
        async githubGitProtocol() { return "https"; },
        async githubRecentRepos() { return []; },
        async lastCloneDirectory() { return null; },
        async folderExists() { return false; },
        pickFolder() { throw new Error("No native picker is used"); },
        saveLastCloneDirectory() { throw new Error("No clone succeeds in this fixture"); },
      };
      if (name === "../workspace/api") return {
        async defaultCloneDirectory() { return "/synthetic/clone-root"; },
        cloneRepository(remoteUrl: string, path: string, name: string) {
          requests.push({ remoteUrl, path, name });
          return new Promise((_resolve, reject) => { rejectClone = reject; });
        },
      };
      throw new Error(`Unexpected Clone activation dependency: ${name}`);
    },
  });
  assert.ok(exports.CloneGitHubRepoDialog);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(exports.CloneGitHubRepoDialog, {
      onClose() { throw new Error("The synthetic dialog must stay open"); },
      onCloned() { throw new Error("No real clone is performed"); },
    }));
  });
  const primary = () => renderer.root.findByProps({ "data-primary-action": true });
  const input = (field: "url" | "location") => renderer.root.findByProps(field === "url"
    ? { id: "git-url" } : { placeholder: "Enter path or click to select" });
  const edit = (field: "url" | "location", value: string) => {
    act(() => input(field).props.onChange({ target: { value } }));
  };
  // Explicit activation only: fallback keeps the same control executable on
  // the frozen form baseline. This is not an implicit-Enter simulation.
  const activate = async () => {
    await act(async () => {
      if (primary().props.onClick) void primary().props.onClick();
      else void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
  };
  return {
    requests, primary, input, edit, activate,
    async fail() { await act(async () => rejectClone(new Error("Synthetic failure"))); },
    dispose() { act(() => renderer.unmount()); },
  };
}

for (const field of ["url", "location"] as const) {
  test(`Clone ${field} has no implicit native-form activation path`, async () => {
    const view = await fixture();
    try {
      let parent = view.input(field).parent;
      while (parent) {
        assert.notEqual(parent.type, "form", `${field} must not acquire native implicit submission`);
        parent = parent.parent;
      }
    } finally { view.dispose(); }
  });
}

test("Clone explicit primary activation captures valid inputs once", async () => {
  const view = await fixture();
  try {
    view.edit("url", "https://example.invalid/fixture.git");
    assert.equal(view.primary().props.disabled, false);
    await view.activate();
    assert.deepEqual(view.requests, [{ remoteUrl: "https://example.invalid/fixture.git", path: "/synthetic/clone-root", name: "fixture" }]);
    assert.equal(view.primary().props.disabled, true);
  } finally { view.dispose(); }
});

test("Clone pending guard survives repeated explicit primary activation", async () => {
  const view = await fixture();
  try {
    view.edit("url", "https://example.invalid/fixture.git");
    await view.activate();
    view.edit("location", "/synthetic/next");
    await view.activate();
    assert.equal(view.requests.length, 1);
    assert.equal(view.primary().props.disabled, true);
  } finally { view.dispose(); }
});

test("Clone blank URL keeps the primary action disabled and transport unused", async () => {
  const view = await fixture();
  try {
    assert.equal(view.primary().props.disabled, true);
    await view.activate();
    assert.equal(view.requests.length, 0);
  } finally { view.dispose(); }
});

test("Clone rejection permits explicit retry with the latest inputs", async () => {
  const view = await fixture();
  try {
    view.edit("url", "https://example.invalid/fixture.git");
    await view.activate();
    await view.fail();
    view.edit("url", "https://example.invalid/retry.git");
    view.edit("location", "/synthetic/retry-root");
    assert.equal(view.primary().props.disabled, false);
    await view.activate();
    assert.deepEqual(view.requests[1], { remoteUrl: "https://example.invalid/retry.git", path: "/synthetic/retry-root", name: "retry" });
  } finally { view.dispose(); }
});
