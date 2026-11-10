import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { CustomSectionCollapse, CUSTOM_SECTION_COLLAPSE_ID, BUILTIN_SECTION_COLLAPSE_ID as BUILTIN_ID, PINNED_COLLAPSE_KEY as PINNED, MAIN_COLLAPSE_KEY as MAIN } from "../state/customSectionCollapse.ts";

function storage() {
  const entries = new Map<string, string>();
  return { entries, async getItem(id: string) { return entries.get(id) ?? null; }, async setItem(id: string, value: string) { entries.set(id, value); } };
}

type GroupProps = { label: string; count: number; children: ReactNode; collapsed: boolean; onToggle(): void };
function groupComponent() {
  const source = readFileSync(new URL("./SidebarSections.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021,
  } });
  const require = createRequire(import.meta.url);
  const exports: { SidebarGroup?: ComponentType<GroupProps> } = {};
  runInNewContext(outputText, { exports, require: (name: string) => {
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    if (name === "./Icons") return { ChevronIcon: () => null, ChevronDownIcon: () => null };
    if (name === "../state/navigationSections") return { DROP_ATTR: { pinned: "data-workspace-pinned-drop" } };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  assert.ok(exports.SidebarGroup);
  return exports.SidebarGroup;
}

test("Pinned stays collapsed after remount and re-expansion survives another reload", async () => {
  const Group = groupComponent();
  const saved = storage();
  const first = new CustomSectionCollapse(saved, BUILTIN_ID);
  await first.load();
  first.toggle(PINNED);
  await first.flush();
  const second = new CustomSectionCollapse(saved, BUILTIN_ID);
  await second.load();
  const render = (store: CustomSectionCollapse) => renderToStaticMarkup(createElement(Group, {
    label: "Pinned", count: 1, children: "pinned-workspace", collapsed: store.getSnapshot().has(PINNED), onToggle: () => store.toggle(PINNED),
  }));
  assert.match(render(second), /aria-expanded="false"/);
  assert.doesNotMatch(render(second), /pinned-workspace/);
  second.toggle(PINNED);
  await second.flush();
  const third = new CustomSectionCollapse(saved, BUILTIN_ID);
  await third.load();
  assert.match(render(third), /aria-expanded="true"/);
  assert.match(render(third), /pinned-workspace/);
});

test("built-in groups persist independently without changing custom sections or Diff", async () => {
  const saved = storage();
  saved.entries.set("route-user-state-v1", "diff-envelope");
  const custom = new CustomSectionCollapse(saved);
  await custom.load();
  custom.toggle("focus");
  await custom.flush();
  const builtin = new CustomSectionCollapse(saved, BUILTIN_ID);
  await builtin.load();
  assert.deepEqual([...builtin.getSnapshot()], []);
  builtin.toggle(PINNED);
  builtin.toggle(MAIN);
  await builtin.flush();
  const reload = new CustomSectionCollapse(saved, BUILTIN_ID);
  await reload.load();
  assert.deepEqual([...reload.getSnapshot()].sort(), [MAIN, PINNED].sort());
  reload.toggle(MAIN);
  await reload.flush();
  const expanded = new CustomSectionCollapse(saved, BUILTIN_ID);
  await expanded.load();
  assert.deepEqual([...expanded.getSnapshot()], [PINNED]);
  assert.equal(saved.entries.get(CUSTOM_SECTION_COLLAPSE_ID), '["focus"]');
  assert.equal(saved.entries.get("route-user-state-v1"), "diff-envelope");
});

test("early built-in toggles win delayed hydration without discarding the other group", async () => {
  let resolve: (value: string) => void = () => {};
  const reading = new Promise<string>((done) => { resolve = done; });
  const saved = storage();
  const first = new CustomSectionCollapse({ ...saved, getItem: () => reading }, BUILTIN_ID);
  const loading = first.load();
  first.toggle(MAIN);
  first.toggle(MAIN);
  resolve(JSON.stringify([PINNED, MAIN]));
  await loading;
  await first.flush();
  const reload = new CustomSectionCollapse(saved, BUILTIN_ID);
  await reload.load();
  assert.deepEqual([...reload.getSnapshot()], [PINNED]);
});
