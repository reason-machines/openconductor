import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MENU_WIDTH,
  displayRecentPath,
  menuPosition,
  nextMenuIndex,
  normalizeRecentRepos,
  recentsNotAdded,
  showRecents,
} from "./addRepositoryMenuModel.ts";
import type { Repo } from "../state/types";

const repo = (path: string): Repo => ({ id: path, name: path, path, defaultBranch: "main", workspaces: [] });

test("recent paths are trimmed, lose trailing slashes and repeats, keep order", () => {
  assert.deepEqual(normalizeRecentRepos([" /a/b/ ", "", "/c", "/a/b", "/d//"]), [{ path: "/a/b" }, { path: "/c" }, { path: "/d" }]);
});

test("folders that are already projects are left out of Recents", () => {
  const recents = normalizeRecentRepos(["/u/code/app", "/u/code/api", "/u/code/web"]);
  assert.deepEqual(recentsNotAdded(recents, [repo("/u/code/api"), repo("")]), [{ path: "/u/code/app" }, { path: "/u/code/web" }]);
});

test("the /Users/<name> prefix shows as ~", () => {
  assert.equal(displayRecentPath("/Users/sven/code/openconductor"), "~/code/openconductor");
  assert.equal(displayRecentPath("/home/sven/code/x"), "/home/sven/code/x");
  assert.equal(displayRecentPath("/Users/sven"), "~");
});

test("Recents shows while loading or when there is something to show", () => {
  assert.equal(showRecents(true, []), true);
  assert.equal(showRecents(false, []), false);
  assert.equal(showRecents(false, [{ path: "/a" }]), true);
});

test("arrow keys wrap through the items; other keys and outside focus do nothing", () => {
  assert.equal(nextMenuIndex("ArrowDown", 0, 3), 1);
  assert.equal(nextMenuIndex("ArrowDown", 2, 3), 0);
  assert.equal(nextMenuIndex("ArrowUp", 0, 3), 2);
  assert.equal(nextMenuIndex("ArrowUp", -1, 3), null);
  assert.equal(nextMenuIndex("Tab", 0, 3), null);
  assert.equal(nextMenuIndex("ArrowDown", 0, 0), null);
});

test("the popover hangs below its anchor with its right edge on it, shifted into the window", () => {
  const view = { width: 1440, height: 900 };
  assert.deepEqual(menuPosition({ x: 600, y: 200 }, { width: MENU_WIDTH, height: 180 }, view), { left: 280, top: 204, side: "bottom" });
  // A narrow sidebar: the menu would start left of the window, so it shifts right.
  assert.deepEqual(menuPosition({ x: 232, y: 200 }, { width: MENU_WIDTH, height: 180 }, view).left, 5);
  // No room below: flip above.
  assert.deepEqual(menuPosition({ x: 600, y: 800 }, { width: MENU_WIDTH, height: 180 }, view), { left: 280, top: 616, side: "top" });
});
