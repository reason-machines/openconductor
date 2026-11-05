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
// Pure apart from what it is given: the backend, and the host's `invoke`,
// `recordTurnChanges` and `localStorage`, so chatRuntime.test.ts runs it with
// a fake backend.

import { applyChatEvents, emptyTranscript, truncateAfterTurn, type ChatTranscript } from "./reducer.ts";
import { restoreCheckpoint, turnCheckpointRef, type Invoke } from "./checkpoints.ts";
import { cancelUnsent, failTurn, openTurns, reasonChat, startTurn, type PromptAttachment, type ReasonChatState, type Step } from "./reason.ts";
import * as Q from "./queue.ts";
import { ChatSaver, restoreEvents } from "./persist.ts";
import type { FileChange } from "../diff/types.ts";

/** Open turns of one chat, as reason.ts tracks them. */
export type ChatTurns = ReasonChatState;

/** Hands a backend event to the runtime: `reduce` turns it into a `Step` on the chat's turn state. */
export type Deliver = (chatId: string, reduce: (state: ChatTurns) => Step) => void;

/** One prompt as the backend sends it. */
export interface PromptRequest {
  chatId: string;
  /** The workspace folder. */
  cwd: string;
  text: string;
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
  /** Starts delivering the agent's events; called once, before the first `open`. */
  listen(deliver: Deliver): Promise<unknown>;
  /** Opens the chat's agent session (a new one, or `sessionId` resumed) before its first prompt. */
  open(chatId: string, cwd: string, sessionId: string | null, config: Config): Promise<void>;
  /**
   * Sends a prompt; steers it into a running turn when `canSteer`. Resolves
   * once the turn ended, with the files it changed; a rejection means the
   * turn never started, so no event will end it.
   */
  prompt(req: PromptRequest): Promise<{ turnChanges?: FileChange[] }>;
  /** Interrupts the running turn; `hard` on a repeated Stop. */
  cancel(chatId: string, hard: boolean): void;
}

/** What the runtime needs from the app around it. */
export interface ChatHost {
  /** Tauri `invoke`, for checkpoints and the stored transcript. */
  invoke: Invoke;
  /** Keep transcripts in `conductor.db` (the desktop app). */
  persist: boolean;
  /** Caches the files a finished turn changed, for the chips under the turn. */
  recordTurnChanges(turn: { sessionId: string; turnId: string }, files: FileChange[]): void;
  storage: Pick<Storage, "getItem" | "setItem">;
}

export interface ChatSnapshot {
  transcript: ChatTranscript;
  queue: Q.ChatQueue;
}

export type QueueAction =
  | { kind: "delete"; id: string }
  | { kind: "steer"; id: string }
  | { kind: "edit"; id: string }
  | { kind: "cancelEdit" }
  | { kind: "saveEdit"; text: string; steer: boolean }
  | { kind: "move"; id: string; by: -1 | 1 }
  | { kind: "reorder"; ids: string[] }
  | { kind: "pause" }
  | { kind: "resume" };

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
   * messages. The agent session itself is not rewound.
   */
  reset(chatId: string, cwd: string, turnId: string, resetFiles: boolean): Promise<void>;
  /** Session options for a chat that has not sent its first message. A chat whose session exists keeps its options. */
  configure(chatId: string, config: Config): void;
  /**
   * The options a chat starts with when none were picked; the first prompt
   * waits for them, and a failed lookup leaves `defaultConfig`.
   */
  configureDefault(chatId: string, config: Promise<Config>): void;
}

interface Chat<Config> {
  state: ChatTurns;
  transcript: ChatTranscript;
  queue: Q.ChatQueue;
  cwd: string | null;
  /** Repository the chat's workspace belongs to. */
  repoPath: string | null;
  opened: boolean;
  /** Options for the session `open` creates; the first prompt waits for them. */
  config: Config | Promise<Config>;
  /** The chat's options were picked (New workspace dialog, review model), so the default does not replace them. */
  configured: boolean;
  /** Turns shown as running whose prompt has not reached the backend yet. */
  unsent: Set<string>;
  /** Unsent turns the user stopped: they end cancelled instead of being sent. */
  stopped: Set<string>;
  listeners: Set<(s: ChatSnapshot) => void>;
}

// Every chat's session status (Conductor's `sessions.status`), so a sidebar
// row can show its workspace's agent while that workspace is not open: chats
// keep running here after their view unmounts. Closed (hidden) chats drop out,
// as Conductor folds only a workspace's visible sessions. Shared by every
// runtime, so a workspace's status counts the chats of every backend.
let statuses: ReadonlyMap<string, Q.SessionStatus> = new Map();
const hiddenChats = new Set<string>();
const statusListeners = new Set<() => void>();
/** Each runtime's republish of one chat's status, if it has that chat. */
const republishers = new Set<(chatId: string) => void>();

function publishStatus(chatId: string, queueStatus: Q.SessionStatus) {
  const status = hiddenChats.has(chatId) ? undefined : queueStatus;
  if (statuses.get(chatId) === status) return;
  const next = new Map(statuses);
  if (status === undefined) next.delete(chatId);
  else next.set(chatId, status);
  statuses = next;
  for (const fn of statusListeners) fn();
}

