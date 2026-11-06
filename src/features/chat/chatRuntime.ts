// Agent-agnostic chat runtime: one transcript plus follow-up queue per chat,
// run against a `ChatBackend` (Reason in reasonChat.ts; other agents plug in
// the same way). A workspace's own chat has the workspace id; other chats
// (reviews) get their own ids. The agent's session id is saved per chat under
// the backend's `sessionKey`, so a chat reopened after a restart resumes it.
// A chat can ask for session options (the backend's `Config`) before its
// first message.
//
// Turn lifecycle, Stop and the queue are decided by `queue.ts`; this file runs
// its effects. Open turns are tracked with reason.ts's turn bookkeeping
// (`startTurn`, `failTurn`, `cancelUnsent`); a backend turns its own events
// into the same `Step`s.
//
// Entry and exit points: `chat()` creates a chat's state; `apply()` is the only
// place transcript events land; `setQueue()` the only place the queue changes.
//
// In the desktop app (`host.persist`) each chat's transcript is kept in
// `conductor.db` (persist.ts): `stored()` loads it once when the chat is first
// used and saves every later change.
//
// Each chat's session status is shared by every runtime (`chatStatuses`) and,
// once `connectStatusStore` runs (the desktop app), kept in `conductor.db`
// (`sessions.status`), loaded at start and followed through the
// `session-status` event, so the sidebar and Home show a workspace's agent
// from the moment the app starts. A backend that asks the user for
// permission mid-turn reports it through `PermissionEvents`; the chat lists
// the request and its status is `needs_user_permission` until it is answered.
//
// Pure apart from what it is given: the backend, and the host's `invoke`,
// `recordTurnChanges` and `localStorage`, so chatRuntime.test.ts runs it with
// a fake backend.

import { applyChatEvents, emptyTranscript, truncateAfterTurn, type ChatTranscript } from "./reducer.ts";
import { restoreCheckpoint, turnCheckpointRef, type Invoke } from "./checkpoints.ts";
import { cancelUnsent, failTurn, openTurns, reasonChat, startTurn, type PromptAttachment, type ReasonChatState, type Step } from "./reason.ts";
import * as Q from "./queue.ts";
import { ChatSaver, restoreEvents } from "./persist.ts";
import { chatWantsAttention, turnSettled } from "./attention.ts";
import { earlierConversation, lastMessageOfTurn } from "./rewind.ts";
import type { FileChange } from "../diff/types.ts";

/** Open turns of one chat, as reason.ts tracks them. */
export type ChatTurns = ReasonChatState;

/** Hands a backend event to the runtime: `reduce` turns it into a `Step` on the chat's turn state. */
export type Deliver = (chatId: string, reduce: (state: ChatTurns) => Step) => void;

/** One choice offered with a permission request. */
export interface PermissionOption {
  optionId: string;
  name: string;
  /** `allow_once`, `allow_always`, `reject_once` or `reject_always`. */
  kind: string;
}

/** A tool call the agent waits to be allowed (ACP `session/request_permission`). */
export interface PermissionPrompt {
  requestId: string;
  title: string;
  options: PermissionOption[];
}

/** How a backend reports permission requests opening and closing. */
export interface PermissionEvents {
  requested(chatId: string, request: PermissionPrompt): void;
  resolved(chatId: string, requestId: string): void;
}

/** One prompt as the backend sends it. */
export interface PromptRequest {
  chatId: string;
  /** The workspace folder. */
  cwd: string;
  text: string;
  /**
   * What the agent gets attached: the user's files, after the kept
   * conversation when this prompt opens a new session for a chat that
   * already has turns (after Reset chat; rewind.ts).
   */
  attachments: PromptAttachment[];
  /** Checkpoint ref the backend saves the turn's `start` and `end` checkpoints under (checkpoints.ts). */
  turn: { sessionId: string; turnId: string };
  /** The chat's first message to a new agent session: no session saved, nothing sent yet. */
  firstMessage: boolean;
  /** Repository the chat's workspace belongs to, if known. */
  repoPath: string | null;
}

