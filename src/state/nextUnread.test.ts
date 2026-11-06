import { test } from "node:test";
import assert from "node:assert/strict";
import { byRecentUpdate, nextUnreadChat, openNextUnread, pickNextUnread, withActivity } from "./nextUnread.ts";
import { setOpenReviewChats, takeChatRequest } from "./openChat.ts";
import type { Action } from "./store.ts";
import type { AppState, Workspace } from "./types.ts";

const ws = (id: string, createdAt: number, extra: Partial<Workspace> = {}): Workspace => ({
  id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt, ...extra,
});

const stateWith = (workspaces: Record<string, Workspace[]>, selection: AppState["selection"] = { kind: "home" }): AppState => ({
  selection,
  repos: Object.entries(workspaces).map(([id, list]) => ({ id, name: id, path: `/${id}`, defaultBranch: "main", workspaces: list })),
});

const chats = (...list: [id: string, at: number][]) => ({ unreadChats: list.map(([id, at]) => ({ id, at })) });

const pick = (state: AppState, skipSelected = true, selectedChatId?: string) => nextUnreadChat(state, { skipSelected, selectedChatId })?.chatId;

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

test("picks the most recently changed unread chat across workspaces, not the first in sidebar order", () => {
  setOpenReviewChats("old", ["old:review:1"]);
  const state = stateWith({
    a: [ws("old", 1, { ...chats(["old", 10], ["old:review:1", 60]), updatedAt: 10, pinnedAt: 99 }), ws("read", 2, { updatedAt: 50 })],
    b: [ws("fresh", 3, { ...chats(["fresh", 40]), updatedAt: 40 })],
  });
  assert.equal(pick(state), "old:review:1", "a review chat of a quiet workspace can come first");
  setOpenReviewChats("old", []);
  assert.equal(pick(state), "fresh", "a review chat without a tab counts as hidden");
});

test("skips archived workspaces, and gives nothing when no chat is unread", () => {
  const state = stateWith({ a: [ws("gone", 1, { ...chats(["gone", 90]), status: "archived" }), ws("live", 2, chats(["live", 5]))] });
  assert.equal(pick(state), "live");
  assert.equal(pick(stateWith({ a: [ws("x", 1), ws("y", 2, { status: "archived", ...chats(["y", 1]) })] })), undefined);
});

test("the keyboard path skips the selected chat, not its workspace; the palette path keeps it", () => {
  const sel = { kind: "workspace", repoId: "a", workspaceId: "open" } as const;
  setOpenReviewChats("open", ["open:review:1"]);
  const state = stateWith({ a: [ws("open", 1, chats(["open", 9], ["open:review:1", 3]))] }, sel);
  assert.equal(pick(state, true), "open:review:1", "the open workspace's other chat is next");
  assert.equal(pick(state, false), "open", "the palette keeps the open chat");
  assert.equal(pick(state, true, "open:review:1"), "open", "with the review tab selected, the main chat is next");
  const only = stateWith({ a: [ws("open", 1, chats(["open", 9]))] }, sel);
  assert.equal(pick(only, true), undefined, "never wraps back to the open chat");
  setOpenReviewChats("open", []);
});

test("collapsed repos still count: Conductor filters only hidden chats and archived workspaces", () => {
  const state = stateWith({ a: [ws("x", 1, chats(["x", 1]))] });
  state.repos[0].collapsed = true;
  assert.equal(pick(state), "x");
});

test("opening the pick selects its workspace, asks for the chat's tab and marks only that chat read", () => {
  setOpenReviewChats("b1", ["b1:review:1"]);
  const state = stateWith({ a: [ws("a1", 1, chats(["a1", 5]))], b: [ws("b1", 2, chats(["b1", 1], ["b1:review:1", 8]))] }, { kind: "workspace", repoId: "a", workspaceId: "a1" });
  const actions: Action[] = [];
  assert.equal(openNextUnread(state, (a) => actions.push(a), { skipSelected: true }), true);
  assert.deepEqual(actions.map((a) => a.type), ["select", "setChatUnread"]);
  assert.deepEqual(actions[0], { type: "select", selection: { kind: "workspace", repoId: "b", workspaceId: "b1" } });
  const read = actions[1] as Extract<Action, { type: "setChatUnread" }>;
  assert.deepEqual([read.workspaceId, read.chatId, read.unread], ["b1", "b1:review:1", false]);
  assert.equal(takeChatRequest("b1"), "b1:review:1", "the workspace view opens the review tab");

  // In the open workspace it only switches the tab (navigateToSession).
  const same = stateWith({ b: [ws("b1", 2, chats(["b1", 1], ["b1:review:1", 8]))] }, { kind: "workspace", repoId: "b", workspaceId: "b1" });
  actions.length = 0;
  openNextUnread(same, (a) => actions.push(a), { skipSelected: true });
  assert.deepEqual(actions.map((a) => a.type), ["setChatUnread"]);
  assert.equal(takeChatRequest("b1"), "b1:review:1");
  setOpenReviewChats("b1", []);
  assert.equal(openNextUnread(stateWith({ a: [ws("x", 1)] }), () => assert.fail("nothing to open"), { skipSelected: true }), false);
});

test("pickNextUnread works on any unread-flagged list", () => {
  const chats = [
    { id: "c1", createdAt: 1, updatedAt: 3, unread: true },
    { id: "c2", createdAt: 1, updatedAt: 8, unread: false },
    { id: "c3", createdAt: 1, updatedAt: 6, unread: true },
  ];
  assert.equal(pickNextUnread(chats)?.id, "c3");
  assert.equal(pickNextUnread(chats, "c3")?.id, "c1");
});

test("a sent message moves its workspace's activity forward, never back", () => {
  const older = ws("older", 100);
  const sent = withActivity(older, 300);
  assert.equal(sent.updatedAt, 300);
  assert.equal(withActivity(sent, 250), sent);
});
