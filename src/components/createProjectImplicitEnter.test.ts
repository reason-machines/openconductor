import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as model from "../state/createProject.ts";
import * as cloneModel from "../state/cloneDialog.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");

// Mounted topology and explicit activation only. React test-renderer does not
// implement native implicit Enter. The independent trusted-browser witness is
// retained in evidence/dialogs/create-project-implicit-enter.
async function fixture() {
  const requests: { parentDir: string; slug: string; template: string }[] = [];
  let rejectCreate: (error: Error) => void = () => { throw new Error("No creation is pending"); };
  const source = ts.transpileModule(readFileSync(new URL("./CreateProjectDialog.tsx", import.meta.url), "utf8"), {
    fileName: "CreateProjectDialog.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Partial<Pick<typeof import("./CreateProjectDialog"), "CreateProjectDialog">> = {};
  runInNewContext(source, {
    exports, Error,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "./DialogFrame") return {
        DialogFrame: ({ children }: { children: unknown }) => React.createElement("section", null, children),
      };
      if (name === "../state/createProject") return model;
      if (name === "../state/cloneDialog") return cloneModel;
      if (name === "./Icons") return { FileCodeIcon: () => null, NextMarkIcon: () => null };
      if (name === "../home/createFirstWorkspace") return {
        createFirstWorkspace() { throw new Error("No workspace service is used"); },
      };
      if (name === "../workspace/api") return { async defaultCloneDirectory() { return "/synthetic/project-root"; } };
      if (name === "../backend") return {
        async lastCloneDirectory() { return null; },
        async folderExists() { return false; },
        pickFolder() { throw new Error("No native picker is used"); },
        addRepository() { throw new Error("No project succeeds in this fixture"); },
        saveRepoScripts() { throw new Error("No scripts are persisted"); },
        saveLastCloneDirectory() { throw new Error("No preferences are persisted"); },
        createNewProject(request: { parentDir: string; slug: string; template: string }) {
          requests.push({ ...request });
          return new Promise((_resolve, reject) => { rejectCreate = reject; });
        },
      };
      throw new Error(`Unexpected Create project activation dependency: ${name}`);
    },
  });
  assert.ok(exports.CreateProjectDialog);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(exports.CreateProjectDialog, {
      onClose() { throw new Error("The synthetic dialog must stay open"); },
      onRepoAdded() { throw new Error("No repository is registered"); },
      onCreated() { throw new Error("No real project is created"); },
    }));
  });
  const primary = () => renderer.root.findByProps({ "data-primary-action": true });
  const input = (field: "name" | "parent") => renderer.root.findByProps(field === "name"
    ? { id: "project-name" } : { placeholder: "Enter path or click to select" });
  const edit = (field: "name" | "parent", value: string) => {
    act(() => input(field).props.onChange({ target: { value } }));
  };
  // Keep explicit controls runnable on the frozen baseline without pretending
  // that directly invoking a form callback exercises a browser default action.
  const activate = async () => {
    await act(async () => {
      if (primary().props.onClick) void primary().props.onClick();
      else void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
  };
  return {
    requests, primary, input, edit, activate,
    async fail() { await act(async () => rejectCreate(new Error("Synthetic failure"))); },
    dispose() { act(() => renderer.unmount()); },
  };
}

for (const field of ["name", "parent"] as const) {
  test(`Create project ${field} has no implicit native-form activation path`, async () => {
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

test("Create project explicit primary activation captures valid inputs once", async () => {
  const view = await fixture();
  try {
    view.edit("name", "fixture-project");
    assert.equal(view.primary().props.disabled, false);
    await view.activate();
    assert.deepEqual(view.requests, [{ parentDir: "/synthetic/project-root", slug: "fixture-project", template: "empty" }]);
    assert.equal(view.primary().props.disabled, true);
  } finally { view.dispose(); }
});

test("Create project pending guard survives repeated explicit primary activation", async () => {
  const view = await fixture();
  try {
    await view.activate();
    view.edit("parent", "/synthetic/next");
    await view.activate();
    assert.equal(view.requests.length, 1);
    assert.equal(view.primary().props.disabled, true);
  } finally { view.dispose(); }
});

test("Create project blank name keeps the primary disabled and transport unused", async () => {
  const view = await fixture();
  try {
    view.edit("name", "");
    assert.equal(view.primary().props.disabled, true);
    await view.activate();
    assert.equal(view.requests.length, 0);
  } finally { view.dispose(); }
});

test("Create project rejection permits explicit retry with the latest inputs", async () => {
  const view = await fixture();
  try {
    await view.activate();
    await view.fail();
    view.edit("name", "retry-project");
    view.edit("parent", "/synthetic/retry-root");
    assert.equal(view.primary().props.disabled, false);
    await view.activate();
    assert.deepEqual(view.requests[1], { parentDir: "/synthetic/retry-root", slug: "retry-project", template: "empty" });
  } finally { view.dispose(); }
});
