import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The window moves when a press lands on a data-tauri-drag-region element. Tauri's injected
// drag script then invokes plugin:window|start_dragging, which core:window:default (Tauri 2.12)
// does not grant, so without this permission every drag is denied by the ACL.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the main window may start a window drag", () => {
  const capability = JSON.parse(read("../../src-tauri/capabilities/default.json")) as { windows: string[]; permissions: unknown[] };
  assert.ok(capability.windows.includes("main"));
  assert.ok(capability.permissions.includes("core:window:allow-start-dragging"));
});

// Tauri 2.12 semantics: a bare attribute drags only on direct hits, "deep" drags anywhere in the
// subtree, "false" opts a subtree out; buttons, links and menu items never drag.
test("the sidebar header and the workspace header are drag regions", () => {
  const sidebar = read("./Sidebar.tsx");
  assert.match(sidebar, /className="sb-topbar" data-tauri-drag-region>/);
  assert.match(sidebar, /className="sb-history" data-tauri-drag-region>/);
  for (const file of ["./WorkspaceView.tsx", "./ArchivedWorkspaceView.tsx"]) {
    const src = read(file);
    assert.match(src, /className="ws-header" data-tauri-drag-region>/, file);
    assert.match(src, /className="ws-title" data-tauri-drag-region="deep">/, file);
    assert.match(src, /className="ws-actions" data-tauri-drag-region>/, file);
  }
  // The target-branch picker opens inside the title; its rows must not move the window.
  assert.match(read("./WorkspaceView.tsx"), /className="pr-base-anchor target-chip" data-tauri-drag-region="false">/);
});
