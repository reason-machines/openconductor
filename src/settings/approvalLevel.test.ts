import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAppearance } from "./appearance.ts";
import { APPROVAL_LEVELS, approvalLabel, approvalLevel, approvalSourceText, isApprovalLevel, parseChatApprovalLevel, withApprovalLevel } from "./approvalLevel.ts";
import { DEFAULT_SETTINGS, type Settings } from "./types.ts";
import { currentBigTerminal } from "../features/terminal/bigTerminal.ts";

test("the account level is the one picked, else what Conductor's switch means", () => {
  assert.equal(approvalLevel(DEFAULT_SETTINGS), "auto");
  assert.equal(approvalLevel({ tool_approvals_enabled: true }), "approve_all");
  assert.equal(approvalLevel({ tool_approvals_enabled: false }), "auto");
  for (const switchOn of [true, false]) {
    assert.equal(approvalLevel({ claude_approval_level: "approve_prs", tool_approvals_enabled: switchOn }), "approve_prs");
    assert.equal(approvalLevel({ claude_approval_level: "auto", tool_approvals_enabled: switchOn }), "auto");
  }
  // A value from a newer build falls back to the switch.
  assert.equal(approvalLevel({ claude_approval_level: "yolo" as never, tool_approvals_enabled: true }), "approve_all");
  assert.equal(approvalLevel({ claude_approval_level: null }), "auto");
});

test("picking a level keeps Conductor's switch in step and the other settings", () => {
  const s = { ...DEFAULT_SETTINGS, future: 1 } as Settings;
  for (const { value } of APPROVAL_LEVELS) {
    const next = withApprovalLevel(s, value);
    assert.equal(next.claude_approval_level, value);
    assert.equal(next.tool_approvals_enabled, value === "approve_all");
    assert.equal((next as Record<string, unknown>).future, 1);
    assert.equal(approvalLevel(next), value);
  }
  assert.equal(s.claude_approval_level, undefined, "the input is not changed");
});

test("there are three levels, least to most strict, each with its own copy", () => {
  assert.deepEqual(APPROVAL_LEVELS.map((l) => l.value), ["auto", "approve_prs", "approve_all"]);
  assert.deepEqual(APPROVAL_LEVELS.map((l) => l.label), ["Auto", "Approve PRs", "Approve everything"]);
  assert.equal(new Set(APPROVAL_LEVELS.map((l) => l.help)).size, 3);
  assert.equal(approvalLabel("approve_prs"), "Approve PRs");
  assert.ok(isApprovalLevel("approve_all"));
  for (const bad of ["", "default", "bypassPermissions", null, undefined, 1]) assert.ok(!isApprovalLevel(bad));
});

test("a chat's level is read strictly and says where it comes from", () => {
  const chat = parseChatApprovalLevel({ level: "approve_prs", source: "repo", inherited: "approve_prs", extra: true });
  assert.deepEqual(chat, { level: "approve_prs", source: "repo", inherited: "approve_prs" });
  assert.match(approvalSourceText(chat), /Set for this repository\.$/);
  assert.match(approvalSourceText({ ...chat, source: "chat" }), /Set for this chat\.$/);
  assert.match(approvalSourceText({ level: "auto", source: "global", inherited: "auto" }), /^Claude Code runs every tool without asking\. From Settings › Account\.$/);
  for (const bad of [null, {}, { level: "plan", source: "chat", inherited: "auto" }, { level: "auto", source: "team", inherited: "auto" }, { level: "auto", source: "chat" }]) {
    assert.throws(() => parseChatApprovalLevel(bad), /invalid approval level/);
  }
});

test("the big terminal skips approvals only at Auto", () => {
  const g = globalThis as { document?: unknown; window?: unknown };
  g.document = { documentElement: { style: { setProperty() {}, removeProperty() {} }, dataset: {}, classList: { toggle() {} } } };
  g.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
  try {
    for (const { value } of APPROVAL_LEVELS) {
      applyAppearance(withApprovalLevel(DEFAULT_SETTINGS, value));
      assert.equal(currentBigTerminal().requiresToolApprovals, value !== "auto", value);
    }
  } finally {
    delete g.document;
    delete g.window;
  }
});
