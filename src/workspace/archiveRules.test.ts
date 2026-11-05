import { test } from "node:test";
import assert from "node:assert/strict";
import type { DbWorkspaceRow } from "../state/persisted.ts";
import {
  ARCHIVE_DIALOG,
  ARCHIVE_FILTER_TEXT,
  GIT_OPERATION_WARNING,
  afterArchiveError,
  archivedFromRows,
  matchesArchiveFilter,
  toArchiveError,
} from "./archiveRules.ts";

test("copy matches Conductor's archive dialog, warning and filter labels", () => {
  assert.deepEqual(ARCHIVE_DIALOG, {
    title: "Archive workspace?",
    description: "Agents are still running in this workspace. Archiving will stop them and end any in-progress work.",
    cancelLabel: "Cancel",
    confirmLabel: "Stop agents and archive",
  });
  assert.equal(GIT_OPERATION_WARNING, "Because a Git operation (merge, rebase, cherry-pick, or revert) is in progress, archiving may lose some of your work.");
  assert.deepEqual(Object.values(ARCHIVE_FILTER_TEXT), ["Hiding archived", "Showing all", "Only archived"]);
});

test("a git operation in a safe archive asks to archive anyway; a retry or other failure is an error", () => {
  const busy = toArchiveError({ code: "gitBusy", message: "Conductor can't safely archive this workspace because a Git operation is in progress." });
  assert.deepEqual(afterArchiveError(busy, "safe"), { kind: "confirmDiscard" });
  assert.deepEqual(afterArchiveError(busy, "discardGitOperationState"), { kind: "error", message: busy.message });
  assert.deepEqual(afterArchiveError(toArchiveError(new Error("boom")), "safe"), { kind: "error", message: "boom" });
  assert.deepEqual(toArchiveError("plain"), { code: "failed", message: "plain" });
});

test("archive filter: hiding archived, showing all, only archived", () => {
  assert.deepEqual([false, true].map((a) => matchesArchiveFilter(a, "active")), [true, false]);
  assert.deepEqual([false, true].map((a) => matchesArchiveFilter(a, "all")), [true, true]);
  assert.deepEqual([false, true].map((a) => matchesArchiveFilter(a, "archived")), [false, true]);
});

test("archived rows of db_list_workspaces, newest first", () => {
  const row = (id: string, state: string, createdAt: string): DbWorkspaceRow => ({
    id,
    repositoryId: "app",
    directoryName: id.split("/")[1],
    workspaceName: null,
    branch: `b-${id}`,
    placeholderBranchName: null,
    state,
    derivedStatus: null,
    manualStatus: null,
    workspacePath: null,
    pinnedAt: null,
    unread: false,
    number: null,
    prTitle: null,
    prDescription: null,
    createdAt,
  });
  const out = archivedFromRows([row("app/a", "archived", "2026-11-01 10:00:00"), row("app/b", "ready", "2026-11-02 10:00:00"), row("app/c", "archived", "2026-11-03T10:00:00Z")]);
  assert.deepEqual(out.map((w) => [w.id, w.name]), [["app/c", "c"], ["app/a", "a"]]);
  assert.equal(out[1].createdAt, Date.parse("2026-11-01T10:00:00Z"));
});
