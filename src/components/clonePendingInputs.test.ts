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
  const picks: { title: string; defaultPath: string }[] = [];
  let rejectClone: (error: Error) => void = () => { throw new Error("No clone is pending"); };
  let progress: (line: string) => void = () => { throw new Error("No clone is pending"); };
  const exports: Partial<Pick<typeof import("./CloneGitHubRepoDialog"), "CloneGitHubRepoDialog">> = {};
  runInNewContext(javascript("./CloneGitHubRepoDialog.tsx"), {
    exports, Error,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "./DialogFrame") return { DialogFrame: dialogFrame() };
      if (name === "../state/cloneDialog") return model;
      if (name === "../backend") return {
        async githubGitProtocol() { return "https"; },
        async githubRecentRepos() {
          return [{ id: 1, full_name: "acme/recent", description: null, clone_url: "https://github.com/acme/recent.git", ssh_url: "git@github.com:acme/recent.git", owner: { avatar_url: "" } }];
        },
        async lastCloneDirectory() { return null; },
        async folderExists() { return false; },
        async pickFolder(title: string, defaultPath: string) {
          picks.push({ title, defaultPath });
          return "/synthetic/picked";
        },
        saveLastCloneDirectory() { throw new Error("Clone must not succeed in this test"); },
      };
      if (name === "../workspace/api") return {
        async defaultCloneDirectory() { return "/synthetic/initial"; },
        cloneRepository(remoteUrl: string, path: string, name: string, onLog: (line: string) => void) {
          requests.push({ remoteUrl, path, name });
          progress = onLog;
          return new Promise((_resolve, reject) => { rejectClone = reject; });
        },
      };
      throw new Error(`Unexpected clone input test dependency: ${name}`);
    },
  });
  assert.ok(exports.CloneGitHubRepoDialog);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(exports.CloneGitHubRepoDialog, {
      onClose() { throw new Error("Clone must stay mounted"); },
      onCloned() { throw new Error("No real clone is performed"); },
    }));
  });
  function input(field: string) {
    return field === "url" ? renderer.root.findByProps({ id: "git-url" }) : renderer.root.findByProps({ placeholder: "Enter path or click to select" });
  }
  function edit(field: string, value: string) {
    act(() => input(field).props.onChange({ target: { value } }));
  }
  async function submit() {
    await act(async () => { void renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
  }
  return {
    requests, picks, input, edit, submit,
    primary: () => renderer.root.findByProps({ type: "submit" }),
    async start() {
      edit("url", "https://github.com/acme/first.git");
      await submit();
      assert.equal(requests.length, 1);
      assert.equal(renderer.root.findByProps({ type: "submit" }).props.disabled, true);
    },
    log(line: string) { act(() => progress(line)); },
    rendered: () => JSON.stringify(renderer.toJSON()),
    button: (text: string) => renderer.root.findAllByType("button").find((node: { props: { children: unknown } }) => node.props.children === text),
    recent: () => renderer.root.findByProps({ "aria-pressed": false }),
    async fail() { await act(async () => rejectClone(new Error("Synthetic clone failure"))); },
    dispose() { act(() => renderer.unmount()); },
  };
}

test("clone inputs accept edits before submission", async () => {
  const view = await fixture();
  try {
    assert.equal(view.primary().props.disabled, true);
    for (const field of ["url", "location"]) assert.notEqual(view.input(field).props.disabled, true);
    view.edit("url", "https://github.com/acme/first.git");
    view.edit("location", "/synthetic/edited");
    assert.equal(view.input("location").props.value, "/synthetic/edited");
    assert.equal(view.primary().props.disabled, false);
  } finally { view.dispose(); }
});

for (const field of ["url", "location"]) {
  test(`clone ${field} remains editable while its captured request is unresolved`, async () => {
    const view = await fixture();
    try {
      await view.start();
      assert.notEqual(view.input(field).props.disabled, true, `${field} must not be disabled while cloning`);
      const next = field === "url" ? "https://github.com/acme/next.git" : "/synthetic/next";
      view.edit(field, next);
      assert.equal(view.input(field).props.value, next);
      assert.deepEqual(view.requests, [{ remoteUrl: "https://github.com/acme/first.git", path: "/synthetic/initial", name: "first" }]);
      await view.submit();
      assert.equal(view.requests.length, 1, "editing must not start a second pending clone");
      assert.equal(view.primary().props.disabled, true);
    } finally { view.dispose(); }
  });
}

test("clone Browse remains enabled while its captured request is unresolved", async () => {
  const view = await fixture();
  try {
    await view.start();
    assert.notEqual(view.button("Browse").props.disabled, true, "Browse must not be disabled while cloning");
    await act(async () => { view.button("Browse").props.onClick(); });
    assert.deepEqual(view.picks, [{ title: "Choose where to clone the repository", defaultPath: "/synthetic/initial" }]);
    assert.equal(view.input("location").props.value, "/synthetic/picked");
    assert.deepEqual(view.requests, [{ remoteUrl: "https://github.com/acme/first.git", path: "/synthetic/initial", name: "first" }]);
    await view.submit();
    assert.equal(view.requests.length, 1);
    assert.equal(view.primary().props.disabled, true);
  } finally { view.dispose(); }
});

test("pending clone keeps its submit guard and progress with recent selection enabled", async () => {
  const view = await fixture();
  try {
    await view.start();
    await view.submit();
    assert.equal(view.requests.length, 1);
    view.log("Receiving objects");
    assert.match(view.rendered(), /Receiving objects/);
    assert.match(view.rendered(), /Cloning/);
    assert.notEqual(view.recent().props.disabled, true);
  } finally { view.dispose(); }
});

test("clone rejection allows a retry with the latest form values", async () => {
  const view = await fixture();
  try {
    await view.start();
    await view.fail();
    assert.equal(view.primary().props.disabled, false);
    assert.match(view.rendered(), /Synthetic clone failure/);
    view.edit("url", "https://github.com/acme/retry.git");
    view.edit("location", "/synthetic/retry");
    await view.submit();
    assert.deepEqual(view.requests[1], { remoteUrl: "https://github.com/acme/retry.git", path: "/synthetic/retry", name: "retry" });
  } finally { view.dispose(); }
});
