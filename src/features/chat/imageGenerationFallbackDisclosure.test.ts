import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ToolRowProps } from "./ToolRows.tsx";
import * as tools from "./conductorTools.ts";
import * as icons from "./toolIconData.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { applyReasonPayload, reasonChat, startTurn } from "./reason.ts";
import { applyChatEvents, emptyTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
type Node = { type: unknown; props: Record<string, unknown>; children: Array<Node | string>; findAll: (predicate: (node: Node) => boolean) => Node[] };
type InputCase = { id: string; name: "ImageGeneration" | "Read"; result: string | null; isError: boolean; input: Record<string, unknown> };
const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
const hasClass = (node: Node, name: string): boolean => String(node.props.className).split(" ").includes(name);

function frozenCases(): InputCase[] {
  const contract: unknown = JSON.parse(readFileSync(new URL("../../../evidence/chat/image-generation-fallback/contract.json", import.meta.url), "utf8"));
  assert.ok(contract && typeof contract === "object" && "cases" in contract && Array.isArray(contract.cases));
  const cases = contract.cases.map((value: unknown): InputCase => {
    assert.ok(value && typeof value === "object");
    assert.ok("id" in value && typeof value.id === "string");
    assert.ok("name" in value && (value.name === "ImageGeneration" || value.name === "Read"));
    assert.ok("result" in value && (typeof value.result === "string" || value.result === null));
    assert.ok("isError" in value && typeof value.isError === "boolean");
    const input: Record<string, unknown> = {};
    if ("input" in value) {
      assert.ok(value.input && typeof value.input === "object" && "file_path" in value.input && typeof value.input.file_path === "string");
      input.file_path = value.input.file_path;
    }
    return { id: value.id, name: value.name, result: value.result, isError: value.isError, input };
  });
  assert.deepEqual(cases.map((value) => value.id), ["plain-explanation", "unsupported-svg", "recognized-png", "pending-no-result", "read-still-collapsible"]);
  return cases;
}

function normalizedCall(input: InputCase) {
  const chatId = `image-fallback:${input.id}`;
  const at = new Date(0);
  const started = startTurn(reasonChat(chatId), "Generate an image", at);
  const pending = input.result === null;
  const step = applyReasonPayload(started.state, {
    chatId, type: "tool", id: input.id, title: input.name, kind: input.name === "Read" ? "read" : "other",
    toolName: input.name, rawInput: input.input, status: pending ? "running" : input.isError ? "failed" : "completed",
    output: input.result ?? "", diffs: [], locations: [],
  }, at);
  const reduced = applyChatEvents(emptyTranscript(chatId), [...started.events, ...step.events]);
  assert.ok(reduced.ok);
  const assistant = buildRows(reduced.transcript).find((row) => row.kind === "assistant");
  assert.ok(assistant?.kind === "assistant");
  const part = assistant.parts.find((part) => part.kind === "tool");
  assert.ok(part?.kind === "tool");
  assert.equal(part.call.id, input.id);
  assert.deepEqual(part.call.tool, { name: input.name, input: input.input });
  assert.equal(tools.toolKind(part.call.tool.name), input.name === "Read" ? "read" : "image-generation");
  assert.equal(part.call.status, pending ? "running" : input.isError ? "error" : "done");
  assert.equal(part.call.result, pending ? undefined : input.result);
  if (pending) assert.equal("result" in part.call, false, "pending JSON null means no tool result, not a literal null result");
  return part.call;
}

async function fixture(input: InputCase) {
  const production: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync(new URL("./ToolRows.tsx", import.meta.url), "utf8"), {
    fileName: "ToolRows.tsx",
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter((diagnostic: { category: number }) => diagnostic.category === ts.DiagnosticCategory.Error).length, 0);
  const unrelated = () => { throw new Error("Unrelated image-fallback dependency executed"); };
  runInNewContext(compiled.outputText, {
    exports: production,
    require(name: string) {
      switch (name) {
        case "react": case "react/jsx-runtime": return dependencies(name);
        case "./conductorTools.ts": return tools;
        case "./toolIconData.ts": return icons;
        case "./thinkingChip.ts": return { thinkingChipText };
        case "./markdown.ts": return { highlight: (_language: string | undefined, value: string) => value, Markdown: unrelated };
        case "./LinkMenu.tsx": return { LinkWithMenu: unrelated };
        case "../../backend.ts": return { openUrl: unrelated };
        default: throw new Error(`Unexpected ToolRows dependency: ${name}`);
      }
    },
  }, { filename: "ToolRows.tsx" });
  assert.equal(typeof production.ConductorToolRow, "function");
  assert.equal(typeof production.opensByDefault, "function");
  const call = normalizedCall(input);
  const defaultOpen = production.opensByDefault(call.tool);
  assert.equal(defaultOpen, input.name === "ImageGeneration");
  let toggleCalls = 0;
  let setControlledOpen: (value: boolean) => void = unrelated;
  function Scene() {
    const [open, setOpen] = React.useState(defaultOpen);
    setControlledOpen = (value) => setOpen(value);
    const props: ToolRowProps = {
      tool: call.tool, status: call.status, result: call.result, isError: call.status === "error", open,
      onToggle: () => { toggleCalls++; setOpen((value: boolean) => !value); },
      onOpenFile: unrelated,
    };
    return React.createElement(production.ConductorToolRow, props);
  }
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Scene)); });
  const all = (predicate: (node: Node) => boolean): Node[] => renderer.root.findAll((node: Node) => typeof node.type === "string" && predicate(node));
  const header = (): Node => {
    const found = all((node) => hasClass(node, "oc-tool-head"));
    assert.equal(found.length, 1, "one actual production header");
    return found[0]!;
  };
  return {
    all, header,
    bodies: () => all((node) => hasClass(node, "oc-tool-content")),
    toggles: () => toggleCalls,
    async click() {
      const handler = header().props.onClick;
      if (typeof handler === "function") await act(async () => { handler(); });
    },
    async setOpen(value: boolean) { await act(async () => { setControlledOpen(value); }); },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const input of frozenCases()) {
  test(`generated-image disclosure: ${input.id}`, async () => {
    const view = await fixture(input);
    try {
      const bodyText = (): string => {
        const bodies = view.bodies();
        assert.equal(bodies.length, 1, "one actual production content body");
        return text(bodies[0]!);
      };
      switch (input.id) {
        case "plain-explanation":
        case "unsupported-svg": {
          assert.equal(text(view.header()), "Generated image");
          assert.equal(bodyText(), input.result);
          await view.click();
          assert.equal(view.toggles(), 0, input.id === "plain-explanation" ? "IMAGE_FALLBACK_TEXT_MUST_NOT_TOGGLE" : "IMAGE_FALLBACK_SVG_MUST_NOT_TOGGLE");
          assert.equal(bodyText(), input.result, "click preserves exact fallback content");
          assert.equal(view.header().props.role, undefined);
          assert.equal(view.header().props["aria-expanded"], undefined);
          assert.equal(view.all((node) => hasClass(node, "oc-tool-icon-swap")).length, 0);
          if (input.id === "plain-explanation") {
            await view.setOpen(false);
            assert.equal(view.bodies().length, 0, "explicit controlled false must not be forced open");
            await view.click();
            assert.equal(view.toggles(), 0, "closed fallback cannot reopen through its header");
            assert.equal(view.bodies().length, 0);
          }
          break;
        }
        case "recognized-png":
          assert.equal(text(view.header()), "Generated image");
          assert.equal(bodyText(), "/synthetic/output/image.PNG");
          assert.equal(view.header().props.role, "button");
          assert.equal(view.header().props["aria-expanded"], true);
          assert.equal(view.all((node) => hasClass(node, "oc-tool-icon-swap")).length, 1);
          assert.equal(view.all((node) => node.type === "img").length, 0, "existing path presentation, not an image preview feature");
          await view.click();
          assert.equal(view.toggles(), 1, "PNG control observes the real toggle callback");
          assert.equal(view.header().props["aria-expanded"], false);
          assert.equal(view.bodies().length, 0);
          await view.click();
          assert.equal(view.toggles(), 2);
          assert.equal(bodyText(), "/synthetic/output/image.PNG");
          break;
        case "pending-no-result":
          assert.equal(text(view.header()), "Generating image");
          assert.equal(view.bodies().length, 0);
          assert.equal(view.header().props.role, undefined);
          assert.equal(view.header().props["aria-expanded"], undefined);
          await view.click();
          assert.equal(view.toggles(), 0);
          assert.equal(view.bodies().length, 0);
          break;
        case "read-still-collapsible":
          assert.equal(view.header().props.role, "button");
          assert.equal(view.header().props["aria-expanded"], false);
          assert.equal(view.bodies().length, 0);
          await view.click();
          assert.equal(view.toggles(), 1, "ordinary Read retains shared shell disclosure");
          assert.equal(view.header().props["aria-expanded"], true);
          const readLines = view.all((node) => hasClass(node, "oc-code-line"));
          assert.equal(readLines.length, 1);
          assert.equal(text(readLines[0]!.children[1]!), "read body");
          await view.click();
          assert.equal(view.toggles(), 2);
          assert.equal(view.bodies().length, 0);
          break;
        default:
          assert.fail(`Unrecognized frozen case: ${input.id}`);
      }
    } finally { await view.close(); }
  });
}
