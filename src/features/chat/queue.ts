// Turn lifecycle, Stop and the follow-up queue for one chat. Pure: every
// function returns the next state plus the effects the runtime must perform
// (start a turn, steer the running turn, cancel), so `queue.test.ts` covers
// the rules without Tauri or React.
//
// Behaviour follows Conductor 0.87.6 (evidence/chat-queue/README.md):
// - A follow-up sent while the agent works is either steered into the running
//   turn or queued until the turn ends. The default mode is steering; the
//   "opposite follow-up" key sends with the other mode. Agents that cannot
//   steer always queue.
// - The queue sends its head once the session is idle and the queue is not
//   paused, the head is not being edited and nothing is ahead of it.
// - A failed turn pauses the queue; a cancelled turn does not. Resume sends
//   the head again.
// - Stop while working moves the session to "cancelling"; a queued head waits
//   for the cancellation. A second Stop while cancelling asks again (the
//   runtime makes the second one a hard stop).
// - Queued messages can be deleted, edited, reordered, or steered into the
//   running turn.

export type SessionStatus = "idle" | "working" | "cancelling" | "error";
export type SendMode = "queue" | "steer";
/** The user's default follow-up behaviour (Conductor's `default_message_send_mode`). */
export type FollowUpMode = "queued" | "steering";

/** A file sent with a message (Reason gets it as an embedded resource); kept with a queued message. */
export interface MessageAttachment {
  name: string;
  text: string;
}

export interface QueuedMessage {
  id: string;
  text: string;
  attachments: readonly MessageAttachment[];
  /** RFC 3339 UTC. */
  createdAt: string;
}

export interface ChatQueue {
  status: SessionStatus;
  items: QueuedMessage[];
  paused: boolean;
  /** The queued message open in the editor, if any; it does not send while edited. */
  editingId: string | null;
  /** Ids for new queued messages. */
  next: number;
}

export type Effect =
  /** Start a new turn with this prompt (the session was idle). */
  | { kind: "start"; text: string; attachments: readonly MessageAttachment[] }
  /** Send this prompt into the running turn. */
  | { kind: "steer"; text: string; attachments: readonly MessageAttachment[] }
  /** Interrupt the running turn; `hard` on a repeated Stop. */
  | { kind: "cancel"; hard: boolean };

export interface QueueStep {
  queue: ChatQueue;
  effects: Effect[];
}

export function emptyQueue(): ChatQueue {
  return { status: "idle", items: [], paused: false, editingId: null, next: 1 };
}

/** Which mode a submit uses: the requested one, else the default; agents that cannot steer always queue. */
export function resolveSendMode(opts: { canSteer: boolean; defaultMode: FollowUpMode; opposite?: boolean }): SendMode {
  if (!opts.canSteer) return "queue";
  const steering = opts.defaultMode === "steering";
  return steering !== (opts.opposite ?? false) ? "steer" : "queue";
}

const busy = (s: SessionStatus) => s === "working" || s === "cancelling";

/** Sends the head if the session is idle and nothing holds the queue. */
function drain(q: ChatQueue, effects: Effect[]): QueueStep {
  const head = q.items[0];
  if (!head || busy(q.status) || q.paused || q.editingId === head.id) return { queue: q, effects };
  return { queue: { ...q, status: "working", items: q.items.slice(1) }, effects: [...effects, { kind: "start", text: head.text, attachments: head.attachments }] };
}

function enqueue(q: ChatQueue, text: string, attachments: readonly MessageAttachment[], now: Date): ChatQueue {
  const item = { id: `q${q.next}`, text, attachments, createdAt: now.toISOString() };
  return { ...q, items: [...q.items, item], next: q.next + 1 };
}

/** The composer's Send. Blank text does nothing. */
export function submit(q: ChatQueue, text: string, mode: SendMode, now = new Date(), attachments: readonly MessageAttachment[] = []): QueueStep {
  if (text.trim() === "") return { queue: q, effects: [] };
  if (q.status === "working" && mode === "steer") return { queue: q, effects: [{ kind: "steer", text, attachments }] };
  // Idle with nothing waiting: start now. Otherwise keep order behind the queue.
  if (!busy(q.status) && q.items.length === 0 && !q.paused) {
    return { queue: { ...q, status: "working" }, effects: [{ kind: "start", text, attachments }] };
  }
  return drain(enqueue(q, text, attachments, now), []);
}

/** A turn the runtime started outside `submit` (e.g. Retry or the first message). */
export function turnStarted(q: ChatQueue): ChatQueue {
  return q.status === "working" ? q : { ...q, status: "working" };
}

/**
 * The running turn ended. `stillRunning` is true when a steered follow-up
 * took over, so the session keeps working.
 */
export function turnEnded(q: ChatQueue, outcome: "completed" | "cancelled" | "failed", stillRunning = false): QueueStep {
  if (stillRunning) return { queue: { ...q, status: "working" }, effects: [] };
  if (outcome === "failed") return { queue: { ...q, status: "error", paused: q.paused || q.items.length > 0 }, effects: [] };
  return drain({ ...q, status: "idle" }, []);
}

