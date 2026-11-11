import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import { DEFAULT_SETTINGS, type Settings } from "./types.ts";

const dependencies = createRequire(process.env.CUSTOM_PREFIX_DEPS
  ? resolve(process.env.CUSTOM_PREFIX_DEPS, "package.json") : import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const sourceRoot = resolve(process.env.CUSTOM_PREFIX_SOURCE_ROOT ?? ".");

function load<T>(path: string, imports: Record<string, unknown>): T {
  const javascript = ts.transpileModule(readFileSync(resolve(sourceRoot, path), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  return runInNewContext(`${javascript}\nexports;`, {
    exports,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(Object.prototype.hasOwnProperty.call(imports, name), `Unexpected prefix dependency: ${name}`);
      return imports[name];
    },
  });
}

for (const [input, expected] of [
  ["myname-", "myname-tokyo"],
  ["team_", "team_tokyo"],
  ["team/ui-", "team/ui-tokyo"],
  ["Team.UI-", "Team.UI-tokyo"],
  ["feature/", "feature/tokyo"],
  ["team", "team/tokyo"],
]) {
  test(`mounted Git Settings input ${JSON.stringify(input)} saves and previews its creation branch`, async () => {
    const naming = load<typeof import("../workspace/naming.ts")>("src/workspace/naming.ts", {});
    const model = load<typeof import("./model.ts")>("src/settings/model.ts", { "../workspace/naming.ts": naming });
    const prefs = load<typeof import("./prefs.ts")>("src/settings/prefs.ts", {});
    const Row = ({ children, control }: { children?: ReactNode; control?: ReactNode }) => React.createElement("section", null, control, children);
    const controls = load<typeof import("./controls")>("src/settings/controls.tsx", { "./GeneralPage": { Row }, "./prefs": prefs });
    const { GitPage } = load<typeof import("./GitPage")>("src/settings/GitPage.tsx", {
      "../workspace/api": { loadBranchPrefix: async () => ({ branchPrefixType: "none", branchPrefix: null, githubUsername: "other-user" }) },
      "./controls": controls,
      "./GeneralPage": { Row },
      "./prefs": prefs,
      "./model": model,
    });
    const flow = load<typeof import("../workspace/createFlow.ts")>("src/workspace/createFlow.ts", { "./naming.ts": naming });
    let persisted: Settings = { ...DEFAULT_SETTINGS, git: { ...DEFAULT_SETTINGS.git, branch_prefix_type: "none" } };
    let writes = 0;
    let renderer: ReturnType<typeof create>;
    const props = () => ({ settings: persisted, save(next: Settings) {
      writes += 1;
      persisted = JSON.parse(JSON.stringify(next));
      renderer.update(React.createElement(GitPage, props()));
    } });
    await act(async () => { renderer = create(React.createElement(GitPage, props())); });
    try {
      await act(async () => renderer.root.findByProps({ type: "radio", value: "custom" }).props.onChange());
      const field = () => renderer.root.findByProps({ "aria-label": "Custom branch prefix" });
      await act(async () => field().props.onChange({ target: { value: input } }));
      assert.equal(field().props.value, input);
      await act(async () => field().props.onBlur());
      assert.equal(writes, 1);
      assert.equal(persisted.git.branch_prefix_type, "custom");
      assert.equal(persisted.git.branch_prefix, input === "feature/" ? "feature" : input);
      assert.equal(persisted.git.delete_branch_on_archive, DEFAULT_SETTINGS.git.delete_branch_on_archive);
      const preview = renderer.root.findAllByType("p").map((node: { children: unknown[] }) => node.children.join("")).find((text: string) => text.startsWith("Preview: "));
      assert.equal(preview, `Preview: ${expected}`);
      const prefix = naming.resolveBranchPrefix(persisted.git, "other-user");
      const result = flow.buildCreateRequest({ repoId: "fixture-repo", name: "tokyo", nameEdited: true, baseBranch: "main", from: null, firstMessage: "", agent: "reason", model: "", effort: "" }, prefix);
      assert.ok(result.ok);
      assert.equal(result.request.naming.branch, expected);
    } finally {
      await act(async () => renderer.unmount());
    }
  });
}
