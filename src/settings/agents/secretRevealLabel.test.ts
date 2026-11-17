import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as kitModel from "./kitModel.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const source = readFileSync(process.env.SECRET_REVEAL_SOURCE_FILE ?? new URL("./kit.tsx", import.meta.url), "utf8");

type SecretProps = Parameters<typeof import("./kit").SecretRow>[0];
type Button = { props: { "aria-label"?: string; "aria-pressed"?: boolean; onClick: () => void } };

function fixture(label: string, withReveal = true) {
  const forbiddenCalls: string[] = [];
  let revealCalls = 0;
  const forbid = (name: string) => () => {
    forbiddenCalls.push(name);
    throw new Error(`Unexpected external action: ${name}`);
  };
  const kit: Partial<Pick<typeof import("./kit"), "SecretRow">> = {};
  const compiled = ts.transpileModule(source, {
    fileName: "kit.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics?.filter((diagnostic: { category: number }) => diagnostic.category === ts.DiagnosticCategory.Error), []);
  runInNewContext(compiled.outputText, {
    exports: kit,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name === "./kitModel") return kitModel;
      if (name === "../../backend") return { openUrl: forbid("openUrl") };
      if (name === "./icons") return new Proxy({}, { get: () => () => null });
      if ([
        "../../components/Icons", "../../components/Toast", "../../features/openIn/OpenInButton",
        "../../features/openIn/apps", "../appPrefs", "./parts", "../rows/AgentOptionRows",
      ].includes(name)) return new Proxy({}, { get: (_target, key) => forbid(String(key)) });
      throw new Error(`Unexpected kit dependency: ${name}`);
    },
  });
  assert.ok(kit.SecretRow);
  const props: SecretProps = {
    label,
    configured: true,
    onSave: forbid("onSave"),
    onDelete: forbid("onDelete"),
    ...(withReveal ? { reveal: async () => { revealCalls += 1; return "fixture-value-not-a-secret"; } } : {}),
  };
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(kit.SecretRow, props)); });
  const toggles = (): Button[] => renderer.root.findAllByType("button").filter((button: Button) =>
    typeof button.props["aria-pressed"] === "boolean",
  );
  return {
    toggles,
    revealCalls: () => revealCalls,
    async toggle() {
      assert.equal(toggles().length, 1);
      await act(async () => { toggles()[0].props.onClick(); });
    },
    close() {
      act(() => renderer.unmount());
      assert.deepEqual(forbiddenCalls, [], "No backend, clipboard, provider, credential save or deletion may run");
    },
  };
}

for (const label of ["Anthropic API key", "OpenAI API key"]) {
  test(`the hidden ${label} action is named Reveal`, () => {
    const view = fixture(label);
    try {
      assert.equal(view.toggles().length, 1);
      assert.equal(view.toggles()[0].props["aria-label"], `Reveal ${label}`);
      assert.equal(view.toggles()[0].props["aria-pressed"], false);
      assert.equal(view.revealCalls(), 0, "Reading the accessible name must not retrieve a value");
    } finally { view.close(); }
  });
}

test("a configured row without a reveal callback has no reveal toggle", () => {
  const view = fixture("Custom API key", false);
  try {
    assert.equal(view.toggles().length, 0);
    assert.equal(view.revealCalls(), 0);
  } finally { view.close(); }
});

test("the visible action keeps its Hide name and pressed state", async () => {
  const view = fixture("Custom API key");
  try {
    await view.toggle();
    assert.equal(view.toggles()[0].props["aria-label"], "Hide Custom API key");
    assert.equal(view.toggles()[0].props["aria-pressed"], true);
    assert.equal(view.revealCalls(), 1);
    await view.toggle();
    assert.equal(view.toggles()[0].props["aria-pressed"], false);
    assert.equal(view.revealCalls(), 1);
  } finally { view.close(); }
});