/** Stop. Only does something while a turn runs. */
export function stop(q: ChatQueue): QueueStep {
  if (q.status === "working") return { queue: { ...q, status: "cancelling" }, effects: [{ kind: "cancel", hard: false }] };
  if (q.status === "cancelling") return { queue: q, effects: [{ kind: "cancel", hard: true }] };
  return { queue: q, effects: [] };
}

export function pause(q: ChatQueue): ChatQueue {
  return { ...q, paused: true };
}

export function resume(q: ChatQueue): QueueStep {
  const status = q.status === "error" ? "idle" : q.status;
  return drain({ ...q, paused: false, status }, []);
}

export function remove(q: ChatQueue, id: string): QueueStep {
  const items = q.items.filter((m) => m.id !== id);
  const editingId = q.editingId === id ? null : q.editingId;
  return drain({ ...q, items, editingId }, []);
}

export function beginEdit(q: ChatQueue, id: string): ChatQueue {
  return q.items.some((m) => m.id === id) ? { ...q, editingId: id } : q;
}

export function cancelEdit(q: ChatQueue): QueueStep {
  return drain({ ...q, editingId: null }, []);
}

/**
 * Saves the edited text. `steer` sends it into the running turn instead of
 * keeping it queued (Conductor's "Save and steer"). Saving blank text deletes it.
 */
export function saveEdit(q: ChatQueue, text: string, steer = false): QueueStep {
  const id = q.editingId;
  if (id === null) return { queue: q, effects: [] };
  if (text.trim() === "") return remove(q, id);
  if (steer) return steerQueued({ ...q, editingId: null, items: q.items.map((m) => (m.id === id ? { ...m, text } : m)) }, id);
  return drain({ ...q, editingId: null, items: q.items.map((m) => (m.id === id ? { ...m, text } : m)) }, []);
}

/** New order of queued ids; unknown ids are ignored and missing ones keep their place at the end. */
export function reorder(q: ChatQueue, orderedIds: readonly string[]): ChatQueue {
  const byId = new Map(q.items.map((m) => [m.id, m]));
  const out: QueuedMessage[] = [];
  for (const id of orderedIds) {
    const m = byId.get(id);
    if (m) {
      out.push(m);
      byId.delete(id);
    }
  }
  return { ...q, items: [...out, ...q.items.filter((m) => byId.has(m.id))] };
}

/** Moves a queued message one place up (-1) or down (+1). */
export function move(q: ChatQueue, id: string, by: -1 | 1): ChatQueue {
  const i = q.items.findIndex((m) => m.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= q.items.length) return q;
  const items = q.items.slice();
  [items[i], items[j]] = [items[j]!, items[i]!];
  return { ...q, items };
}

/** Whether a queued message can be steered now: the agent can steer and a turn is running. */
export const canSteerNow = (q: ChatQueue, agentCanSteer: boolean): boolean => agentCanSteer && q.status === "working";

/** Sends a queued message into the running turn; when idle it starts a turn with it instead. */
export function steerQueued(q: ChatQueue, id: string): QueueStep {
  const m = q.items.find((x) => x.id === id);
  if (!m) return { queue: q, effects: [] };
  const items = q.items.filter((x) => x.id !== id);
  const editingId = q.editingId === id ? null : q.editingId;
  if (q.status === "working") return { queue: { ...q, items, editingId }, effects: [{ kind: "steer", text: m.text, attachments: m.attachments }] };
  if (q.status === "cancelling") return { queue: q, effects: [] };
  return { queue: { ...q, items, editingId, status: "working", paused: false }, effects: [{ kind: "start", text: m.text, attachments: m.attachments }] };
}

/** Why the head is not sending yet, as shown in the queue header. */
export function headStatusLabel(q: ChatQueue): string | null {
  const head = q.items[0];
  if (!head) return null;
  if (q.paused) return "Queue paused";
  if (q.editingId === head.id) return "Editing queued message";
  if (q.status === "cancelling") return "Waiting for cancellation";
  return "Queued";
}

/** A queue edit from the composer's queue panel. */
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

/** The next queue (and effects) for a queue-panel action. */
export function actionStep(q: ChatQueue, action: QueueAction): QueueStep | ChatQueue {
  switch (action.kind) {
    case "delete":
      return remove(q, action.id);
    case "steer":
      return steerQueued(q, action.id);
    case "edit":
      return beginEdit(q, action.id);
    case "cancelEdit":
      return cancelEdit(q);
    case "saveEdit":
      return saveEdit(q, action.text, action.steer);
    case "move":
      return move(q, action.id, action.by);
    case "reorder":
      return reorder(q, action.ids);
    case "pause":
      return pause(q);
    case "resume":
      return resume(q);
  }
}
