// Reason chats: the Reason backend for chatRuntime.ts. It runs the Tauri
// commands in `src-tauri/src/reason_chat.rs` and turns the
// `reason-chat-event` stream into transcript steps (reason.ts). The runtime
// owns each chat's transcript, queue and persistence; this file exports the
// Reason chat runtime under the names the app uses.
//
// Reason steers natively: a prompt sent while a turn runs goes into that turn
// and the earlier prompt ends `superseded`. The first message of a new chat
// also carries the repository's effective `prompts.general`, as Conductor
// appends its general preferences to a new session's first message; the
// transcript shows only what the user typed.
//
// Outside the desktop app (the Vite preview) a stand-in agent answers each
// prompt after a short delay with a note that no agent runs there, so the
// queue and Stop can be exercised in a browser.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyReasonPayload, type PromptAttachment, type ReasonPayload } from "./reason.ts";
import { createChatRuntime, type ChatBackend, type Deliver } from "./chatRuntime.ts";
import { desktopHost } from "./desktopHost.ts";
import { repoSettingsEffective } from "../../settings/repoSettings.ts";
import { withGeneralPreferences } from "../../settings/prompts.ts";

/** One Reason Session config option (`model`, `reasoning_effort`). */
export interface ReasonConfig {
  id: string;
  value: string;
}

const EVENT = "reason-chat-event";
const sessionKey = (chatId: string) => `openconductor.reason.session.${chatId}`;
/** The chat's picked Session options (`configureReason`), kept for a Session it opens later (after Reset chat). */
const configKey = (chatId: string) => `openconductor.reason.config.${chatId}`;
const parseConfig = (v: unknown): ReasonConfig[] | null =>
  Array.isArray(v) ? v.filter((o): o is ReasonConfig => typeof o?.id === "string" && typeof o?.value === "string") : null;

/** Reason chats need the desktop app; the browser preview uses a stand-in agent. */
export const reasonAvailable = (): boolean => isTauri();

/** Reason steers a running turn with a follow-up. */
export const REASON_CAN_STEER = true;

const reasonBackend: ChatBackend<ReasonConfig[]> = {
  agent: "reason",
  canSteer: REASON_CAN_STEER,
  defaultConfig: [],
  sessionKey,
  configKey,
  parseConfig,
  listen: (deliver) => listen<ReasonPayload>(EVENT, ({ payload }) => deliver(payload.chatId, (s) => applyReasonPayload(s, payload))),
  async open(chatId, cwd, sessionId, config) {
    await invoke("reason_open_chat", { chatId, cwd, sessionId, config });
  },
  async prompt({ chatId, cwd, text, attachments, turn, firstMessage, repoPath }) {
    const agentText = firstMessage && repoPath ? await withGeneral(text, repoPath, cwd) : text;
    return invoke("reason_prompt", { chatId, text: agentText, attachments, turn });
  },
  // Reason has one cancel; a repeated Stop asks it again.
  cancel(chatId) {
    void invoke("reason_cancel", { chatId });
  },
};

async function withGeneral(text: string, repoPath: string, cwd: string): Promise<string> {
  try {
    const settings = await repoSettingsEffective(repoPath, cwd);
    return withGeneralPreferences(text, settings.prompts.general?.value);
  } catch (e) {
    console.warn("reason chat: general preferences not applied", e);
    return text;
  }
}

// Stand-in agent for the browser preview: each prompt "works" for a moment,
// then replies that no agent runs here. A follow-up supersedes the running
// prompt, as Reason does.
const PREVIEW_TURN_MS = 2500;
function previewBackend(): ChatBackend<ReasonConfig[]> {
  const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  let send: Deliver = () => undefined;
  const emit = (p: ReasonPayload) => send(p.chatId, (s) => applyReasonPayload(s, p));
  return {
    agent: "reason",
    canSteer: REASON_CAN_STEER,
    defaultConfig: [],
    sessionKey,
    configKey,
    parseConfig,
    async listen(deliver) {
      send = deliver;
    },
    async open() {},
    async prompt({ chatId, text }) {
      const pending = timers.get(chatId) ?? [];
      // Supersede: the earlier prompt ends now and this one carries on.
      if (pending.length > 0) emit({ chatId, type: "turnEnded", end: { outcome: "superseded" } });
      const t = setTimeout(() => {
        timers.set(chatId, (timers.get(chatId) ?? []).filter((x) => x !== t));
        emit({ chatId, type: "text", text: `Browser preview: no agent runs here, so "${text.slice(0, 60)}" was not sent. Reason runs chats in the desktop app.` });
        emit({ chatId, type: "turnEnded", end: { outcome: "completed" } });
      }, PREVIEW_TURN_MS);
      timers.set(chatId, [t]);
      return {};
    },
    cancel(chatId) {
      for (const t of timers.get(chatId) ?? []) clearTimeout(t);
      timers.set(chatId, []);
      emit({ chatId, type: "turnEnded", end: { outcome: "cancelled" } });
    },
  };
}

const reason = createChatRuntime(reasonAvailable() ? reasonBackend : previewBackend(), desktopHost);

export const chatSnapshot = reason.snapshot;
export const subscribeChat = reason.subscribe;
export const submitChat = reason.submit;
export const stopChat = reason.stop;
export const queueAction = reason.queueAction;
/**
 * "Reset chat". A Reason Session cannot drop turns, so a reset that deletes
 * messages forgets the chat's Session and the next prompt opens a new one
 * carrying the kept conversation.
 */
export const resetReasonChat = reason.reset;
/** Session options for the chat's next new Session (its first, or the one after Reset chat); kept across restarts. */
export const configureReason = reason.configure;
/** The default model's options; a failed lookup leaves Reason's default. */
export const configureReasonDefault = reason.configureDefault;
/** The options the chat's Sessions open with (a fork opens on the same). */
export const reasonChatConfig = reason.config;

/** The first message or a Retry: starts when idle, else waits in the queue. */
export function sendReason(chatId: string, cwd: string, text: string, attachments: readonly PromptAttachment[] = [], repoPath?: string): void {
  reason.submit(chatId, cwd, text, "queue", attachments, repoPath);
}
