import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rememberSettings, useSettings } from "../src/settings/useSettings";
import { ReasonTab } from "../src/settings/agents/ReasonTab";
import { DEFAULT_SETTINGS } from "../src/settings/types";

async function check() {
  const initial = structuredClone(DEFAULT_SETTINGS);
  initial.reason = { workspace: "ws-b", model: "fixture-model", reasoning_effort: "high", future_option: "keep" };
  let stored = structuredClone(initial);
  let optimistic = initial;
  const writes = [];
  const root = { dataset: {}, style: { setProperty() {}, removeProperty() {} }, classList: { toggle() {} } };
  globalThis.document = { documentElement: root };
  globalThis.isTauri = true;
  globalThis.window = Object.assign(new EventTarget(), {
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    __TAURI_INTERNALS__: {
      invoke(cmd, args) {
        if (cmd === "get_settings") return Promise.resolve(structuredClone(stored));
        if (cmd === "update_window_vibrancy") return Promise.resolve();
        assert.equal(cmd, "update_settings", "only settings IPC is allowed");
        return new Promise(resolve => writes.push({ next: structuredClone(args.settings), complete() {
          stored = structuredClone(this.next);
          resolve(structuredClone(stored));
        } }));
      },
    },
  });
  rememberSettings(initial);
  let api;
  const controls = new Map();
  // The build wraps the real JSX runtime only to observe host props; React still renders every component.
  globalThis.__captureSettingsSelect = props => controls.set(props["aria-label"], props.onChange);
  const save = next => {
    optimistic = next;
    return api.save(next);
  };
  function Probe() {
    api = useSettings();
    return createElement(ReasonTab, { settings: api.settings, save, reload: api.reload });
  }
  renderToStaticMarkup(createElement(Probe));
  const labels = ["Workspace for new chats", "Default Reason model", "Default Reason effort"];
  const captured = labels.map(label => {
    const handler = controls.get(label);
    assert.equal(typeof handler, "function", label);
    return handler;
  });
  const clear = handler => handler({ target: { value: "" } });
  const drain = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
  const rerenderControls = () => renderToStaticMarkup(createElement(ReasonTab, { settings: optimistic, save, reload: api.reload }));
  const scenario = process.argv[2];
  clear(captured[0]);
  if (scenario === "older-reply") {
    await drain();
    assert.equal(writes.length, 1);
    writes[0].complete();
    await drain();
  }
  if (scenario === "separate-renders") rerenderControls();
  clear(scenario === "separate-renders" ? controls.get(labels[1]) : captured[1]);
  if (scenario === "partial-render" || scenario === "separate-renders") rerenderControls();
  clear(scenario === "partial-render" || scenario === "separate-renders" ? controls.get(labels[2]) : captured[2]);
  await drain();
  const completed = scenario === "older-reply" ? 1 : 0;
  assert.equal(writes.length, completed + 1, "only one pending serialized IPC write");
  for (let i = completed; i < 3; i++) {
    assert.equal(writes.length, i + 1, "later IPC waits for earlier write");
    writes[i].complete();
    await drain();
  }
  console.log(JSON.stringify({ scenario, writes: writes.map(w => w.next.reason), stored: stored.reason }));
  assert.deepEqual(stored.reason, { workspace: null, model: null, reasoning_effort: null, future_option: "keep" }, "all distinct clears persist, including when callbacks share a render snapshot");
  assert.deepEqual(stored.general, initial.general, "unrelated settings survive");
}

check().catch(error => { console.error(error); process.exitCode = 1; });
