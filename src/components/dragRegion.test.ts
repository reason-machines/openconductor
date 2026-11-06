// Run: node --test "src/**/*.test.ts"
//
// The window drag regions across the top of the window: the sidebar header and the
// workspace header drag the window from anywhere inside them except their buttons and
// menus. Tauri does the dragging in its injected drag.js (tauri 2.12.5,
// src/window/scripts/drag.js); `isDragRegion` below is that function's rule, so these
// tests pin how our markup behaves under it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type El = { tagName: string; attrs: Record<string, string> };
const el = (tagName: string, attrs: Record<string, string> = {}): El => ({ tagName: tagName.toUpperCase(), attrs });

const CLICKABLE_TAGS = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL", "SUMMARY"]);
const INTERACTIVE_ROLES = new Set(["button", "link", "menuitem", "tab", "checkbox", "radio", "switch", "option"]);
const attr = (e: El, name: string) => (name in e.attrs ? e.attrs[name] : null);
const isClickable = (e: El) =>
  CLICKABLE_TAGS.has(e.tagName) ||
  (attr(e, "contenteditable") !== null && attr(e, "contenteditable") !== "false") ||
  (attr(e, "tabindex") !== null && attr(e, "tabindex") !== "-1") ||
  INTERACTIVE_ROLES.has(attr(e, "role") ?? "");

/** tauri 2.12.5 drag.js `isDragRegion`; `path` runs from the clicked element up to the root. */
function isDragRegion(path: El[]): boolean {
  for (const e of path) {
    const a = attr(e, "data-tauri-drag-region");
    if (isClickable(e) && a === null) return false;
    if (a === null) continue;
    if (a === "false") return false;
    if (a === "deep") return true;
    if (a === "" || a === "true") return e === path[0];
  }
  return false;
}

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the window may start dragging: start_dragging is granted (core:default leaves it out)", () => {
  const cap = JSON.parse(read("src-tauri/capabilities/default.json")) as { windows: string[]; permissions: unknown[] };
  assert.ok(cap.windows.includes("main"));
  assert.ok(cap.permissions.includes("core:window:allow-start-dragging"));
});

test("sidebar header and workspace headers are deep drag regions; their inline menus opt out", () => {
  assert.match(read("src/components/Sidebar.tsx"), /<div className="sb-header" data-tauri-drag-region="deep">/);
  assert.match(read("src/components/WorkspaceView.tsx"), /<header className="ws-header" data-tauri-drag-region="deep">/);
  assert.match(read("src/components/ArchivedWorkspaceView.tsx"), /<header className="ws-header" data-tauri-drag-region="deep">/);
  // Popovers rendered inside those headers (not portalled) must not drag the window.
  for (const [file, cls] of [
    ["src/components/AccountMenu.tsx", "sb-account-menu"],
    ["src/features/openIn/OpenInButton.tsx", "oi-menu"],
    ["src/features/pr/PrControl.tsx", "pr-menu"],
    ["src/features/pr/edit/BranchPicker.tsx", "pr-base-picker"],
  ]) {
    assert.match(read(file), new RegExp(`className="${cls}"[^>]*data-tauri-drag-region="false"`), `${cls} in ${file}`);
  }
});

// The workspace header as rendered by WorkspaceView.
const root = [el("main"), el("div", { class: "app" }), el("body"), el("html")];
const header = el("header", { class: "ws-header", "data-tauri-drag-region": "deep" });
const title = el("div", { class: "ws-title" });
const actions = el("div", { class: "ws-actions" });

test("clicking the header's padding (the title-bar strip), its title text or a chip drags", () => {
  assert.equal(isDragRegion([header, ...root]), true);
  assert.equal(isDragRegion([el("strong"), title, header, ...root]), true);
  assert.equal(isDragRegion([el("span", { class: "chip" }), title, header, ...root]), true);
  assert.equal(isDragRegion([actions, header, ...root]), true);
});

test("buttons in the header, and anything inside them, do not drag", () => {
  const archive = el("button", { class: "btn btn-small" });
  assert.equal(isDragRegion([archive, actions, header, ...root]), false);
  assert.equal(isDragRegion([el("svg"), archive, actions, header, ...root]), false);
  const target = el("button", { class: "chip" });
  assert.equal(isDragRegion([target, el("span", { class: "target-chip" }), title, header, ...root]), false);
});

test("an open menu or picker inside the header does not drag, even off its items", () => {
  const picker = el("div", { class: "pr-base-picker", role: "dialog", "data-tauri-drag-region": "false" });
  assert.equal(isDragRegion([picker, el("span", { class: "target-chip" }), title, header, ...root]), false);
  assert.equal(isDragRegion([el("li"), el("ul"), picker, title, header, ...root]), false);
  const menu = el("div", { class: "oi-menu", role: "menu", "data-tauri-drag-region": "false" });
  assert.equal(isDragRegion([el("div", { class: "oi-menu-note" }), menu, actions, header, ...root]), false);
});

test("sidebar header: the top bar and the gaps drag; the toggle, back/forward and nav rows don't", () => {
  const sbHeader = el("div", { class: "sb-header", "data-tauri-drag-region": "deep" });
  const aside = el("aside", { class: "sidebar" });
  const topbar = el("div", { class: "sb-topbar" });
  const history = el("div", { class: "sb-history" });
  assert.equal(isDragRegion([topbar, sbHeader, aside, ...root]), true);
  assert.equal(isDragRegion([history, sbHeader, aside, ...root]), true);
  assert.equal(isDragRegion([el("div", { class: "sb-primary" }), sbHeader, aside, ...root]), true);
  assert.equal(isDragRegion([el("button", { class: "sb-toggle" }), topbar, sbHeader, aside, ...root]), false);
  assert.equal(isDragRegion([el("button", { class: "sb-icon-btn" }), history, sbHeader, aside, ...root]), false);
  assert.equal(isDragRegion([el("span"), el("button", { class: "sb-nav-row" }), el("div", { class: "sb-primary" }), sbHeader, aside, ...root]), false);
});

test("below the headers nothing drags", () => {
  assert.equal(isDragRegion([el("div", { class: "chat-scroll" }), el("section"), el("div", { class: "ws-split" }), el("div", { class: "workspace" }), ...root]), false);
});