/** An agent the runtime runs chats on. */
export interface ChatBackend<Config> {
  /** The agent steers a running turn with a follow-up. */
  canSteer: boolean;
  /** Options a chat uses when none were picked, or when looking up the default failed. */
  defaultConfig: Config;
  /** localStorage key of the chat's agent session id. */
  sessionKey(chatId: string): string;
  /** localStorage key of the chat's picked options (`configure`), kept for a session it opens later. */
  configKey(chatId: string): string;
  /** Reads saved options back; null when they are not this backend's `Config`. */
  parseConfig(saved: unknown): Config | null;
  /** Starts delivering the agent's events; called once, before the first `open`. */
  listen(deliver: Deliver, permissions: PermissionEvents): Promise<unknown>;
  /** Opens the chat's agent session (a new one, or `sessionId` resumed) before its first prompt. */
  open(chatId: string, cwd: string, sessionId: string | null, config: Config): Promise<void>;
  /**
   * New options for the chat's open session (a pick in a running chat): the
   * session runs on them from its next prompt. A backend without it keeps
   * them for its next new session.
   */
  reconfigure?(chatId: string, config: Config): void;
  /**
   * Sends a prompt; steers it into a running turn when `canSteer`. Resolves
   * once the turn ended, with the files it changed; a rejection means the
   * turn never started, so no event will end it.
   */
  prompt(req: PromptRequest): Promise<{ turnChanges?: FileChange[] }>;
  /** Interrupts the running turn; `hard` on a repeated Stop. */
  cancel(chatId: string, hard: boolean): void;
  /**
   * Answers a permission request with one of its options, or `cancelled`
   * with null. False when the request is no longer open.
   */
  answerPermission?(chatId: string, requestId: string, optionId: string | null): Promise<boolean>;
}

