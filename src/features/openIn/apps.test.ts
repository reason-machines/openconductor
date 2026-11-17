import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultAppId, rowNumbers, supportsFileOpen, type OpenInApp } from "./apps.ts";

const app = (id: string): OpenInApp => ({ id, name: id, iconType: "code", icon: null });
// Sven's Mac, in catalog order.
const SVEN = ["finder", "cursor", "vscode", "zed", "xcode", "ghostty", "terminal"].map(app);

test("the button opens the saved app when it is offered, else the first", () => {
  assert.equal(defaultAppId(SVEN, null), "finder");
  assert.equal(defaultAppId(SVEN, "zed"), "zed");
  assert.equal(defaultAppId(SVEN, "warp"), "finder");
  assert.equal(defaultAppId([], "zed"), undefined);
});

test("apps are numbered 1.. and Copy path takes the next number", () => {
  assert.deepEqual(rowNumbers(SVEN.length), { apps: [1, 2, 3, 4, 5, 6, 7], copyPath: 8 });
  assert.deepEqual(rowNumbers(0), { apps: [], copyPath: 1 });
});

test("only the first nine rows get a number", () => {
  assert.deepEqual(rowNumbers(9), { apps: [1, 2, 3, 4, 5, 6, 7, 8, 9], copyPath: undefined });
  assert.deepEqual(rowNumbers(11).apps.slice(8), [9, undefined, undefined]);
});

test("a file opens in editors and Finder, not in terminals or git clients (Conductor's supportsFileOpen)", () => {
  for (const id of ["finder", "cursor", "vscode", "zed", "xcode"]) assert.equal(supportsFileOpen(id), true, id);
  for (const id of ["terminal", "iterm", "ghostty", "warp", "github-desktop", "fork"]) assert.equal(supportsFileOpen(id), false, id);
});

// GAP-OPEN-01: confirm every catalog entry returns the correct supportsFileOpen value.
// Catalog has 37 apps (Conductor 0.87.6 REA, sX); Windsurf is absent from that evidence.
test("supportsFileOpen covers every catalog entry — all code editors true, all folder/terminal apps false", () => {
  // All Code-type apps (IconType::Code in mod.rs) support file open.
  const editors = [
    // Primary editors
    "cursor", "vscode", "vscode-short", "zed", "zed-preview", "zed-nightly",
    "vscodium", "devin", "sublime", "xcode",
    // JetBrains
    "pycharm", "pycharm-ce", "intellij", "intellij-ce", "intellij-ultimate",
    "intellij-community", "android-studio", "rider", "rubymine", "webstorm",
    "phpstorm", "goland", "datagrip",
    // Newer additions
    "trae", "antigravity",
  ];
  for (const id of editors) assert.equal(supportsFileOpen(id), true, `${id} should support file open`);

  // Finder is always offered and reveals the file in Finder (folder open by the backend); treated as
  // supporting file open in the frontend — the file menu submenu includes it (Conductor's `pLr`).
  assert.equal(supportsFileOpen("finder"), true, "finder should support file open (reveals file in Finder)");

  // Terminal apps: IconType::Terminal — folder only, no file-level open.
  const terminals = ["ghostty", "alacritty", "iterm", "wezterm", "warp", "hyper", "terminal"];
  for (const id of terminals) assert.equal(supportsFileOpen(id), false, `${id} should not support file open`);

  // Git/diff clients: IconType::Folder — folder only.
  const gitClients = ["github-desktop", "sourcetree", "fork", "kaleidoscope"];
  for (const id of gitClients) assert.equal(supportsFileOpen(id), false, `${id} should not support file open`);
});
