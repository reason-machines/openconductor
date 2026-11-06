import { test } from "node:test";
import assert from "node:assert/strict";
import type { Repo, Workspace } from "../state/types.ts";
import {
  COLUMN_PAGE,
  agoTime,
  boardCards,
  columnPage,
  dashboardPath,
  dashboardRepoParam,
  dropTarget,
  groupBoard,
  livePending,
  projectTabs,
  pullRequestUrl,
  selectedProject,
  showsPrRow,
} from "./dashboard.ts";

const ws = (id: string, over: Partial<Workspace> = {}): Workspace => ({
  id,
  name: id,
  branch: `b/${id}`,
  status: "idle",
  diff: { added: 0, removed: 0 },
  createdAt: 1000,
  ...over,
});
const repo = (id: string, workspaces: Workspace[], name = id): Repo => ({ id, name, path: `/src/${id}`, defaultBranch: "main", workspaces });

test("the board lists every non-archived workspace, newest activity first", () => {
  const repos = [
    repo("a", [ws("a1", { createdAt: 10 }), ws("a2", { createdAt: 5, updatedAt: 50 }), ws("gone", { status: "archived" })]),
    repo("b", [ws("b1", { createdAt: 30 }), ws("b2", { state: "archived" })]),
  ];
  assert.deepEqual(boardCards(repos, undefined).map((c) => c.workspace.id), ["a2", "b1", "a1"]);
});

test("?repo= narrows the board by the raw value, so an unknown project shows no cards", () => {
  const repos = [repo("a", [ws("a1")]), repo("b", [ws("b1")])];
  assert.deepEqual(boardCards(repos, "b").map((c) => c.workspace.id), ["b1"]);
  assert.deepEqual(boardCards(repos, "nope"), []);
});

test("cards sit in the column of their effective status; derived in-progress by default", () => {
  const repos = [repo("a", [ws("m", { manualStatus: "backlog", derivedStatus: "in-review" }), ws("d", { derivedStatus: "done" }), ws("n")])];
  const board = groupBoard(boardCards(repos, undefined));
  assert.deepEqual(Object.keys(board), ["backlog", "in-progress", "in-review", "done", "canceled"]);
  assert.deepEqual(board.backlog.map((c) => c.workspace.id), ["m"]);
  assert.deepEqual(board.done.map((c) => c.workspace.id), ["d"]);
  assert.deepEqual(board["in-progress"].map((c) => c.workspace.id), ["n"]);
});

test("a drag shows in its new column until the stored status catches up", () => {
  const cards = boardCards([repo("a", [ws("x")])], undefined);
  const pending = { workspaceId: "x", status: "done" as const };
  assert.deepEqual(groupBoard(cards, pending).done.map((c) => c.status), ["done"]);
  assert.equal(groupBoard(cards, pending)["in-progress"].length, 0);
  assert.equal(livePending(cards, pending), pending);
  const saved = boardCards([repo("a", [ws("x", { manualStatus: "done" })])], undefined);
  assert.equal(livePending(saved, pending), undefined);
});

test("dropping on the column the card shows in, or off the board, changes nothing", () => {
  const [card] = boardCards([repo("a", [ws("x")])], undefined);
  assert.equal(dropTarget(card, undefined, "in-progress"), undefined);
  assert.equal(dropTarget(card, undefined, "not-a-column"), undefined);
  assert.equal(dropTarget(card, undefined, "in-review"), "in-review");
  assert.equal(dropTarget(card, { workspaceId: "x", status: "done" }, "done"), undefined);
  assert.equal(dropTarget(undefined, undefined, "done"), undefined);
});

test("a column shows ten cards until it is expanded", () => {
  const items = Array.from({ length: 13 }, (_, i) => i);
  assert.equal(COLUMN_PAGE, 10);
  assert.deepEqual(columnPage(items, false), { shown: items.slice(0, 10), hidden: 3 });
  assert.deepEqual(columnPage(items, true), { shown: items, hidden: 0 });
  assert.deepEqual(columnPage(items.slice(0, 10), false).hidden, 0);
});

test("the selected project tab: listed ?repo=, none for an unknown one, the only project otherwise", () => {
  const two = [{ id: "a" }, { id: "b" }];
  assert.equal(selectedProject(two, "b"), "b");
  assert.equal(selectedProject(two, "zzz"), undefined);
  assert.equal(selectedProject(two, undefined), undefined);
  assert.equal(selectedProject([{ id: "a" }], undefined), "a");
});

test("project tabs: hidden with one project, five tabs, the rest under More (named when active)", () => {
  const repos = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, name: `Repo ${i}` }));
  assert.equal(projectTabs(repos.slice(0, 1), undefined).show, false);
  const t = projectTabs(repos, "r6");
  assert.equal(t.show, true);
  assert.deepEqual(t.tabs.map((r) => r.id), ["r0", "r1", "r2", "r3", "r4"]);
  assert.deepEqual(t.more.map((r) => r.id), ["r5", "r6"]);
  assert.equal(t.moreLabel, "Repo 6");
  assert.equal(projectTabs(repos, "r1").moreLabel, "More");
});

test("card times read like Conductor's SS", () => {
  const now = Date.UTC(2026, 0, 31, 12);
  assert.equal(agoTime(now - 10_000, now), "just now");
  assert.equal(agoTime(now - 5 * 60_000, now), "5m ago");
  assert.equal(agoTime(now - 3 * 3_600_000, now), "3h ago");
  assert.equal(agoTime(now - 2 * 86_400_000, now), "2d ago");
  assert.equal(agoTime(now + 60_000, now), "just now", "a future time reads as now");
});

test("the PR row needs a pull request or changed files", () => {
  assert.equal(showsPrRow({ pr: null, diff: { added: 0, removed: 0 } }), false);
  assert.equal(showsPrRow({ pr: null, diff: { added: 0, removed: 2 } }), true);
});

test("PR links come from GitHub remotes", () => {
  assert.equal(pullRequestUrl("https://github.com/acme/web.git", 7), "https://github.com/acme/web/pull/7");
  assert.equal(pullRequestUrl("git@github.com:acme/web.git", 7), "https://github.com/acme/web/pull/7");
  assert.equal(pullRequestUrl("https://gitlab.com/acme/web", 7), undefined);
  assert.equal(pullRequestUrl(undefined, 7), undefined);
});

test("/dashboard?repo= round-trips", () => {
  assert.equal(dashboardPath(undefined), "/dashboard");
  assert.equal(dashboardRepoParam(dashboardPath("r 1").split("?")[1]), "r 1");
  assert.equal(dashboardRepoParam(""), undefined);
});