/** What the runtime needs from the app around it. */
export interface ChatHost {
  /** Tauri `invoke`, for checkpoints and the stored transcript. */
  invoke: Invoke;
  /** Keep transcripts in `conductor.db` (the desktop app). */
  persist: boolean;
  /** Caches the files a finished turn changed, for the chips under the turn. */
  recordTurnChanges(turn: { sessionId: string; turnId: string }, files: FileChange[]): void;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

export interface ChatSnapshot {
  transcript: ChatTranscript;
  queue: Q.ChatQueue;
  /** Open permission requests, oldest first. */
  permissions: readonly PermissionPrompt[];
}

export type QueueAction = Q.QueueAction;

export interface ChatRuntime<Config> {
  readonly canSteer: boolean;
  snapshot(chatId: string): ChatSnapshot;
  subscribe(chatId: string, fn: (s: ChatSnapshot) => void): () => void;
  /**
   * The composer's Send: starts a turn, steers the running one, or queues, per
   * `mode`. `cwd` is the workspace folder; `repoPath` its repository, which
   * goes to the backend with each prompt. Attachments go as embedded files
   * and show by name.
   */
  submit(chatId: string, cwd: string, text: string, mode: Q.SendMode, attachments?: readonly PromptAttachment[], repoPath?: string): void;
  /** Stop. A second Stop while the first is pending asks the backend to stop hard. */
  stop(chatId: string): void;
  queueAction(chatId: string, action: QueueAction): void;
  /**
   * "Reset chat" to `turnId`: with `resetFiles`, restore the workspace to the
   * turn's end checkpoint first; only when that worked, delete the later
   * messages. The agent is rewound too: when messages were deleted the chat
   * forgets its session (here and in `conductor.db`, in the same write) and
   * the next prompt opens a new one carrying the kept conversation
   * (rewind.ts).
   */
  reset(chatId: string, cwd: string, turnId: string, resetFiles: boolean): Promise<void>;
  /**
   * The chat's session options. An open session runs on them from its next
   * prompt (as Conductor reconciles a picked model before each turn); a chat
   * not opened yet opens on them, as does the session after Reset chat.
   * Picked options are kept across restarts.
   */
  configure(chatId: string, config: Config): void;
  /**
   * The options a chat starts with when none were picked; the first prompt
   * waits for them, and a failed lookup leaves `defaultConfig`.
   */
  configureDefault(chatId: string, config: Promise<Config>): void;
  /**
   * Answers a permission request with one of its options, or declines it
   * (`cancelled`) with null. The request closes when the backend confirms it,
   * or at once when it was no longer open.
   */
  answerPermission(chatId: string, requestId: string, optionId: string | null): Promise<void>;
  /** The options the chat's sessions open with: picked, defaulted, or `defaultConfig`. */
  config(chatId: string): Promise<Config>;
}

interface Chat<Config> {
  state: ChatTurns;
  transcript: ChatTranscript;
  queue: Q.ChatQueue;
  cwd: string | null;
  /** Repository the chat's workspace belongs to. */
  repoPath: string | null;
  opened: boolean;
  /** Options the chat's session runs on: `open` passes them, `configure` updates an open one; the first prompt waits for them. */
  config: Config | Promise<Config>;
  /** The chat's options were picked (New workspace dialog, review model) or defaulted, so the default does not replace them. */
  configured: boolean;
  /** Turns shown as running whose prompt has not reached the backend yet. */
  unsent: Set<string>;
  /** Unsent turns the user stopped: they end cancelled instead of being sent. */
  stopped: Set<string>;
  listeners: Set<(s: ChatSnapshot) => void>;
  permissions: PermissionPrompt[];
}

// Every chat's session status (Conductor's `sessions.status`), so a sidebar
// row can show its workspace's agent while that workspace is not open: chats
// keep running here after their view unmounts. Closed (hidden) chats drop out,
// as Conductor folds only a workspace's visible sessions. Shared by every
// runtime, so a workspace's status counts the chats of every backend.
let statuses: ReadonlyMap<string, Q.SessionStatus> = new Map();
const hiddenChats = new Set<string>();
const statusListeners = new Set<() => void>();

function setStatus(chatId: string, status: Q.SessionStatus | undefined) {
  if (statuses.get(chatId) === status) return;
  const next = new Map(statuses);
  if (status === undefined) next.delete(chatId);
  else next.set(chatId, status);
  statuses = next;
  for (const fn of statusListeners) fn();
}

/**
 * A chat's session status changed (any agent): the sidebar and Home see it
 * and, once the store is connected, `conductor.db` keeps it.
 */
export function reportChatStatus(chatId: string, status: Q.SessionStatus): void {
  if (hiddenChats.has(chatId)) return setStatus(chatId, undefined);
  setStatus(chatId, status);
  persistStatus(chatId, status);
}

/** Chat id → session status of every visible chat; a new map on each change. */
export const chatStatuses = (): ReadonlyMap<string, Q.SessionStatus> => statuses;

export function subscribeChatStatuses(fn: () => void): () => void {
  syncStatuses();
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

/** A closed chat tab: its agent no longer counts toward the workspace's status. */
export function hideChat(chatId: string): void {
  hiddenChats.add(chatId);
  setStatus(chatId, undefined);
}

/** The workspace a chat belongs to: a review chat's id is `<workspace id>:review:<n>`. */
const workspaceOfChat = (chatId: string) => {
  const i = chatId.indexOf(":review:");
  return i < 0 ? chatId : chatId.slice(0, i);
};

/** What the status store needs from the desktop app. */
export interface StatusStoreHost {
  invoke: Invoke;
  /** Tauri `listen`: calls `fn` with each event's payload until unlistened. */
  listen<T>(event: string, fn: (e: { event: string; payload: T }) => void): Promise<unknown>;
}

// `conductor.db` keeps every chat's status (`sessions.status`). Writes go
// one at a time per chat so they land in order; each write comes back as a
// `session-status` event, which is skipped while that chat has writes in
// flight. Any other event (another window, a test driver) is applied.
const STATUS_EVENT = "session-status";
const SESSION_STATUSES = new Set<string>(["idle", "working", "cancelling", "error", "needs_plan_response", "needs_user_permission", "needs_user_input", "waiting"]);
let statusHost: StatusStoreHost | null = null;
const writes = new Map<string, { chain: Promise<unknown>; inFlight: number; last: Q.SessionStatus | null }>();
let syncing: Promise<unknown> | null = null;

/** Keeps statuses in `conductor.db` from now on (the desktop app). */
export function connectStatusStore(host: StatusStoreHost): void {
  statusHost ??= host;
  syncStatuses();
}

function persistStatus(chatId: string, status: Q.SessionStatus) {
  const host = statusHost;
  if (!host) return;
  const w = writes.get(chatId) ?? { chain: Promise.resolve(), inFlight: 0, last: null };
  writes.set(chatId, w);
  if (w.last === status) return;
  w.last = status;
  w.inFlight++;
  w.chain = w.chain
    .then(() => host.invoke("session_set_status", { chatId, workspaceId: workspaceOfChat(chatId), status }))
    .catch((e) => {
      w.inFlight--;
      console.warn("chat: session status not saved", e);
    });
}

interface StoredStatus {
  chatId: string;
  status: string;
}

function receivedStatus({ chatId, status }: StoredStatus) {
  if (!SESSION_STATUSES.has(status) || hiddenChats.has(chatId)) return;
  const w = writes.get(chatId);
  if (w && w.inFlight > 0) {
    w.inFlight--;
    return;
  }
  setStatus(chatId, status as Q.SessionStatus);
}

/** Loads the stored statuses once and follows later writes. */
function syncStatuses() {
  const host = statusHost;
  if (syncing || !host) return;
  syncing = host
    .listen<StoredStatus>(STATUS_EVENT, (e) => {
      if (e.event === STATUS_EVENT) receivedStatus(e.payload);
    })
    .then(() => host.invoke("session_statuses", {}) as Promise<StoredStatus[] | null>)
    .then((rows) => {
      // A chat that changed in this run already shows its own status.
      for (const r of rows ?? []) if (!writes.has(r.chatId) && !statuses.has(r.chatId)) receivedStatus(r);
    })
    .catch((e) => console.warn("chat: stored session statuses not loaded", e));
}

export function createChatRuntime<Config>(backend: ChatBackend<Config>, host: ChatHost): ChatRuntime<Config> {
  const chats = new Map<string, Chat<Config>>();
  const savers = new Map<string, ChatSaver>();
  /** Settles once a chat's stored transcript and session id are in (or failed to load). */
  const loads = new Map<string, Promise<void>>();
  let listening: Promise<unknown> | null = null;
  const sessionKey = backend.sessionKey;

  function savedConfig(chatId: string): Config | null {
    try {
      return backend.parseConfig(JSON.parse(host.storage.getItem(backend.configKey(chatId)) ?? "null"));
    } catch {
      return null;
    }
  }

  function chat(chatId: string): Chat<Config> {
    let c = chats.get(chatId);
    if (!c) {
      const saved = savedConfig(chatId);
      c = {
        state: reasonChat(chatId),
        transcript: emptyTranscript(chatId),
        queue: Q.emptyQueue(),
        cwd: null,
        repoPath: null,
        opened: false,
        config: saved ?? backend.defaultConfig,
        configured: saved !== null,
        unsent: new Set(),
        stopped: new Set(),
        listeners: new Set(),
        permissions: [],
      };
      chats.set(chatId, c);
    }
    stored(c);
    return c;
  }

  /**
   * The chat's saver; the first call loads the stored transcript into the chat.
   * Nothing else changes the transcript before the load settles: `prompt` waits
   * for it, so a message sent while loading lands after the stored turns and
   * goes to the stored session.
   */
  function stored(c: Chat<Config>): ChatSaver | undefined {
    if (!host.persist) return undefined;
    const chatId = c.state.chatId;
    let saver = savers.get(chatId);
    if (saver) return saver;
    saver = new ChatSaver(async (batch) => {
      await host.invoke("chat_messages_save", { chatId, ...batch, agentSessionId: host.storage.getItem(sessionKey(chatId)) });
    });
    savers.set(chatId, saver);
    const s = saver;
    const load = (host.invoke("chat_messages_load", { chatId }) as Promise<{ messages: string[]; agentSessionId: string | null }>)
      .then(({ messages, agentSessionId }) => {
        if (agentSessionId && !host.storage.getItem(sessionKey(chatId))) host.storage.setItem(sessionKey(chatId), agentSessionId);
        if (messages.length === 0) return;
        const r = applyChatEvents(c.transcript, restoreEvents(chatId, messages));
        if (!r.ok) return console.warn("chat: stored transcript not applied", r.error);
        c.transcript = r.transcript;
        s.loaded(c.transcript);
        notify(c);
      })
      .catch((e) => console.warn("chat: stored transcript not loaded", e));
    loads.set(chatId, load);
    return saver;
  }

  const snapshot = (c: Chat<Config>): ChatSnapshot => ({ transcript: c.transcript, queue: c.queue, permissions: c.permissions });
  const notify = (c: Chat<Config>) => {
    const s = snapshot(c);
    for (const fn of c.listeners) fn(s);
  };

  function apply(c: Chat<Config>, step: Step) {
    c.state = step.state;
    if (step.sessionId) host.storage.setItem(sessionKey(c.state.chatId), step.sessionId);
    if (step.events.length === 0) return;
    const r = applyChatEvents(c.transcript, step.events);
    if (!r.ok) {
      console.warn("chat: event not applied", r.error);
      return;
    }
    c.transcript = r.transcript;
    savers.get(c.state.chatId)?.update(c.transcript);
    notify(c);
    // A turn that ended moves the queue on: the next queued message may start.
    for (const e of step.events) {
      if (e.type !== "turn_status" || e.status === "running") continue;
      // No turn runs any more: the agent can no longer use an answer to what was open.
      if (openTurns(c.state) === 0 && c.permissions.length > 0) {
        c.permissions = [];
        notify(c);
      }
      setQueue(c, Q.turnEnded(c.queue, e.status, openTurns(c.state) > 0));
      if (turnSettled(e.status, c.queue)) chatWantsAttention(c.state.chatId);
    }
  }

  function closePermission(c: Chat<Config>, requestId: string) {
    if (!c.permissions.some((r) => r.requestId === requestId)) return;
    c.permissions = c.permissions.filter((r) => r.requestId !== requestId);
    notify(c);
    if (c.permissions.length === 0) setQueue(c, Q.permissionAnswered(c.queue));
  }

  const permissionEvents: PermissionEvents = {
    requested(chatId, request) {
      const c = chats.get(chatId);
      if (!c) return;
      const fresh = !c.permissions.some((r) => r.requestId === request.requestId);
      c.permissions = [...c.permissions.filter((r) => r.requestId !== request.requestId), request];
      notify(c);
      setQueue(c, Q.permissionRequested(c.queue));
      // A new request is a wait on the user (Conductor's `_p` on needs_user_permission).
      if (fresh) chatWantsAttention(chatId);
    },
    resolved(chatId, requestId) {
      const c = chats.get(chatId);
      if (c) closePermission(c, requestId);
    },
  };

  function setQueue(c: Chat<Config>, step: Q.QueueStep | Q.ChatQueue) {
    const { queue, effects } = "effects" in step ? step : { queue: step, effects: [] };
    if (queue !== c.queue) {
      c.queue = queue;
      notify(c);
      reportChatStatus(c.state.chatId, c.queue.status);
    }
    for (const e of effects) run(c, e);
  }

  function run(c: Chat<Config>, effect: Q.Effect) {
    switch (effect.kind) {
      case "start":
      case "steer":
        void prompt(c, effect.text, [...effect.attachments]);
        return;
      case "cancel":
        // The backend cancels only a prompt it has; one still on its way is stopped here.
        for (const turnId of c.unsent) c.stopped.add(turnId);
        backend.cancel(c.state.chatId, effect.hard);
        return;
    }
  }

  const deliver: Deliver = (chatId, reduce) => {
    const c = chats.get(chatId);
    if (c) apply(c, reduce(c.state));
  };

  /**
   * Opens a turn in the transcript and sends the prompt; a backend that can
   * steer takes it into a running turn. The backend checkpoints the workspace
   * before and after the turn under this turn's id and answers with the files
   * the turn changed, which go to the turn-changes cache for the chips under
   * the turn.
   */
  async function prompt(c: Chat<Config>, text: string, attachments: PromptAttachment[]): Promise<void> {
    const chatId = c.state.chatId;
    // A random turn id, so a turn's checkpoints and cached changes never
    // collide with a turn from an earlier app run.
    const turnId = `${chatId}:${crypto.randomUUID()}`;
    // Stop is shown from here on, but the backend only learns of the turn
    // once `prompt` runs; a Stop before that is held in `c.stopped`.
    c.unsent.add(turnId);
    // The stored transcript and session id come first (see `stored`).
    const load = loads.get(chatId);
    if (load) await load;
    // No session yet: a new chat, or one whose session was dropped by Reset
    // chat. The new session gets the conversation the chat still shows.
    const newSession = !c.opened && !host.storage.getItem(sessionKey(chatId));
    const firstMessage = newSession && !c.transcript.messages.some((m) => m.role === "user");
    const carried = newSession ? earlierConversation(c.transcript) : null;
    apply(c, startTurn(c.state, text, new Date(), turnId, attachments));
    // `submit` sets the folder before any effect runs.
    const cwd = c.cwd ?? "";
    try {
      listening ??= backend.listen(deliver, permissionEvents);
      await listening;
      if (!c.opened) {
        const config = await c.config;
        await backend.open(chatId, cwd, host.storage.getItem(sessionKey(chatId)), config);
        c.opened = true;
      }
      c.unsent.delete(turnId);
      if (c.stopped.delete(turnId)) return apply(c, cancelUnsent(c.state, turnId));
      // Conductor snapshots the workspace around every turn: the backend saves
      // the `start` and `end` checkpoints (features/chat/checkpoints.ts names
      // them, so "Reset chat" finds them) and answers with the files the turn
      // changed. Resolves after the turn ended; a rejection means the turn
      // never started (no CLI, no process), so no event will end it.
      const turn = turnCheckpointRef(chatId, turnId);
      const end = await backend.prompt({ chatId, cwd, text, attachments: carried ? [carried, ...attachments] : attachments, turn, firstMessage, repoPath: c.repoPath });
      if (end.turnChanges) host.recordTurnChanges(turn, end.turnChanges);
    } catch (e) {
      c.unsent.delete(turnId);
      c.stopped.delete(turnId);
      apply(c, failTurn(c.state, turnId, String(e)));
    }
  }

  return {
    canSteer: backend.canSteer,
    snapshot: (chatId) => snapshot(chat(chatId)),
    subscribe(chatId, fn) {
      const c = chat(chatId);
      c.listeners.add(fn);
      return () => c.listeners.delete(fn);
    },
    submit(chatId, cwd, text, mode, attachments = [], repoPath) {
      const c = chat(chatId);
      c.cwd = cwd;
      if (repoPath) c.repoPath = repoPath;
      setQueue(c, Q.submit(c.queue, text, mode, new Date(), attachments));
    },
    stop(chatId) {
      const c = chat(chatId);
      setQueue(c, Q.stop(c.queue));
    },
    queueAction(chatId, action) {
      const c = chat(chatId);
      setQueue(c, Q.actionStep(c.queue, action));
    },
    async reset(chatId, cwd, turnId, resetFiles) {
      const c = chat(chatId);
      if (c.transcript.activeTurn !== null) throw new Error("Stop the agent before resetting the chat.");
      await restoreCheckpoint(host.invoke, cwd, chatId, turnId, resetFiles);
      const before = c.transcript;
      c.transcript = truncateAfterTurn(before, turnId);
      const lastKept = lastMessageOfTurn(c.transcript, turnId);
      const saver = savers.get(chatId);
      if (lastKept && c.transcript.messages.length < before.messages.length) {
        host.storage.removeItem(sessionKey(chatId));
        c.opened = false;
        saver?.rewind(c.transcript, lastKept);
      } else saver?.update(c.transcript);
      notify(c);
    },
    configure(chatId, config) {
      const c = chat(chatId);
      c.config = config;
      c.configured = true;
      if (c.opened) backend.reconfigure?.(chatId, config);
      try {
        host.storage.setItem(backend.configKey(chatId), JSON.stringify(config));
      } catch (e) {
        console.warn("chat: session options not saved", e);
      }
    },
    async answerPermission(chatId, requestId, optionId) {
      const c = chat(chatId);
      const open = backend.answerPermission ? await backend.answerPermission(chatId, requestId, optionId) : false;
      if (!open) closePermission(c, requestId);
    },
    configureDefault(chatId, config) {
      const c = chat(chatId);
      if (c.configured || c.opened) return;
      c.config = config.catch(() => backend.defaultConfig);
      c.configured = true;
    },
    config(chatId) {
      return Promise.resolve(chat(chatId).config);
    },
  };
}
