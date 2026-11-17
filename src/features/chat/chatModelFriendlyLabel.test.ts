import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactNode } from "react";
import { DEFAULT_SETTINGS } from "../../settings/types.ts";
import type { ModelChoice } from "./composerModels.ts";
import type { ReasonModelOption } from "./reasonModels.ts";

const dependencies = createRequire(import.meta.url);
const React = dependencies("react");
const { act, create } = dependencies("react-test-renderer");
const ts = dependencies("typescript");
const root = fileURLToPath(new URL("../../../", import.meta.url));

function visibleText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join(" ");
  if (node && typeof node === "object" && "children" in node) return visibleText(node.children);
  return "";
}

async function fixture(choice: ModelChoice) {
  const chatId = "friendly-label-chat";
  const key = `openconductor.composer.model.${chatId}`;
  const initial = JSON.stringify(choice);
  const values = new Map([[key, initial]]);
  const writes: { key: string; value: string | null }[] = [];
  const storage = {
    getItem: (name: string) => values.get(name) ?? null,
    setItem(name: string, value: string) { writes.push({ key: name, value }); values.set(name, value); },
    removeItem(name: string) { writes.push({ key: name, value: null }); values.delete(name); },
  };
  const reads: string[] = [];
  const actions: { name: string; args: unknown[] }[] = [];
  let resolveCatalog!: (models: ReasonModelOption[]) => void;
  const catalog = new Promise<ReasonModelOption[]>((yes) => { resolveCatalog = yes; });
  const listeners = new Map<string, Set<unknown>>();
  const events = {
    addEventListener(name: string, callback: unknown) {
      const entries = listeners.get(name) ?? new Set(); entries.add(callback); listeners.set(name, entries);
    },
    removeEventListener(name: string, callback: unknown) { listeners.get(name)?.delete(callback); },
  };
  const modules = new Map<string, Record<string, unknown>>();
  const noIcon = () => null;
  const overrides: Record<string, Record<string, unknown>> = {
    "src/features/chat/reasonChat": {
      RUNNING_MODEL_EVENT: "openconductor:reason-running-model",
      reasonModels: () => { reads.push("reason_models"); return catalog; },
      pickReasonModel: (...args: unknown[]) => { actions.push({ name: "pickReasonModel", args }); },
    },
    "src/settings/api": {
      getSettings: async () => {
        reads.push("get_settings");
        return { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, default_initialized: false } };
      },
    },
    "src/settings/agents/api": {
      FAVORITES_CHANGED_EVENT: "openconductor:favorites-changed",
      listFavorites: async () => { reads.push("list_favorites"); return []; },
    },
    "src/components/ui/Tooltip": {
      Tooltip: ({ children }: { children: ReactNode }) => children,
      ShortcutHint: noIcon,
    },
    "src/components/motion/usePresence": { usePresence: (open: boolean) => ({ mounted: open, attrs: {} }) },
    "src/features/chat/composerIcons": {
      ArrowUpRightIcon: noIcon, CheckIcon: noIcon, ChevronDownIcon: noIcon, ChevronRightIcon: noIcon,
      ModelGlyph: noIcon, PlusSmallIcon: noIcon, SearchSmallIcon: noIcon, SettingsSmallIcon: noIcon,
    },
  };
  function load(filename: string): Record<string, unknown> {
    const name = filename.slice(root.length).replace(/\.(tsx?|css)$/, "");
    if (name in overrides) return overrides[name]!;
    const cached = modules.get(filename);
    if (cached) return cached;
    const exports: Record<string, unknown> = {};
    modules.set(filename, exports);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(source, {
      exports, console, localStorage: storage, setTimeout, clearTimeout,
      window: events, document: { ...events, activeElement: null },
      navigator: { platform: "MacIntel", userAgent: "Node fixture" },
      require(specifier: string) {
        if (specifier === "@tauri-apps/api/core") return {
          invoke: (...args: unknown[]) => { actions.push({ name: "invoke", args }); return Promise.resolve(undefined); },
          isTauri: () => true,
        };
        if (!specifier.startsWith(".")) return dependencies(specifier);
        const base = resolve(dirname(filename), specifier);
        const path = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existsSync);
        assert.ok(path, `Missing production fixture dependency ${specifier} from ${filename}`);
        return load(path);
      },
    });
    return exports;
  }
  const picker = load(resolve(root, "src/features/chat/ChatModelPicker.tsx"));
  const modelPicker = load(resolve(root, "src/features/chat/ModelPicker.tsx"));
  const keybindings = load(resolve(root, "src/keybindings/KeybindingsProvider.tsx"));
  assert.equal(typeof picker.ChatModelPicker, "function");
  assert.equal(typeof modelPicker.ModelPicker, "function");
  assert.equal(typeof keybindings.KeybindingsProvider, "function");
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(keybindings.KeybindingsProvider, null,
      React.createElement(picker.ChatModelPicker, {
        chatId, agent: choice.agent,
        onAgentChange: (...args: unknown[]) => { actions.push({ name: "onAgentChange", args }); },
      })));
  });
  assert.deepEqual([...reads].sort(), ["get_settings", "list_favorites", "reason_models"]);
  const button = () => renderer.root.findByProps({ "data-testid": "composer-model-button" });
  const rows = () => renderer.root.findAllByProps({ role: "menuitem" })
    .filter((row: { props: Record<string, unknown> }) => row.props["data-model-result"] !== undefined);
  const selected = () => rows().filter((row: { props: Record<string, unknown> }) => row.props["data-selected"] === true);
  function unchanged() {
    assert.equal(storage.getItem(key), initial, "Display and search must not rewrite the persisted local choice");
    assert.deepEqual(writes, [], "Display and search must not write model choice, agent, or configuration state");
    assert.deepEqual(actions, [], "Opening/searching must not select, configure, invoke a provider, or change agents");
    const value = renderer.root.findByType(modelPicker.ModelPicker).props.value;
    assert.deepEqual({ ...value }, choice, "The actual picker must retain exact explicit model, agent, effort, and fast identity");
  }
  return {
    buttonLabel: () => visibleText(button()).replace(/\s+/g, " ").trim(),
    accessible: () => button().props["aria-label"],
    async open() { await act(async () => button().props.onClick()); },
    selectedLabel() {
      assert.equal(selected().length, 1, "Exactly one current row remains checked without a catalog entry");
      return visibleText(selected()[0].findByProps({ className: "oc-model-item-name" }));
    },
    async query(value: string) {
      await act(async () => renderer.root.findByProps({ "aria-label": "Search models" }).props.onChange({ target: { value } }));
      assert.equal(renderer.root.findByProps({ "aria-label": "Search models" }).props.value, value);
      unchanged();
    },
    async refresh(models: ReasonModelOption[]) { await act(async () => { resolveCatalog(models); await catalog; }); },
    unchanged,
    async close() {
      try { unchanged(); }
      finally { await act(async () => renderer.unmount()); }
    },
  };
}

