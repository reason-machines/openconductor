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

function javascript(file: string) {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

function dialogFrame() {
  const exports: Partial<Pick<typeof import("./DialogFrame"), "DialogFrame">> = {};
  const parts = {
    Root: ({ children }: { children: unknown }) => children,
    Portal: ({ children }: { children: unknown }) => children,
    Backdrop: () => null,
    Popup: React.forwardRef((props: object, ref: unknown) => React.createElement("section", { ...props, ref })),
  };
  runInNewContext(javascript("./DialogFrame.tsx"), {
    exports, document: { activeElement: null }, HTMLElement: class {},
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "@base-ui/react/dialog") return { Dialog: parts };
      if (name === "@base-ui/react/alert-dialog") return { AlertDialog: parts };
      if (name === "../keybindings/KeybindingsProvider") return { useKeybindingOverrides: () => ({ overrides: {} }) };
      if (name === "../keybindings/overrides") return { effectiveShortcuts: () => [] };
      if (name === "../keybindings/shortcut") return { matchesEvent: () => false };
      if (name === "./motion/dialogMotion") return { useDialogMotion: () => React.useRef(null) };
      if (name === "./dialogFrame.css") return {};
      throw new Error(`Unexpected DialogFrame test dependency: ${name}`);
    },
  });
  assert.ok(exports.DialogFrame);
  return exports.DialogFrame;
}

async function fixture() {
  const requests: { remoteUrl: string; path: string; name: string }[] = [];
  const exports: Partial<Pick<typeof import("./CloneGitHubRepoDialog"), "CloneGitHubRepoDialog">> = {};
  runInNewContext(javascript("./CloneGitHubRepoDialog.tsx"), {
    exports, Error,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "./DialogFrame") return { DialogFrame: dialogFrame() };
      if (name === "../state/cloneDialog") return model;
      if (name === "../backend") return {
        async githubGitProtocol() { return "https"; },
        async githubRecentRepos() { return []; },
        async lastCloneDirectory() { return null; },
        async folderExists() { return false; },
        pickFolder() { throw new Error("No native picker is used"); },
        saveLastCloneDirectory() { throw new Error("No clone succeeds in this test"); },
      };
      if (name === "../workspace/api") return {
        async defaultCloneDirectory() { return "/synthetic/initial"; },
        cloneRepository(remoteUrl: string, path: string, name: string) {
          requests.push({ remoteUrl, path, name });
          return new Promise(() => {});
        },
      };
      throw new Error(`Unexpected clone URL test dependency: ${name}`);
    },
  });
  assert.ok(exports.CloneGitHubRepoDialog);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(exports.CloneGitHubRepoDialog, {
      onClose() { throw new Error("The dialog must stay mounted"); },
      onCloned() { throw new Error("No real clone is performed"); },
    }));
  });
  const input = () => renderer.root.findByType("form").findAllByType("input").find((node: { props: { id?: string } }) => node.props.id === "git-url");
  const submit = async () => {
    await act(async () => { void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
  };
  const edit = (value: string) => { act(() => input().props.onChange({ target: { value } })); };
  return {
    input, edit, submit, requests,
    primary: () => renderer.root.findByProps({ type: "submit" }),
    async start() {
      edit("https://github.com/Acme/MixedCase.git");
      await submit();
      assert.equal(requests.length, 1);
      assert.equal(renderer.root.findByProps({ type: "submit" }).props.disabled, true);
    },
    dispose() { act(() => renderer.unmount()); },
  };
}

for (const pending of [false, true]) {
  const state = pending ? "while cloning" : "before cloning";
  for (const attribute of ["autoCorrect", "autoCapitalize"]) {
    test(`clone URL disables ${attribute} ${state}`, async () => {
      const view = await fixture();
      try {
        if (pending) await view.start();
        assert.equal(view.input().props[attribute], "off", `${attribute} must be off on the URL input`);
      } finally { view.dispose(); }
    });
  }

  test(`clone URL keeps its existing input controls ${state}`, async () => {
    const view = await fixture();
    try {
      if (pending) await view.start();
      assert.equal(view.input().props.autoComplete, "off");
      assert.equal(view.input().props.spellCheck, false);
      assert.equal(view.input().props.autoFocus, true);
      assert.notEqual(view.input().props.disabled, true);
    } finally { view.dispose(); }
  });
}

test("clone URL preserves mixed-case edits and the captured pending request", async () => {
  const view = await fixture();
  try {
    await view.start();
    view.edit("git@github.com:Acme/NextRepo.git");
    assert.equal(view.input().props.value, "git@github.com:Acme/NextRepo.git");
    assert.deepEqual(view.requests, [{ remoteUrl: "https://github.com/Acme/MixedCase.git", path: "/synthetic/initial", name: "mixedcase" }]);
    await view.submit();
    assert.equal(view.requests.length, 1);
    assert.equal(view.primary().props.disabled, true);
  } finally { view.dispose(); }
});
