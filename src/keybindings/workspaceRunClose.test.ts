import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { bindCommands, type CommandHandlers } from "./bind.ts";
import { createDispatcher, type FocusContext } from "./dispatcher.ts";
import type { BindOptions } from "./resolve.ts";

const require = createRequire(import.meta.url);
const ts: typeof import("typescript") = require("typescript");
const path = fileURLToPath(new URL("../components/WorkspaceView.tsx", import.meta.url));
const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const calls: string[] = [];
function visit(node: import("typescript").Node): void {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useKeybindings") {
    const handlers = node.arguments[0];
    if (handlers && ts.isObjectLiteralExpression(handlers) && handlers.properties.some((property) =>
      property.name && ts.isStringLiteral(property.name) && ["nav.closeTab", "nav.reopenTab"].includes(property.name.text))) {
      calls.push(node.getText(source));
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(calls.length > 0, "exercise the actual WorkspaceView close registrations");
const compiled = ts.transpileModule(calls.join(";\n"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;

type Surface = "run" | "setup" | "panel-terminal" | "center-terminal" | "chat";
class FocusedElement {
  readonly surface: Surface;
  constructor(surface: Surface) {
    this.surface = surface;
  }
  closest(selector: string): FocusedElement | null {
    if (selector === "[data-terminal]") return this.surface === "chat" ? null : this;
    if (selector === ".script-output") return this.surface === "run" || this.surface === "setup" ? this : null;
    return null;
  }
}
function fixture(surface: Surface, activeTab = "diff") {
  const effects: string[] = [];
  const dispatcher = createDispatcher();
  const cleanups: (() => void)[] = [];
  runInNewContext(compiled, {
    HTMLElement: FocusedElement, document: { activeElement: new FocusedElement(surface) },
    useKeybindings(handlers: CommandHandlers, options: BindOptions = {}) {
      cleanups.push(bindCommands(dispatcher, handlers, {}, options));
    },
    activeTab, centerTerminal: surface === "center-terminal" ? { id: "center" } : undefined,
    workspace: { id: "workspace" },
    closeBrowser: () => effects.push("browser"), closeFile: () => effects.push("file"),
    closeDiffTab: () => effects.push("diff"), closePrTab: () => effects.push("pr"),
    closeReview: (id: string) => effects.push(`chat:${id}`),
    closeTab: (_workspace: string, id: string) => effects.push(`terminal:${id}`),
    popClosedTab: () => { effects.push("reopen"); return undefined; },
    reviews: { reopen: () => effects.push("reopen-chat") }, openDiffTab: () => effects.push("reopen-diff"),
  });
  const press = (key = "w", shiftKey = false, dialog: string | null = null) => {
    const context: FocusContext = { activeDialogId: dialog, typing: true, inTerminal: surface !== "chat" };
    return dispatcher.dispatch({ key, code: key === "w" ? "KeyW" : "KeyT", metaKey: true, ctrlKey: false, altKey: false, shiftKey, repeat: false }, context);
  };
  return { effects, press, dispose: () => cleanups.forEach((cleanup) => cleanup()) };
}

for (const surface of ["run", "setup"] as const) {
  test(`Cmd+W in ${surface} output closes the displayed changes tab`, () => {
    const f = fixture(surface);
    try {
      assert.equal(f.press().kind, "ran");
      assert.deepEqual(f.effects, ["diff"]);
    } finally { f.dispose(); }
  });
}
for (const surface of ["panel-terminal", "center-terminal"] as const) {
  test(`Cmd+W in a ${surface} stays with its terminal consumer`, () => {
    const f = fixture(surface, surface === "center-terminal" ? "terminal:center" : "diff");
    try {
      assert.equal(f.press().kind, "pass");
      assert.deepEqual(f.effects, []);
    } finally { f.dispose(); }
  });
}
test("nonterminal Cmd+W still closes the displayed changes tab", () => {
  const f = fixture("chat");
  try { assert.equal(f.press().kind, "ran"); assert.deepEqual(f.effects, ["diff"]); } finally { f.dispose(); }
});
test("Run focus does not close a tab through an open dialog", () => {
  const f = fixture("run");
  try { assert.equal(f.press("w", false, "confirmation").kind, "pass"); assert.deepEqual(f.effects, []); } finally { f.dispose(); }
});
test("Run focus does not close the primary chat or an unrelated terminal", () => {
  const f = fixture("run", "chat");
  try { f.press(); assert.deepEqual(f.effects, []); } finally { f.dispose(); }
});
test("reopen remains disabled inside terminal output", () => {
  const f = fixture("run");
  try { assert.equal(f.press("t", true).kind, "pass"); assert.deepEqual(f.effects, []); } finally { f.dispose(); }
});
test("nonterminal reopen still reaches its existing consumer", () => {
  const f = fixture("chat");
  try { assert.equal(f.press("t", true).kind, "ran"); assert.deepEqual(f.effects, ["reopen"]); } finally { f.dispose(); }
});
