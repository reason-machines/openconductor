import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import * as sectionSearchScore from "./search/score.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const output = ts.transpileModule(readFileSync(new URL("./MoveToSection.tsx", import.meta.url), "utf8"), {
  fileName: "MoveToSection.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports: Partial<typeof import("./MoveToSection.tsx")> = {};
runInNewContext(output, {
  exports,
  require(name: string) {
    if (name === "./search/score.ts") return sectionSearchScore;
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    assert.equal(name, "../components/ConductorIcon");
    return { ConductorIcon: () => null };
  },
});
assert.ok(exports.MoveToSection);
const MoveToSection = exports.MoveToSection;

for (const identified of [false, true]) {
  test(`control: section IDs ${identified ? "present" : "absent"} do not enable the current section`, async () => {
    const moved: number[] = [];
    const hovered: number[] = [];
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(MoveToSection, {
        workspaceId: "workspace", query: "", active: 1,
        sections: [
          { id: "current", name: "Current", workspaceIds: ["workspace"] },
          { id: "other", name: "Other", workspaceIds: [] },
        ],
        optionId: identified ? (index: number) => `test-option-${index}` : undefined,
        onActive: (index: number) => hovered.push(index),
        onSelectAt: (index: number) => moved.push(index), onBack() {},
      }));
    });
    try {
      const rows = renderer.root.findAllByProps({ role: "option" });
      assert.equal(rows[0].props["aria-disabled"], true);
      await act(async () => { rows[0].props.onMouseMove(); rows[0].props.onClick(); });
      assert.deepEqual(moved, []);
      assert.deepEqual(hovered, []);
      await act(async () => { rows[1].props.onClick(); });
      assert.deepEqual(moved, [1]);
      assert.equal(rows[1].props["aria-selected"], true);
    } finally { await act(async () => { renderer.unmount(); }); }
  });
}
