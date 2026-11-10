import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as loadout from "./agents/loadout.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import type { FavoriteRow } from "./agents/api.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { create, act } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const source = readFileSync(new URL("./ModelLoadout.tsx", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const catalog = [
  { agent: "reason", id: "live/reason-model", name: "Live Reason", efforts: ["low", "high"], defaultEffort: "high" },
  { agent: "claude", id: "live-claude-model", name: "Live Claude" },
  { agent: "codex", id: "live-codex-model", name: "Live Codex", efforts: ["medium", "xhigh"], defaultEffort: "xhigh" },
];

async function fixture(initial: FavoriteRow[] = [], options: { deferredRead?: boolean; failedRead?: boolean; initialized?: boolean } = {}) {
  let rows = initial;
  let settings = { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, default_initialized: options.initialized ?? false } };
  let failWrite = false;
  const focuses: string[] = [];
  let releaseRead = () => {};
  const readReady = options.deferredRead ? new Promise<void>((resolve) => { releaseRead = resolve; }) : Promise.resolve();
  let deferWrites = 0;
  const writeRequests: { resolve: () => void; reject: () => void }[] = [];
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const document = {
    activeElement: null as unknown,
    addEventListener(type: string, handler: (event: unknown) => void) { const list = listeners.get(type) ?? new Set(); list.add(handler); listeners.set(type, list); },
    removeEventListener(type: string, handler: (event: unknown) => void) { listeners.get(type)?.delete(handler); },
  };
  const module = { exports: {} as { ModelLoadout: unknown } };
  const mark = () => React.createElement("svg");
  runInNewContext(`(function(require,module,exports){${javascript}\n})`, {
    document, window: { innerWidth: 1200, innerHeight: 800 }, crypto: { randomUUID }, navigator: { clipboard: { writeText: async () => {} } },
  })((name: string) => {
    if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
    if (name === "./agents/loadout") return loadout;
    if (name === "./agents/api") return {
      listFavorites: async () => { await readReady; if (options.failedRead) throw new Error("read offline"); return rows; },
      replaceFavorites: async (next: FavoriteRow[]) => {
        if (deferWrites > 0) {
          deferWrites -= 1;
          await new Promise<void>((resolve, reject) => writeRequests.push({ resolve, reject: () => reject(new Error("first write failed")) }));
        }
        if (failWrite) throw new Error("storage offline");
        rows = next;
      },
    };
    if (name === "./agents/icons") return new Proxy({}, { get: () => mark });
    if (name === "./agentSettings") return { levelLabel: (level: string) => level.toUpperCase() };
    if (name === "./reasonPalette") return { LOADOUT_COLUMNS: ["reason", "claude", "codex"], LOADOUT_LABEL: { reason: "Reason Machines", claude: "Claude Code", codex: "Codex" } };
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  let renderer: ReturnType<typeof create>;
  const props = () => ({ settings, models: catalog, errors: {}, loading: false, refresh() {}, async save(next: typeof settings) { settings = next; renderer.update(React.createElement(module.exports.ModelLoadout, props())); return true; } });
  await act(async () => {
    renderer = create(React.createElement(module.exports.ModelLoadout, props()), { createNodeMock: (element: { props: { "aria-label"?: string } }) => ({ focus() { focuses.push(element.props["aria-label"] ?? "host"); }, contains: (target: unknown) => target === "insideSlots", getBoundingClientRect: () => ({ left: 0, right: 500, top: 0, bottom: 100 }), querySelector: () => null, querySelectorAll: () => [] }) });
  });
  const event = (extra = {}) => ({ preventDefault() {}, stopPropagation() {}, currentTarget: { focus() { focuses.push("anchor"); }, getBoundingClientRect: () => ({ left: 0, bottom: 100 }) }, dataTransfer: { effectAllowed: "", dropEffect: "", setData() {} }, ...extra });
  const slot = (number: number) => renderer.root.findByProps({ "data-loadout-slot": number });
  const card = (number: number) => slot(number).findAllByType("button")[0];
  const palette = (name: string) => renderer.root.findByProps({ "aria-label": `Add ${name} to loadout` });
  return {
    event, slot, card, palette,
    rows: () => rows,
    settings: () => settings,
    modelIds: () => rows.map((row) => JSON.parse(row.configuration).model),
    failWrite() { failWrite = true; },
    focuses,
    deferWrite() { deferWrites += 1; },
    async releaseRead() { await act(async () => releaseRead()); },
    async rejectWrite(index: number) { await act(async () => writeRequests[index].reject()); },
    async resolveWrite(index: number) { await act(async () => writeRequests[index].resolve()); },
    async changePlanMode(value: boolean) { await act(async () => { settings = { ...settings, models: { ...settings.models, default_plan_mode: value } }; renderer.update(React.createElement(module.exports.ModelLoadout, props())); }); },
    remove: (number: number) => renderer.root.findByProps({ "aria-label": `Remove model from slot ${number}` }),
    effort: (value: string) => renderer.root.findAll((node: { type: unknown; props: { role?: string }; children: unknown[] }) => node.type === "button" && node.props.role === "menuitemradio" && node.children.filter((child) => typeof child === "string").join("") === `Effort: ${value}`)[0],
    async action(action: () => void) { await act(async () => { action(); }); },
    async documentEvent(type: string, extra = {}) { await act(async () => { for (const handler of listeners.get(type) ?? []) handler(event(extra)); }); },
    menuItem: (text: string) => renderer.root.findAll((node: { type: unknown; props: { role?: string }; children: unknown[] }) => node.type === "button" && node.props.role === "menuitem" && node.children.join("") === text)[0],
    alerts: () => renderer.root.findAllByProps({ role: "alert" }),
    async close() { await act(async () => renderer.unmount()); },
  };
}

test("mounted loadout drag fills physical slot 5 from the live catalog without filling earlier holes", async () => {
  const f = await fixture();
  try {
    await f.action(() => f.palette("Live Codex").props.onDragStart(f.event()));
    await f.action(() => f.slot(5).props.onDrop(f.event()));
    assert.match(f.card(5).props["aria-label"], /Live Codex/);
    assert.match(f.card(1).props["aria-label"], /Empty/);
    assert.deepEqual(f.modelIds(), ["live-codex-model"]);
    assert.equal(JSON.parse(f.rows()[0].configuration).slot, 4);
    assert.equal(f.settings().models.default_initialized, false);
  } finally { await f.close(); }
});

test("mounted loadout reorders a physical slot into slot 1 and keeps its live effort and agent", async () => {
  const f = await fixture();
  try {
    await f.action(() => f.palette("Live Codex").props.onContextMenu(f.event()));
    await f.action(() => f.menuItem("Add to slot 5").props.onClick());
    await f.action(() => f.card(5).props.onDragStart(f.event()));
    await f.action(() => f.slot(1).props.onDrop(f.event()));
    assert.match(f.card(1).props["aria-label"], /Live Codex/);
    assert.equal(f.settings().models.default, "live-codex-model");
    assert.equal(f.settings().models.default_agent, "codex");
    assert.equal(f.settings().models.codex.default_thinking_level, "xhigh");
  } finally { await f.close(); }
});

test("mounted context Remove clears slot 1 without promoting slot 2", async () => {
  const f = await fixture();
  try {
    await f.action(() => f.palette("Live Reason").props.onClick());
    await f.action(() => f.palette("Live Claude").props.onClick());
    await f.action(() => f.card(1).props.onContextMenu(f.event()));
    await f.action(() => f.menuItem("Remove").props.onClick());
    assert.match(f.card(1).props["aria-label"], /Empty/);
    assert.match(f.card(2).props["aria-label"], /Live Claude/);
    assert.equal(f.settings().models.default_initialized, false);
    assert.equal(JSON.parse(f.rows()[0].configuration).thinkingLevel, undefined, "no invented effort for a catalog without metadata");
  } finally { await f.close(); }
});

test("mounted keyboard Enter, arrows, Enter picks up a catalog card and fills the selected slot", async () => {
  const f = await fixture();
  try {
    await f.action(() => f.palette("Live Reason").props.onKeyDown(f.event({ key: "Enter" })));
    await f.action(() => f.card(1).props.onKeyDown(f.event({ key: "ArrowRight" })));
    await f.action(() => f.card(2).props.onKeyDown(f.event({ key: "ArrowRight" })));
    await f.action(() => f.card(3).props.onKeyDown(f.event({ key: "Enter" })));
    assert.match(f.card(3).props["aria-label"], /Live Reason/);
    assert.equal(JSON.parse(f.rows()[0].configuration).slot, 2);
    await f.action(() => f.card(3).props.onKeyDown(f.event({ key: "Enter" })));
    await f.documentEvent("keydown", { key: "Escape" });
    assert.equal(f.rows().length, 1, "Escape cancels pickup without changing storage");
  } finally { await f.close(); }
});

test("mounted confirmed drop outside the row clears the slot, while canceled dragend preserves it", async () => {
  const f = await fixture();
  try {
    await f.action(() => f.palette("Live Reason").props.onClick());
    await f.action(() => f.card(1).props.onDragStart(f.event()));
    await f.documentEvent("keydown", { key: "Escape" });
    await f.action(() => f.card(1).props.onDragEnd(f.event({ clientX: 600, clientY: 200 })));
    assert.equal(f.rows().length, 1);
    await f.action(() => f.card(1).props.onDragStart(f.event()));
    await f.documentEvent("drop", { target: "outsideSlots" });
    assert.equal(f.rows().length, 0);
  } finally { await f.close(); }
});

test("mounted failed persistence restores the previous slots and shows the failure", async () => {
  const f = await fixture();
  try {
    f.failWrite();
    await f.action(() => f.palette("Live Reason").props.onClick());
    assert.equal(f.rows().length, 0);
    assert.match(f.card(1).props["aria-label"], /Empty/);
    assert.match(f.alerts()[0].children.join(""), /storage offline/);
  } finally { await f.close(); }
});

for (const failedRead of [false, true]) {
  test(`mounted ${failedRead ? "failed" : "pending"} saved-loadout read cannot erase existing slots`, async () => {
    const initial = [{ id: "persisted", configuration: JSON.stringify({ type: "built-in", agent: "codex", model: "live-codex-model", slot: 4, thinkingLevel: "xhigh", fastMode: false }) }];
    const f = await fixture(initial, { deferredRead: !failedRead, failedRead, initialized: true });
    try {
      assert.equal(f.palette("Live Reason").props.disabled, true);
      assert.equal(f.remove(1).props.disabled, true);
      await f.action(() => f.remove(1).props.onClick());
      await f.action(() => f.palette("Live Reason").props.onClick());
      assert.deepEqual(f.rows(), initial, "mutation boundary guards even a stale event handler");
      if (!failedRead) {
        await f.releaseRead();
        assert.match(f.card(5).props["aria-label"], /Live Codex/);
      } else assert.match(f.alerts()[0].children.join(""), /read offline/);
    } finally { await f.close(); }
  });
}

for (const bothFail of [false, true]) {
  test(`mounted overlapping writes keep rendered and stored slots consistent when ${bothFail ? "both fail" : "the earlier write fails"}`, async () => {
    const f = await fixture();
    try {
      f.deferWrite();
      await f.action(() => f.palette("Live Reason").props.onClick());
      await f.action(() => f.palette("Live Claude").props.onClick());
      if (bothFail) f.failWrite();
      await f.rejectWrite(0);
      if (bothFail) {
        assert.deepEqual(f.rows(), []);
        assert.match(f.card(1).props["aria-label"], /Empty/);
        assert.match(f.card(2).props["aria-label"], /Empty/);
        assert.equal(f.settings().models.default_initialized, false);
      } else {
        assert.deepEqual(f.modelIds(), ["live/reason-model", "live-claude-model"]);
        assert.match(f.card(1).props["aria-label"], /Live Reason/);
        assert.match(f.card(2).props["aria-label"], /Live Claude/);
        assert.equal(f.settings().models.default, "live/reason-model");
      }
    } finally { await f.close(); }
  });
}

test("clearing the sole slot stays empty while persistence waits and does not resurrect it on the next edit", async () => {
  const initial = [{ id: "sole", configuration: JSON.stringify({ type: "built-in", agent: "reason", model: "live/reason-model", slot: 0, thinkingLevel: "high", fastMode: false }) }];
  const f = await fixture(initial, { initialized: true });
  try {
    f.deferWrite();
    await f.action(() => f.remove(1).props.onClick());
    assert.match(f.card(1).props["aria-label"], /Empty/);
    await f.action(() => f.palette("Live Claude").props.onClick());
    assert.match(f.card(1).props["aria-label"], /Live Claude/);
    assert.match(f.card(2).props["aria-label"], /Empty/);
    await f.resolveWrite(0);
    assert.deepEqual(f.modelIds(), ["live-claude-model"]);
    assert.equal(f.settings().models.default, "live-claude-model");
  } finally { await f.close(); }
});

test("a loadout write preserves a settings edit made while favorites persistence waits", async () => {
  const f = await fixture();
  try {
    f.deferWrite();
    await f.action(() => f.palette("Live Reason").props.onClick());
    await f.changePlanMode(true);
    await f.resolveWrite(0);
    assert.equal(f.settings().models.default_plan_mode, true);
    assert.equal(f.settings().models.default, "live/reason-model");
  } finally { await f.close(); }
});

test("mounted effort activation and Escape restore focus to the slot anchor", async () => {
  const f = await fixture();
  try {
    await f.action(() => f.palette("Live Reason").props.onClick());
    await f.action(() => f.card(1).props.onContextMenu(f.event()));
    await f.action(() => f.effort("LOW").props.onClick());
    assert.equal(f.focuses.at(-1), "anchor");
    assert.equal(JSON.parse(f.rows()[0].configuration).thinkingLevel, "low");
    await f.action(() => f.card(1).props.onKeyDown(f.event({ key: "Enter" })));
    await f.documentEvent("keydown", { key: "Escape" });
    assert.match(f.focuses.at(-1) ?? "", /Slot 1/);
  } finally { await f.close(); }
});