/** Chat id → session status of every visible chat; a new map on each change. */
export const chatStatuses = (): ReadonlyMap<string, Q.SessionStatus> => statuses;

export function subscribeChatStatuses(fn: () => void): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

/** A closed chat tab: its agent no longer counts toward the workspace's status. */
export function hideChat(chatId: string): void {
  hiddenChats.add(chatId);
  for (const republish of republishers) republish(chatId);
}

export function createChatRuntime<Config>(backend: ChatBackend<Config>, host: ChatHost): ChatRuntime<Config> {
  const chats = new Map<string, Chat<Config>>();
  republishers.add((chatId) => {
    const c = chats.get(chatId);
    if (c) publishStatus(chatId, c.queue.status);
  });
  const savers = new Map<string, ChatSaver>();
  let listening: Promise<unknown> | null = null;
  const sessionKey = backend.sessionKey;

  function chat(chatId: string): Chat<Config> {
    let c = chats.get(chatId);
    if (!c) {
      c = { state: reasonChat(chatId), transcript: emptyTranscript(chatId), queue: Q.emptyQueue(), cwd: null, repoPath: null, opened: false, config: backend.defaultConfig, configured: false, unsent: new Set(), stopped: new Set(), listeners: new Set() };
      chats.set(chatId, c);
    }
    stored(c);
    return c;
  }

  /** The chat's saver; the first call loads the stored transcript into an untouched chat. */
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
    (host.invoke("chat_messages_load", { chatId }) as Promise<{ messages: string[]; agentSessionId: string | null }>)
      .then(({ messages, agentSessionId }) => {
        if (agentSessionId && !host.storage.getItem(sessionKey(chatId))) host.storage.setItem(sessionKey(chatId), agentSessionId);
        // A chat that already has messages (a prompt sent while loading) keeps them; the stored rows stay for the next open.
        if (messages.length === 0 || c.transcript.messages.length > 0) return;
        const r = applyChatEvents(c.transcript, restoreEvents(chatId, messages));
        if (!r.ok) return console.warn("chat: stored transcript not applied", r.error);
        c.transcript = r.transcript;
        s.loaded(c.transcript);
        notify(c);
      })
      .catch((e) => console.warn("chat: stored transcript not loaded", e));
    return saver;
  }

  const snapshot = (c: Chat<Config>): ChatSnapshot => ({ transcript: c.transcript, queue: c.queue });
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
      setQueue(c, Q.turnEnded(c.queue, e.status, openTurns(c.state) > 0));
    }
  }

  function setQueue(c: Chat<Config>, step: Q.QueueStep | Q.ChatQueue) {
    const { queue, effects } = "effects" in step ? step : { queue: step, effects: [] };
    if (queue !== c.queue) {
      c.queue = queue;
      notify(c);
      publishStatus(c.state.chatId, c.queue.status);
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
    const firstMessage = !c.opened && !host.storage.getItem(sessionKey(chatId)) && !c.transcript.messages.some((m) => m.role === "user");
    // A random turn id, so a turn's checkpoints and cached changes never
    // collide with a turn from an earlier app run.
    const turnId = `${chatId}:${crypto.randomUUID()}`;
    apply(c, startTurn(c.state, text, new Date(), turnId, attachments));
    // `submit` sets the folder before any effect runs.
    const cwd = c.cwd ?? "";
    // Stop is shown from here on, but the backend only learns of the turn
    // once `prompt` runs; a Stop before that is held in `c.stopped`.
    c.unsent.add(turnId);
    try {
      listening ??= backend.listen(deliver);
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
      const end = await backend.prompt({ chatId, cwd, text, attachments, turn, firstMessage, repoPath: c.repoPath });
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
      const q = c.queue;
      switch (action.kind) {
        case "delete":
          return setQueue(c, Q.remove(q, action.id));
        case "steer":
          return setQueue(c, Q.steerQueued(q, action.id));
        case "edit":
          return setQueue(c, Q.beginEdit(q, action.id));
        case "cancelEdit":
          return setQueue(c, Q.cancelEdit(q));
        case "saveEdit":
          return setQueue(c, Q.saveEdit(q, action.text, action.steer));
        case "move":
          return setQueue(c, Q.move(q, action.id, action.by));
        case "reorder":
          return setQueue(c, Q.reorder(q, action.ids));
        case "pause":
          return setQueue(c, Q.pause(q));
        case "resume":
          return setQueue(c, Q.resume(q));
      }
    },
    async reset(chatId, cwd, turnId, resetFiles) {
      const c = chat(chatId);
      if (c.transcript.activeTurn !== null) throw new Error("Stop the agent before resetting the chat.");
      await restoreCheckpoint(host.invoke, cwd, chatId, turnId, resetFiles);
      c.transcript = truncateAfterTurn(c.transcript, turnId);
      savers.get(chatId)?.update(c.transcript);
      notify(c);
    },
    configure(chatId, config) {
      const c = chat(chatId);
      c.config = config;
      c.configured = true;
    },
    configureDefault(chatId, config) {
      const c = chat(chatId);
      if (c.configured || c.opened) return;
      c.config = config.catch(() => backend.defaultConfig);
      c.configured = true;
    },
  };
}
