import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import type { ReasonTool } from "./reason.ts";

const dependencies = createRequire(resolve("package.json"));
const React: typeof import("react") = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts: typeof import("typescript") = dependencies("typescript");
const sourceRoot = resolve(process.env.SCHEDULE_WAKEUP_SOURCE_ROOT ?? ".");
const evidence = resolve("evidence/chat/schedule-wakeup");
const proposalBytes = readFileSync(resolve(evidence, "adapter-regression-proposal.json"));
assert.equal(createHash("sha256").update(proposalBytes).digest("hex"), "ebbb8ebe56da58aa8ce975df12104556bee968c1aa74e226c16177f7561571d4");
assert.equal(createHash("sha256").update(readFileSync(resolve(evidence, "regression-contract.json"))).digest("hex"), "92093766ebdbce7795d2c06b26fdfd5ad9ca1fa2b0256ff0f23cd042375c4ea1");

const wakeAt = Date.parse("2026-11-11T12:02:00.000Z");
const observeAt = Date.parse("2026-11-11T12:02:00.250Z");
const waiting = "Waiting until 12:02 PM";
const waited = "Waited until 12:02 PM";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface Frame { at: string; payload: ReasonTool }
interface CaseInput { id: string; frames: Frame[]; repeatControl?: { frame: Frame } }

function tool(value: unknown): value is ReasonTool {
  return record(value) && value.type === "tool" && typeof value.id === "string"
    && typeof value.title === "string" && typeof value.kind === "string"
    && ["pending", "running", "completed", "failed"].includes(String(value.status))
    && (typeof value.output === "string" || value.output === null)
    && Array.isArray(value.diffs) && value.diffs.length === 0
    && Array.isArray(value.locations) && value.locations.length === 0
    && (value.toolName === undefined || value.toolName === null || typeof value.toolName === "string");
}

function frame(value: unknown): value is Frame {
  return record(value) && typeof value.at === "string" && Number.isFinite(Date.parse(value.at)) && tool(value.payload);
}

function caseInput(value: unknown): value is CaseInput {
  return record(value) && typeof value.id === "string" && Array.isArray(value.frames) && value.frames.every(frame)
    && (value.repeatControl === undefined || (record(value.repeatControl) && frame(value.repeatControl.frame)));
}

const proposal: unknown = JSON.parse(proposalBytes.toString("utf8"));
assert.ok(record(proposal) && Array.isArray(proposal.cases) && proposal.cases.every(caseInput));
assert.ok(record(proposal.initialization) && typeof proposal.initialization.at === "string"
  && typeof proposal.initialization.chatId === "string" && typeof proposal.initialization.userPrompt === "string");
const cases = proposal.cases;
const initialization = { at: proposal.initialization.at, chatId: proposal.initialization.chatId, text: proposal.initialization.userPrompt };
assert.deepEqual(cases.map((input) => input.id), [
  "actual-adapter-first-result-time", "actual-mounted-deadline-and-dispose", "pending-control", "stop-control", "error-control",
]);

function input(id: string): CaseInput {
  const found = cases.find((candidate) => candidate.id === id);
  assert.ok(found, `frozen input exists: ${id}`);
  return found;
}

interface Timer { id: number; due: number; callback: (...args: unknown[]) => void; args: unknown[] }

class Clock {
  now = Date.parse(initialization.at);
  private next = 1;
  private timers = new Map<number, Timer>();
  readonly cancelled = new Set<number>();
  readonly fired: number[] = [];
  readonly Date = new Proxy(Date, {
    construct: (target, args) => Reflect.construct(target, args.length > 0 ? args : [this.now]),
    apply: () => new Date(this.now).toString(),
    get: (target, key) => key === "now" ? () => this.now : Reflect.get(target, key),
  });
  readonly setTimeout = (callback: Timer["callback"], delay = 0, ...args: unknown[]): number => {
    const id = this.next++;
    this.timers.set(id, { id, due: this.now + Math.max(0, Number(delay) || 0), callback, args });
    return id;
  };
  readonly clearTimeout = (id: number) => { this.cancelled.add(id); this.timers.delete(id); };
  deadlineTimers(): Timer[] {
    return [...this.timers.values()].filter((timer) => timer.due >= wakeAt && timer.due <= observeAt);
  }
  advance(to: number): void {
    assert.ok(to >= this.now, "external clock never goes backwards");
    let callbacks = 0;
    for (;;) {
      const timer = [...this.timers.values()].filter((candidate) => candidate.due <= to)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!timer) break;
      assert.ok(callbacks++ < 1000, "test clock did not enter a timer loop");
      this.now = timer.due;
      this.timers.delete(timer.id);
      this.fired.push(timer.id);
      timer.callback(...timer.args);
    }
    this.now = to;
  }
}

