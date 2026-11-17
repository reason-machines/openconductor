import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import * as home from "../../src/home/allWorkspaces.ts";

// Structural host for existing react-test-renderer row/startup fixtures.
// Execute the real leaf; only Base UI's DOM/portal boundary is adapted here.
// Keyboard/focus semantics are exercised by the separate installed-Base-UI DOM suite.
const dependencies = createRequire(import.meta.url);
const inert = () => null;
const children = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);
type Selection = { value: string; onValueChange: (value: string) => void; open: boolean; setOpen: (open: boolean) => void };
const Context = React.createContext<Selection | null>(null);
const ItemContext = React.createContext(false);
function selection() { const value = React.useContext(Context); assert.ok(value); return value; }
function Root({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return React.createElement(Context.Provider, { value: { value, onValueChange, open, setOpen } }, children);
}
function Trigger({ children, ...props }: React.ComponentProps<"button">) {
  const state = selection();
  return React.createElement("button", { ...props, "aria-expanded": state.open, onClick: () => state.setOpen(!state.open) }, children);
}
function Portal({ children }: { children?: React.ReactNode }) { return selection().open ? React.createElement(React.Fragment, null, children) : null; }
function Popup({ children, ...props }: React.ComponentProps<"div">) { return React.createElement("div", { ...props, role: "listbox" }, children); }
function Item({ value, children }: { value: string; children?: React.ReactNode }) {
  const state = selection();
  return React.createElement(ItemContext.Provider, { value: state.value === value }, React.createElement("div", {
    role: "option", "aria-selected": state.value === value,
    onClick: () => { state.onValueChange(value); state.setOpen(false); },
  }, children));
}
function ItemIndicator({ children }: { children?: React.ReactNode }) { return React.useContext(ItemContext) ? React.createElement(React.Fragment, null, children) : null; }
const imports: Record<string, unknown> = {
  "../../home/allWorkspaces": home,
  "../Icons": { ArchiveIcon: inert, ChevronDownIcon: inert },
  "@base-ui/react/select": { Select: { Root, Trigger, Portal, Positioner: children, Popup, Item, ItemText: children, ItemIndicator } },
};
const exported: Record<string, React.ComponentType<any>> = {};
const javascript = ts.transpileModule(readFileSync(new URL("../../src/components/home/ArchiveFilter.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
runInNewContext(javascript, { exports: exported, require(name: string) {
  if (name === "react/jsx-runtime") return dependencies(name);
  assert.ok(name in imports, `Unexpected closed Archive fixture dependency: ${name}`);
  return imports[name];
} });
export const closedArchiveFilterFixture = exported;
