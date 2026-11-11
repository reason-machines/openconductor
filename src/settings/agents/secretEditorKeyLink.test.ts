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
const source = readFileSync(process.env.SECRET_EDITOR_SOURCE_FILE ?? new URL("./kit.tsx", import.meta.url), "utf8");

type SecretProps = Parameters<typeof import("./kit").SecretRow>[0];
type Button = { children: unknown[]; props: { onClick: () => void } };

function fixture(props: Pick<SecretProps, "label" | "configured" | "getKeyUrl">) {
  const opened: string[] = [];
  const forbiddenCalls: string[] = [];
  const forbid = (name: string) => () => {
    forbiddenCalls.push(name);
    throw new Error(`Unexpected credential/native call: ${name}`);
  };
  const kit: Partial<Pick<typeof import("./kit"), "SecretRow">> = {};
  const javascript = ts.transpileModule(source, {
    fileName: "kit.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, {
    exports: kit,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name.endsWith(".css")) return {};
      if (name === "./kitModel") return kitModel;
      if (name === "../../backend") return { openUrl: async (url: string) => { opened.push(url); } };
      if (name === "./icons") return new Proxy({}, { get: () => () => null });
      if ([
        "../../components/Icons", "../../components/Toast", "../../features/openIn/OpenInButton",
        "../../features/openIn/apps", "../appPrefs", "./parts", "../rows/AgentOptionRows",
      ].includes(name)) return new Proxy({}, { get: (_target, key) => forbid(String(key)) });
      throw new Error(`Unexpected kit dependency: ${name}`);
    },
  });
  assert.ok(kit.SecretRow);
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(kit.SecretRow, {
      ...props,
      onSave: forbid("onSave"),
      onDelete: forbid("onDelete"),
      reveal: forbid("reveal"),
    }));
  });
  const buttons = (label: string): Button[] => renderer.root.findAllByType("button").filter((node: Button) =>
    node.children.filter((child) => typeof child === "string").join("") === label,
  );
  return {
    buttons,
    opened,
    forbiddenCalls,
    edit() { act(() => renderer.root.findByProps({ "aria-label": `Edit ${props.label}` }).props.onClick()); },
    click(label: string) {
      const matches = buttons(label);
      assert.equal(matches.length, 1, `Expected exactly one ${label} button`);
      act(() => matches[0].props.onClick());
    },
    close() { act(() => renderer.unmount()); },
  };
}

for (const [label, getKeyUrl] of [
  ["Anthropic API key", "https://console.anthropic.com/settings/keys"],
  ["OpenAI API key", "https://platform.openai.com/api-keys"],
] as const) {
  test(`editing a configured ${label} retains Get key`, () => {
    const view = fixture({ label, getKeyUrl, configured: true });
    try {
      assert.equal(view.buttons("Get key").length, 0, "The masked row remains unchanged before Edit");
      view.edit();
      assert.equal(view.buttons("Cancel").length, 1);
      assert.equal(view.buttons("Get key").length, 1, "Replacing a configured key must retain its provider key link");
      view.click("Get key");
      assert.deepEqual(view.opened, [getKeyUrl]);
      assert.deepEqual(view.forbiddenCalls, [], "Opening the provider page must not read or change credentials");
      view.click("Cancel");
      assert.equal(view.buttons("Get key").length, 0);
      assert.deepEqual(view.forbiddenCalls, []);
    } finally { view.close(); }
  });
}

test("an unconfigured key keeps its provider link without Cancel", () => {
  const getKeyUrl = "https://platform.openai.com/api-keys";
  const view = fixture({ label: "OpenAI API key", getKeyUrl, configured: false });
  try {
    assert.equal(view.buttons("Get key").length, 1);
    assert.equal(view.buttons("Cancel").length, 0);
    view.click("Get key");
    assert.deepEqual(view.opened, [getKeyUrl]);
    assert.deepEqual(view.forbiddenCalls, []);
  } finally { view.close(); }
});

test("editing a key without a provider URL does not invent a link", () => {
  const view = fixture({ label: "Custom API key", configured: true });
  try {
    view.edit();
    assert.equal(view.buttons("Get key").length, 0);
    assert.equal(view.buttons("Cancel").length, 1);
    view.click("Cancel");
    assert.deepEqual(view.opened, []);
    assert.deepEqual(view.forbiddenCalls, []);
  } finally { view.close(); }
});