type Adapter = Pick<typeof import("./reason.ts"), "reasonChat" | "startTurn" | "applyReasonPayload">;
type Reducer = Pick<typeof import("./reducer.ts"), "emptyTranscript" | "applyChatEvents">;
type TranscriptModule = Pick<typeof import("./Transcript.tsx"), "Transcript">;
function adapterModule(value: unknown): value is Adapter {
  return record(value) && typeof value.reasonChat === "function" && typeof value.startTurn === "function" && typeof value.applyReasonPayload === "function";
}
function reducerModule(value: unknown): value is Reducer {
  return record(value) && typeof value.emptyTranscript === "function" && typeof value.applyChatEvents === "function";
}
function transcriptModule(value: unknown): value is TranscriptModule {
  return record(value) && typeof value.Transcript === "function";
}

function sourceModules(clock: Clock) {
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const children = ({ children }: { children?: ReactNode }) => children;
  const empty = () => null;
  const forbidden = () => { throw new Error("native/provider/external actions are not part of this fixture"); };
  const boundaries: Record<string, Record<string, unknown>> = {
    "src/components/ui/Tooltip.tsx": { Tooltip: children },
    "src/components/menu/ContextMenu.tsx": { ContextMenu: children, DropdownMenu: children, MenuItem: children },
    "src/features/chat/ChatSignInCard.tsx": { ChatSignInCard: empty },
    "src/features/chat/LinkMenu.tsx": { LinkMenuNotify: React.createContext(undefined), LinkWithMenu: children },
    "src/features/chat/markdown.ts": { Markdown: ({ text }: { text: string }) => React.createElement("span", null, text), highlight: (text: string) => text },
    "src/features/chat/TurnDetails.tsx": { TurnDetails: empty },
    "src/features/chat/TranscriptSearch.tsx": { TranscriptSearch: children },
    "src/features/chat/fork.ts": { turnAgentLabel: () => undefined },
    "src/settings/useBoolPref.ts": { useBoolPref: () => false },
    "src/backend.ts": { openUrl: forbidden, invoke: forbidden },
  };
  function load(path: string): Record<string, unknown> {
    const prior = cache.get(path);
    if (prior) return prior.exports;
    const module = { exports: {} };
    cache.set(path, module);
    const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      reportDiagnostics: true,
    });
    assert.deepEqual(compiled.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error), [], `whole module transpiles: ${path}`);
    runInNewContext(compiled.outputText, {
      module, exports: module.exports, console, URL, Date: clock.Date, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
      require(name: string) {
        if (name.endsWith(".css")) return {};
        if (!name.startsWith(".")) {
          assert.ok(["react", "react/jsx-runtime"].includes(name), `explicit external dependency: ${name}`);
          return dependencies(name);
        }
        const resolved = resolve(dirname(path), name);
        const target = [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}.js`].find((candidate) => existsSync(candidate));
        assert.ok(target, `production dependency resolves: ${name}`);
        for (const [relative, boundary] of Object.entries(boundaries)) if (target === resolve(sourceRoot, relative)) return boundary;
        return load(target);
      },
    }, { filename: path });
    return module.exports;
  }
  return { load: (relative: string) => load(resolve(sourceRoot, relative)), loaded: () => [...cache.keys()] };
}

function nodeText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(nodeText).join("");
  return record(node) && Array.isArray(node.children) ? node.children.map(nodeText).join("") : "";
}
const whitespace = (text: string) => text.replace(/\s+/gu, " ").trim();

function fixture() {
  const clock = new Clock();
  const modules = sourceModules(clock);
  const adapter = modules.load("src/features/chat/reason.ts");
  const reducer = modules.load("src/features/chat/reducer.ts");
  const ui = modules.load("src/features/chat/Transcript.tsx");
  assert.ok(adapterModule(adapter) && reducerModule(reducer) && transcriptModule(ui), "actual production exports exist");
  const step = adapter.startTurn(adapter.reasonChat(initialization.chatId), initialization.text, new clock.Date());
  let state = step.state;
  const initial = reducer.applyChatEvents(reducer.emptyTranscript(initialization.chatId), step.events);
  assert.ok(initial.ok, "production reducer accepts actual startTurn events");
  let transcript = initial.transcript;
  const now = () => clock.now;
  const element = () => React.createElement(ui.Transcript, { transcript, now, dontCollapseToolCalls: true, expandToolsByDefault: true });
  let tree: { root: { findAllByProps(props: Record<string, unknown>): { children: readonly unknown[] }[] }; toJSON(): unknown; update(node: ReactNode): void; unmount(): void };
  act(() => { tree = create(element()); });
  let closed = false;
  return {
    clock,
    deliver(event: Frame) {
      act(() => {
        clock.advance(Date.parse(event.at));
        const next = adapter.applyReasonPayload(state, { chatId: initialization.chatId, ...event.payload }, new clock.Date());
        state = next.state;
        const applied = reducer.applyChatEvents(transcript, next.events);
        assert.ok(applied.ok, "production reducer accepts actual adapter events");
        transcript = applied.transcript;
        tree.update(element());
      });
    },
    advance(to: number) { act(() => clock.advance(to)); },
    labels: () => tree.root.findAllByProps({ className: "oc-tool-left" }).map((node) => whitespace(nodeText(node))),
    text: () => nodeText(tree.toJSON()),
    graph() {
      for (const path of ["reason.ts", "reducer.ts", "types.ts", "view.ts", "toolGroups.ts", "Transcript.tsx", "ToolRows.tsx", "conductorTools.ts", "turnTime.ts"]) {
        assert.ok(modules.loaded().includes(resolve(sourceRoot, "src/features/chat", path)), `whole production graph loaded ${path}`);
      }
    },
    close() { if (!closed) { act(() => tree.unmount()); closed = true; } },
  };
}

function collectFailure(failures: string[], condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function replay(view: ReturnType<typeof fixture>, frames: Frame[]) { for (const event of frames) view.deliver(event); }

test("actual-adapter-first-result-time", () => {
  const data = input("actual-adapter-first-result-time");
  const view = fixture();
  const failures: string[] = [];
  try {
    replay(view, data.frames);
    view.graph();
    collectFailure(failures, JSON.stringify(view.labels()) === JSON.stringify([waiting]), `first result row: ${JSON.stringify(view.labels())}`);
    assert.ok(data.repeatControl, "frozen duplicate frame exists");
    view.deliver(data.repeatControl.frame);
    collectFailure(failures, JSON.stringify(view.labels()) === JSON.stringify([waiting]), `duplicate row: ${JSON.stringify(view.labels())}`);
    view.advance(observeAt);
    collectFailure(failures, JSON.stringify(view.labels()) === JSON.stringify([waited]), `actual row at original deadline after duplicate: ${JSON.stringify(view.labels())}`);
    assert.deepEqual(failures, [], "WAKE_RESULT_TIME_NOT_PROJECTED");
  } finally { view.close(); }
});

test("actual-mounted-deadline-and-dispose", () => {
  const data = input("actual-mounted-deadline-and-dispose");
  const failures: string[] = [];
  const live = fixture();
  try {
    replay(live, data.frames);
    live.graph();
    live.advance(observeAt);
    collectFailure(failures, JSON.stringify(live.labels()) === JSON.stringify([waited]), `deadline-only row: ${JSON.stringify(live.labels())}`);
  } finally { live.close(); }
  const disposed = fixture();
  try {
    replay(disposed, data.frames);
    const timers = disposed.clock.deadlineTimers();
    collectFailure(failures, timers.length > 0, "completion schedules a wake deadline callback separate from midnight");
    disposed.close();
    for (const timer of timers) collectFailure(failures, disposed.clock.cancelled.has(timer.id), `deadline callback ${timer.id} cancelled on unmount`);
    disposed.advance(observeAt);
    for (const timer of timers) collectFailure(failures, !disposed.clock.fired.includes(timer.id), `deadline callback ${timer.id} never invoked after unmount`);
  } finally { disposed.close(); }
  assert.deepEqual(failures, [], "WAKE_DEADLINE_TRANSITION_MISSING");
});

test("pending-control", () => {
  const view = fixture();
  try {
    replay(view, input("pending-control").frames);
    view.graph();
    assert.deepEqual(view.labels(), ["Scheduling wake-up"]);
    assert.equal(view.clock.deadlineTimers().length, 0, "pending row has no wake deadline callback; midnight is unrelated");
  } finally { view.close(); }
});

test("stop-control", () => {
  const view = fixture();
  try {
    const data = input("stop-control");
    for (const [index, event] of data.frames.entries()) {
      view.deliver(event);
      assert.deepEqual(view.labels(), [index === 0 ? "Stopping scheduled wake-ups" : "Stopped scheduled wake-ups"]);
      assert.equal(view.clock.deadlineTimers().length, 0, "stop row has no wake deadline callback; midnight is unrelated");
    }
    view.graph();
  } finally { view.close(); }
});

test("error-control", () => {
  const view = fixture();
  try {
    replay(view, input("error-control").frames);
    view.graph();
    assert.ok(view.text().includes("Synthetic failed wake-up"), "real generic/error branch retains failed output");
    assert.ok(view.labels().every((label) => !label.includes("Waiting until") && !label.includes("Waited until")));
    assert.equal(view.clock.deadlineTimers().length, 0, "error row has no wake deadline callback; midnight is unrelated");
  } finally { view.close(); }
});
