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

async function fixture(protocol: model.GitProtocol) {
  const requests: { remoteUrl: string; path: string; name: string }[] = [];
  const repo = {
    id: 1, full_name: "Acme/RecentRepo", description: "A recent repository",
    clone_url: "https://github.com/Acme/RecentRepo.git", ssh_url: "git@github.com:Acme/RecentRepo.git",
    owner: { avatar_url: "" },
  };
  let rejectClone: (error: Error) => void = () => { throw new Error("No clone is pending"); };
  const exports: Partial<Pick<typeof import("./CloneGitHubRepoDialog"), "CloneGitHubRepoDialog">> = {};
  runInNewContext(javascript("./CloneGitHubRepoDialog.tsx"), {
    exports, Error,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "./DialogFrame") return { DialogFrame: dialogFrame() };
      if (name === "../state/cloneDialog") return model;
      if (name === "../backend") return {
        async githubGitProtocol() { return protocol; },
        async githubRecentRepos() { return [repo]; },
        async lastCloneDirectory() { return null; },
        async folderExists() { return false; },
        pickFolder() { throw new Error("No native picker is used"); },
        saveLastCloneDirectory() { throw new Error("No clone succeeds in this test"); },
      };
      if (name === "../workspace/api") return {
        async defaultCloneDirectory() { return "/synthetic/initial"; },
        cloneRepository(remoteUrl: string, path: string, name: string) {
          requests.push({ remoteUrl, path, name });
          return new Promise((_resolve, reject) => { rejectClone = reject; });
        },
      };
      throw new Error(`Unexpected recent repository test dependency: ${name}`);
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
  const input = () => renderer.root.findByProps({ id: "git-url" });
  const recent = () => renderer.root.findAllByType("button").find((node: { props: { "aria-pressed"?: boolean } }) => typeof node.props["aria-pressed"] === "boolean");
  const submit = async () => {
    await act(async () => { void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
  };
  return {
    requests, input, recent, submit,
    primary: () => renderer.root.findByProps({ type: "submit" }),
    async start() {
      act(() => input().props.onChange({ target: { value: "https://github.com/Acme/First.git" } }));
      await submit();
      assert.equal(requests.length, 1);
      assert.equal(renderer.root.findByProps({ type: "submit" }).props.disabled, true);
    },
    select() {
      assert.notEqual(recent().props.disabled, true, "Recent repositories must remain selectable while cloning");
      act(() => recent().props.onClick());
    },
    async fail() { await act(async () => rejectClone(new Error("Synthetic clone failure"))); },
    rendered: () => JSON.stringify(renderer.toJSON()),
    dispose() { act(() => renderer.unmount()); },
  };
}

for (const protocol of ["https", "ssh"] satisfies model.GitProtocol[]) {
  const expectedUrl = protocol === "ssh" ? "git@github.com:Acme/RecentRepo.git" : "https://github.com/Acme/RecentRepo.git";

  test(`recent repository selection uses ${protocol} before cloning`, async () => {
    const view = await fixture(protocol);
    try {
      view.select();
      assert.equal(view.input().props.value, expectedUrl);
      assert.equal(view.recent().props["aria-pressed"], true);
      assert.equal(view.primary().props.disabled, false);
      assert.deepEqual(view.requests, []);
    } finally { view.dispose(); }
  });

  test(`recent ${protocol} selection changes the form but not the pending clone`, async () => {
    const view = await fixture(protocol);
    try {
      await view.start();
      view.select();
      assert.equal(view.input().props.value, expectedUrl);
      assert.equal(view.recent().props["aria-pressed"], true);
      assert.deepEqual(view.requests, [{ remoteUrl: "https://github.com/Acme/First.git", path: "/synthetic/initial", name: "first" }]);
      await view.submit();
      assert.equal(view.requests.length, 1, "Selection must not submit a second pending clone");
      assert.equal(view.primary().props.disabled, true);
    } finally { view.dispose(); }
  });

  test(`clone retry uses the recent ${protocol} selection made while pending`, async () => {
    const view = await fixture(protocol);
    try {
      await view.start();
      view.select();
      await view.fail();
      assert.match(view.rendered(), /Synthetic clone failure/);
      assert.equal(view.input().props.value, expectedUrl);
      assert.equal(view.primary().props.disabled, false);
      await view.submit();
      assert.deepEqual(view.requests[1], { remoteUrl: expectedUrl, path: "/synthetic/initial", name: "recentrepo" });
    } finally { view.dispose(); }
  });
}
