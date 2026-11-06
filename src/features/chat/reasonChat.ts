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
//
// Reason asks before some tool calls (ACP `session/request_permission`, held
// by the backend as `permissionRequest`); the chat lists the request and its
// status is `needs_user_permission` until `answerPermission` (chatRuntime.ts).
// The same event carries Claude Code's plans and questions (`kind`).
// In the desktop app every chat's status is kept in `conductor.db`
// (`connectStatusStore`).

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyReasonPayload, permissionPrompt, type PromptAttachment, type ReasonPayload } from "./reason.ts";
import { connectStatusStore, createChatRuntime, type ChatBackend, type Deliver, type PermissionAnswer, type PermissionEvents, type PermissionPrompt } from "./chatRuntime.ts";
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
  canSteer: REASON_CAN_STEER,
  defaultConfig: [],
  sessionKey,
  configKey,
  parseConfig,
  listen: (deliver, permissions) =>
    listen<ReasonPayload>(EVENT, ({ payload }) => {
      if (payload.type === "permissionRequest") permissions.requested(payload.chatId, permissionPrompt(payload));
      else if (payload.type === "permissionResolved") permissions.resolved(payload.chatId, payload.requestId);
      else deliver(payload.chatId, (s) => applyReasonPayload(s, payload));
    }),
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
  // Reason asks only for tools: an option, or `cancelled`.
  answerPermission: (chatId, requestId, answer) =>
    invoke<boolean>("reason_answer_permission", { chatId, requestId, optionId: answer.kind === "option" ? answer.optionId : null }),
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
// prompt, as Reason does. The prompts "permission", "plan" and "question"
// make it wait on that request instead, so the cards and the statuses they
// raise can be tried in a browser.
const PREVIEW_TURN_MS = 2500;
type PreviewAsk = PermissionPrompt extends infer P ? (P extends PermissionPrompt ? Omit<P, "requestId"> : never) : never;
const PREVIEW_ASKS: Record<string, PreviewAsk> = {
  permission: {
    kind: "permission",
    tool: "Bash",
    title: "rm -rf build",
    input: { command: "rm -rf build" },
    options: [
      { optionId: "allow", name: "Yes", kind: "allow_once" },
      { optionId: "always", name: "Always allow Bash", kind: "allow_always" },
      { optionId: "deny", name: "No", kind: "reject_once" },
    ],
  },
  plan: { kind: "plan", plan: "## Plan\n\n1. Add the session status to every chat.\n2. Show it on the sidebar row and on Home.\n3. Test each status end to end." },
  question: {
    kind: "question",
    questions: [
      {
        header: "Database",
        question: "Which database should the cache use?",
        multiSelect: false,
        options: [
          { label: "SQLite", description: "One file next to conductor.db" },
          { label: "Postgres", description: "A server the team already runs" },
        ],
      },
      { header: "Extras", question: "Which extras should ship with it?", multiSelect: true, options: [{ label: "Search", description: null }, { label: "Export", description: null }] },
    ],
  },
};

function previewSummary(answer: PermissionAnswer): string {
  switch (answer.kind) {
    case "option":
      return `option ${answer.optionId}`;
    case "plan":
      return answer.approved ? "plan approved" : `keep planning${answer.feedback ? `: ${answer.feedback}` : ""}`;
    case "answers":
      return answer.answers.map((a) => a.join(", ") || "(skipped)").join("; ");
    case "cancel":
      return "dismissed";
  }
}

function previewBackend(): ChatBackend<ReasonConfig[]> {
  const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  /** The request each chat's stand-in waits on. */
  const asking = new Map<string, string>();
  let asks = 0;
  let send: Deliver = () => undefined;
  let permissions: PermissionEvents = { requested: () => undefined, resolved: () => undefined };
  const emit = (p: ReasonPayload) => send(p.chatId, (s) => applyReasonPayload(s, p));
  /** Withdraws what the stand-in waits on; true when it waited. */
  const stopAsking = (chatId: string) => {
    const id = asking.get(chatId);
    if (id === undefined) return false;
    asking.delete(chatId);
    permissions.resolved(chatId, id);
    return true;
  };
  return {
    canSteer: REASON_CAN_STEER,
    defaultConfig: [],
    sessionKey,
    configKey,
    parseConfig,
    async listen(deliver, events) {
      send = deliver;
      permissions = events;
    },
    async open() {},
    async prompt({ chatId, text }) {
      const pending = timers.get(chatId) ?? [];
      // Supersede: the earlier prompt ends now and this one carries on.
      if (stopAsking(chatId) || pending.length > 0) emit({ chatId, type: "turnEnded", end: { outcome: "superseded" } });
      const ask = PREVIEW_ASKS[text.trim().toLowerCase()];
      if (ask) {
        const t = setTimeout(() => {
          timers.set(chatId, (timers.get(chatId) ?? []).filter((x) => x !== t));
          const requestId = `preview-${++asks}`;
          asking.set(chatId, requestId);
          permissions.requested(chatId, { ...ask, requestId } as PermissionPrompt);
        }, 300);
        timers.set(chatId, [t]);
        return {};
      }
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
      stopAsking(chatId);
      emit({ chatId, type: "turnEnded", end: { outcome: "cancelled" } });
    },
    async answerPermission(chatId, requestId, answer) {
      if (asking.get(chatId) !== requestId) return false;
      stopAsking(chatId);
      emit({ chatId, type: "text", text: `Browser preview: you answered with ${previewSummary(answer)}.` });
      emit({ chatId, type: "turnEnded", end: { outcome: "completed" } });
      return true;
    },
  };
}

const reason = createChatRuntime(reasonAvailable() ? reasonBackend : previewBackend(), desktopHost);
if (reasonAvailable()) connectStatusStore({ invoke: desktopHost.invoke, listen });

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
/** Answers what the agent waits on: a tool's option, a plan decision, question answers, or `cancel`. */
export const answerPermission = reason.answerPermission;
export type { ChatSnapshot, PermissionAnswer, PermissionPrompt } from "./chatRuntime.ts";
/** The options the chat's Sessions open with (a fork opens on the same). */
export const reasonChatConfig = reason.config;

/** The first message or a Retry: starts when idle, else waits in the queue. */
export function sendReason(chatId: string, cwd: string, text: string, attachments: readonly PromptAttachment[] = [], repoPath?: string): void {
  reason.submit(chatId, cwd, text, "queue", attachments, repoPath);
}
