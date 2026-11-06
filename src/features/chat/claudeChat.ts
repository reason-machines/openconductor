// Claude Code chats: the Claude Code backend for chatRuntime.ts. It runs the
// Tauri commands in `src-tauri/src/claude_chat/commands.rs` with the
// signed-in `claude` CLI and turns the `claude-chat-event` stream into
// transcript steps. The payloads are Reason's (`reason.ts` reduces them), so
// only the commands, the event and the saved session key differ.
//
// Claude Code does not steer: a follow-up sent during a turn waits in the
// queue and runs after it. Stop interrupts the turn; a second Stop ends the
// process, and the next prompt resumes the same Claude session
// (`claude --resume`).
//
// A workspace's Claude chat has its own chat id (`claudeChatId`,
// `<workspace id>:claude`), so its stored transcript, saved session and turn
// checkpoints never mix with the workspace's Reason chat, while its status
// still counts toward the workspace's (state/workspaceSessions.ts).

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyReasonPayload, permissionPrompt, type ReasonPayload } from "./reason.ts";
import { createChatRuntime, type ChatBackend } from "./chatRuntime.ts";
import { desktopHost } from "./desktopHost.ts";
import { withAttachments } from "../diff/chatAttachment.ts";
import { repoSettingsEffective } from "../../settings/repoSettings.ts";
import { withGeneralPreferences } from "../../settings/prompts.ts";

const EVENT = "claude-chat-event";
const sessionKey = (chatId: string) => `openconductor.claude.session.${chatId}`;
/** Claude Code chats have no picked options yet; the key is the runtime's slot for them. */
const configKey = (chatId: string) => `openconductor.claude.config.${chatId}`;

/** Claude Code chats need the desktop app (the `claude` CLI runs there). */
export const claudeAvailable = (): boolean => isTauri();

/** The id of a workspace's Claude Code chat. */
export const claudeChatId = (workspaceId: string): string => `${workspaceId}:claude`;
export const isClaudeChat = (chatId: string): boolean => chatId.endsWith(":claude");

/** Claude Code queues follow-ups instead of steering the running turn. */
export const CLAUDE_CAN_STEER = false;

export const claudeBackend: ChatBackend<null> = {
  canSteer: CLAUDE_CAN_STEER,
  defaultConfig: null,
  sessionKey,
  configKey,
  // No options to read back: a Claude Code chat always starts on the default.
  parseConfig: () => null,
  // A tool, plan or question prompt (`can_use_tool`, asked when tool
  // approvals are on or in plan mode) opens a card; `claude_respond` answers it.
  listen: (deliver, permissions) =>
    listen<ReasonPayload>(EVENT, ({ payload }) => {
      if (payload.type === "permissionRequest") permissions.requested(payload.chatId, permissionPrompt(payload));
      else if (payload.type === "permissionResolved") permissions.resolved(payload.chatId, payload.requestId);
      else deliver(payload.chatId, (s) => applyReasonPayload(s, payload));
    }),
  async open(chatId, cwd, sessionId) {
    await invoke("claude_open_chat", { chatId, cwd, sessionId });
  },
  // Attachments go in the message as named blocks (stream-json input takes
  // text), after the repository's general preferences on a first message.
  // After Reset chat deleted turns, the runtime opens a new Claude session
  // and the first attachment is the kept conversation ("Earlier
  // conversation.md"), so it reaches Claude the same way.
  async prompt({ chatId, cwd, text, attachments, turn, firstMessage, repoPath }) {
    const withPrefs = firstMessage && repoPath ? await withGeneral(text, repoPath, cwd) : text;
    return invoke("claude_prompt", { chatId, text: withAttachments(withPrefs, attachments), turn });
  },
  // The backend tells a first Stop from a second (interrupt, then kill).
  cancel(chatId) {
    void invoke("claude_cancel", { chatId });
  },
  // The backend refuses an answer to a request that is no longer open.
  answerPermission: (chatId, requestId, answer) =>
    invoke("claude_respond", { chatId, id: requestId, answer }).then(
      () => true,
      (e) => {
        console.warn("claude chat: answer not delivered", e);
        return false;
      },
    ),
};

async function withGeneral(text: string, repoPath: string, cwd: string): Promise<string> {
  try {
    const settings = await repoSettingsEffective(repoPath, cwd);
    return withGeneralPreferences(text, settings.prompts.general?.value);
  } catch (e) {
    console.warn("claude chat: general preferences not applied", e);
    return text;
  }
}

export const claudeRuntime = createChatRuntime(claudeBackend, desktopHost);
