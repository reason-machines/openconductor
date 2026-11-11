import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

type HostStyle = { dataset: Record<string, string>; textContent: string };

function browserHost(zoom = 1) {
  const styles: HostStyle[] = [];
  const values = new Map<string, string>();
  const window: {
    isTauri?: boolean;
    __fake?: { calls: unknown[]; unmocked: string[] };
    __TAURI_INTERNALS__?: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
  } = {};
  const source = readFileSync("tests/e2e/right-panel-fixture.mjs", "utf8");
  const install = runInNewContext(`${source.replace(/^export /gm, "")}\nfakeBackend;`, {
    window,
    localStorage: { setItem: (key: string, value: string) => values.set(key, value) },
    document: {
      querySelector(selector: string) {
        assert.equal(selector, "style[data-fake-webview-zoom]");
        return styles[0] ?? null;
      },
      createElement(tag: string) {
        assert.equal(tag, "style");
        return { dataset: {}, textContent: "" };
      },
      head: { append: (style: HostStyle) => styles.push(style) },
    },
    structuredClone,
  });
  assert.equal(typeof install, "function");
  install({ shell: { repos: [], selection: null }, files: [], zoom });
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  assert.ok(invoke);
  return { window, styles, invoke };
}

test("the browser fake applies acknowledged native zoom outside product inline CSS", async () => {
  const host = browserHost(0.8);
  assert.equal(host.window.isTauri, true);
  assert.equal(host.styles.length, 0, "loading preferences must not pre-apply or mask missing native calls");
  for (const value of [0.8, 1, 1.2]) {
    await host.invoke("plugin:webview|set_webview_zoom", { label: "main", value });
    assert.equal(host.styles.length, 1, "reuse one test-host stylesheet across zoom and reset");
    assert.equal(host.styles[0].textContent, `html { zoom: ${value}; }`);
    assert.equal(host.styles[0].dataset.fakeWebviewZoom, "");
  }
  assert.equal(JSON.stringify(host.window.__fake?.calls), JSON.stringify([
    { cmd: "plugin:webview|set_webview_zoom", label: "main", value: 0.8 },
    { cmd: "plugin:webview|set_webview_zoom", label: "main", value: 1 },
    { cmd: "plugin:webview|set_webview_zoom", label: "main", value: 1.2 },
  ]));
});

test("the fake rejects invalid webview zoom requests without changing acknowledged host geometry", async () => {
  const host = browserHost();
  await host.invoke("plugin:webview|set_webview_zoom", { label: "main", value: 0.8 });
  for (const args of [
    { label: "other", value: 1.2 },
    { label: "main", value: 0 },
    { label: "main", value: Number.NaN },
    { label: "main", value: Number.POSITIVE_INFINITY },
    { label: "main", value: "1.2" },
  ]) {
    await assert.rejects(host.invoke("plugin:webview|set_webview_zoom", args), /invalid fake webview zoom/);
    assert.equal(host.styles[0].textContent, "html { zoom: 0.8; }");
    assert.equal(host.styles.length, 1);
  }
});

test("settings reads and unsupported native commands cannot substitute successful host zoom", async () => {
  const host = browserHost(0.8);
  const settings = await host.invoke("get_settings");
  assert.equal(JSON.stringify(settings).includes('"zoom_level_v2":0.8'), true);
  assert.equal(host.styles.length, 0);
  await assert.rejects(host.invoke("plugin:webview|unknown"), /is not mocked/);
  assert.equal(host.styles.length, 0);
  assert.equal(JSON.stringify(host.window.__fake?.unmocked), '["plugin:webview|unknown"]');
});
