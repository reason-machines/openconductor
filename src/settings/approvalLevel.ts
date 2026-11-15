// Account › "Claude Code tool approvals" (`claude_approval_level`): how much
// a Claude Code chat does before it asks. A repository (repository Settings ›
// Git) and a chat (the composer's picker) can each pick their own level; the
// backend resolves chat, then repository, then this account level
// (src-tauri/src/approval_level.rs).
//
// Conductor has one switch here, `tool_approvals_enabled`. The level replaces
// it in the row; saving a level keeps the switch's key in step (on only for
// "Approve everything"), and a file that has only the switch reads as
// "Approve everything" or "Auto".
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "./types.ts";

export type ApprovalLevel = "auto" | "approve_prs" | "approve_all";

export const APPROVAL_LEVELS: readonly { value: ApprovalLevel; label: string; help: string }[] = [
  { value: "auto", label: "Auto", help: "Claude Code runs every tool without asking." },
  {
    value: "approve_prs",
    label: "Approve PRs",
    help: "Edits and commands run without asking. Pushing, and creating, changing or merging a pull request, wait for your approval.",
  },
  { value: "approve_all", label: "Approve everything", help: "Claude Code asks before it runs any tool." },
];

export function isApprovalLevel(value: unknown): value is ApprovalLevel {
  return APPROVAL_LEVELS.some((l) => l.value === value);
}

export function approvalLabel(level: ApprovalLevel): string {
  return APPROVAL_LEVELS.find((l) => l.value === level)?.label ?? level;
}

/** The account's level: the one picked, else what Conductor's switch means. */
export function approvalLevel(s: Pick<Settings, "claude_approval_level" | "tool_approvals_enabled">): ApprovalLevel {
  if (isApprovalLevel(s.claude_approval_level)) return s.claude_approval_level;
  return s.tool_approvals_enabled === true ? "approve_all" : "auto";
}

export function withApprovalLevel(s: Settings, level: ApprovalLevel): Settings {
  return { ...s, claude_approval_level: level, tool_approvals_enabled: level === "approve_all" };
}

/** A chat's level and where it comes from (`approval_level::Resolved`). */
export interface ChatApprovalLevel {
  level: ApprovalLevel;
  source: "chat" | "repo" | "global";
  /** The repository's level, else the account's: what the chat follows without a choice of its own. */
  inherited: ApprovalLevel;
}

export function parseChatApprovalLevel(value: unknown): ChatApprovalLevel {
  const v = value as Partial<ChatApprovalLevel> | null;
  if (!v || !isApprovalLevel(v.level) || !isApprovalLevel(v.inherited) || (v.source !== "chat" && v.source !== "repo" && v.source !== "global")) {
    throw new Error("The local chat returned an invalid approval level.");
  }
  return { level: v.level, source: v.source, inherited: v.inherited };
}

/** Why the chat is at its level, for the picker's tooltip. */
export function approvalSourceText(chat: ChatApprovalLevel): string {
  const help = APPROVAL_LEVELS.find((l) => l.value === chat.level)?.help ?? "";
  const from = chat.source === "chat" ? "Set for this chat." : chat.source === "repo" ? "Set for this repository." : "From Settings › Account.";
  return `${help} ${from}`;
}

export const APPROVAL_LEVEL_CHANGED = "approval-level-changed";

export function chatApprovalLevel(chatId: string, workspaceId: string): Promise<ChatApprovalLevel> {
  return invoke<unknown>("approval_level_get", { chatId, workspaceId }).then(parseChatApprovalLevel);
}

/** Picks the chat's own level; the level it would inherit goes back to following its repository and the account. */
export function setChatApprovalLevel(chatId: string, workspaceId: string, level: ApprovalLevel): Promise<ChatApprovalLevel> {
  return invoke<unknown>("approval_level_set_chat", { chatId, workspaceId, level }).then(parseChatApprovalLevel);
}

function parseRepoLevel(value: unknown): ApprovalLevel | null {
  return isApprovalLevel(value) ? value : null;
}

/** The repository's own level, or null while it follows the account. */
export function repoApprovalLevel(repoId: string): Promise<ApprovalLevel | null> {
  return invoke<unknown>("repo_approval_level_get", { repoId }).then(parseRepoLevel);
}

export function setRepoApprovalLevel(repoId: string, level: ApprovalLevel | null): Promise<ApprovalLevel | null> {
  return invoke<unknown>("repo_approval_level_set", { repoId, level }).then(parseRepoLevel);
}
