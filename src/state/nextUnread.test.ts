import { test } from "node:test";
import assert from "node:assert/strict";
import { byRecentUpdate, nextUnreadWorkspace, pickNextUnread, withActivity } from "./nextUnread.ts";
import type { AppState, Workspace } from "./types.ts";

const ws = (id: string, createdAt: number, extra: Partial<Workspace> = {}): Workspace => ({
  id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt, ...extra,
});

const stateWith = (workspaces: Record<string, Workspace[]>, selection: AppState["selection"] = { kind: "home" }): AppState => ({
  selection,
  repos: Object.entries(workspaces).map(([id, list]) => ({ id, name: id, path: `/${id}`, defaultBranch: "main", workspaces: list })),
});

const pickId = (state: AppState, skipSelected = true) => nextUnreadWorkspace(state, { skipSelected })?.workspace.id;

test("orders like Conductor's Qre: updatedAt desc, then createdAt desc, then id", () => {
  const items = [
    { id: "b", createdAt: 1, updatedAt: 5 },
    { id: "a", createdAt: 1, updatedAt: 5 },
    { id: "c", createdAt: 2, updatedAt: 5 },
    { id: "d", createdAt: 9 },
    { id: "e", createdAt: 1, updatedAt: 7 },
  ];
  assert.deepEqual([...items].sort(byRecentUpdate).map((i) => i.id), ["d", "e", "c", "a", "b"]);
});

test("picks the most recently updated unread one, not the first in sidebar order", () => {
  const state = stateWith({
    a: [ws("old", 1, { unread: true, updatedAt: 10, pinnedAt: 99 }), ws("read", 2, { updatedAt: 50 })],
    b: [ws("fresh", 3, { unread: true, updatedAt: 40 })],
  });
  assert.equal(pickId(state), "fresh");
});

test("skips archived workspaces, and gives nothing when no workspace is unread", () => {
  const state = stateWith({ a: [ws("gone", 1, { unread: true, updatedAt: 90, status: "archived" }), ws("live", 2, { unread: true, updatedAt: 5 })] });
  assert.equal(pickId(state), "live");
  assert.equal(pickId(stateWith({ a: [ws("x", 1), ws("y", 2, { status: "archived", unread: true })] })), undefined);
});

test("the keyboard path skips the open workspace and never wraps back to it; the palette path keeps it", () => {
  const sel = { kind: "workspace", repoId: "a", workspaceId: "open" } as const;
  const only = stateWith({ a: [ws("open", 1, { unread: true, updatedAt: 9 })] }, sel);
  assert.equal(pickId(only, true), undefined);
  assert.equal(pickId(only, false), "open");
  const two = stateWith({ a: [ws("open", 1, { unread: true, updatedAt: 9 }), ws("other", 2, { unread: true, updatedAt: 1 })] }, sel);
  assert.equal(pickId(two, true), "other");
});

test("collapsed repos still count: Conductor filters only hidden chats and archived workspaces", () => {
  const state = stateWith({ a: [ws("x", 1, { unread: true })] });
  state.repos[0].collapsed = true;
  assert.equal(pickId(state), "x");
});

test("pickNextUnread works on any unread-flagged list (chats once they carry unread)", () => {
  const chats = [
    { id: "c1", createdAt: 1, updatedAt: 3, unread: true },
    { id: "c2", createdAt: 1, updatedAt: 8, unread: false },
    { id: "c3", createdAt: 1, updatedAt: 6, unread: true },
  ];
  assert.equal(pickNextUnread(chats)?.id, "c3");
  assert.equal(pickNextUnread(chats, "c3")?.id, "c1");
});

test("a sent message moves its workspace up the next-unread order, never back", () => {
  const older = ws("older", 100, { unread: true });
  const newer = ws("newer", 200, { unread: true });
  assert.equal(pickId(stateWith({ r: [older, newer] })), "newer");
  const sent = withActivity(older, 300);
  assert.equal(sent.updatedAt, 300);
  assert.equal(pickId(stateWith({ r: [sent, newer] })), "older");
  assert.equal(withActivity(sent, 250), sent);
});