const cases: { name: string; choice: ModelChoice; expected: string }[] = [
  { name: "known canonical Claude model", choice: { agent: "claude", model: "opus-4-8", effort: "high" }, expected: "Opus 4.8" },
  { name: "known Claude alias without rewriting its identity", choice: { agent: "claude", model: "opus", effort: "medium" }, expected: "Opus 4.8" },
  { name: "supported omitted Codex model control", choice: { agent: "codex", model: "gpt-5.2-codex", effort: "high" }, expected: "GPT-5.2 Codex" },
  { name: "unknown-local extension control, not original parity", choice: { agent: "claude", model: "future-claude", effort: "adaptive" }, expected: "future-claude" },
];

for (const { name, choice, expected } of cases) {
  test(`real chat picker uses the friendly label for ${name}`, async (t) => {
    const view = await fixture(choice);
    t.after(() => view.close());
    view.unchanged();
    assert.ok(view.buttonLabel().includes(expected), `Collapsed chip must show ${expected}; got ${view.buttonLabel()}`);
    assert.ok(view.accessible().includes(expected), `Accessible chip name must include ${expected}`);
    await view.open();
    assert.equal(view.selectedLabel(), expected);
    view.unchanged();
  });
}

test("nonfavorite local current model keeps its label and identity across catalog refresh and both searches", async (t) => {
  const choice: ModelChoice = { agent: "claude", model: "opus-4-8", effort: "high", fast: true };
  const view = await fixture(choice);
  t.after(() => view.close());
  await view.open();
  assert.equal(view.selectedLabel(), "Opus 4.8");
  await view.refresh([{ value: "openai/unrelated-model", name: "Unrelated offered model" }]);
  assert.equal(view.selectedLabel(), "Opus 4.8");
  for (const query of ["Opus 4.8", "opus-4-8", ""]) {
    await view.query(query);
    assert.equal(view.selectedLabel(), "Opus 4.8");
  }
  assert.ok(view.accessible().includes("Fast"));
  view.unchanged();
});
