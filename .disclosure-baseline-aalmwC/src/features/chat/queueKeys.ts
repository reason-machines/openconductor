// Keyboard and drag handling for the queued-messages list. Conductor's queue
// list keeps one focused row (evidence/chat-queue/README.md, "Queue keys"):
// `chat.queue.editMessage` (E) edits it, `chat.queue.deleteMessage` (⌫)
// deletes it and focuses the next row (else the previous one),
// `chat.queue.steerMessage` (↵) steers with it when the agent can steer and
// focuses the next row (else the composer). ↑/↓, Home and End move between
// rows; ↓ past the last row and Esc go back to the composer. Rows reorder by
// drag, sending the full id order.
// Pure: no React, so `queueKeys.test.ts` covers it.

/** Where focus goes: a queued row by id, or the composer's message box. */
export type QueueFocus = { row: string } | "composer";

export type QueueKeyResult =
  | { kind: "edit"; id: string }
  | { kind: "delete"; id: string; focus: QueueFocus }
  | { kind: "steer"; id: string; focus: QueueFocus }
  | { kind: "focus"; focus: QueueFocus };

export type QueueCommand = "chat.queue.editMessage" | "chat.queue.deleteMessage" | "chat.queue.steerMessage";

/**
 * What a key pressed on the focused row `id` does, or null to let it through.
 * `hit` says whether the event matches a command's (possibly overridden) keys.
 */
export function queueRowKey(ids: readonly string[], id: string, key: string, hit: (command: QueueCommand) => boolean, canSteer: boolean): QueueKeyResult | null {
  const i = ids.indexOf(id);
  if (i < 0) return null;
  const neighbour = (): QueueFocus => {
    const n = ids[i + 1] ?? ids[i - 1];
    return n === undefined ? "composer" : { row: n };
  };
  if (hit("chat.queue.editMessage")) return { kind: "edit", id };
  if (hit("chat.queue.deleteMessage")) return { kind: "delete", id, focus: neighbour() };
  if (hit("chat.queue.steerMessage")) {
    if (!canSteer) return null;
    const next = ids[i + 1];
    return { kind: "steer", id, focus: next === undefined ? (i > 0 ? { row: ids[i - 1] } : "composer") : { row: next } };
  }
  switch (key) {
    case "ArrowDown":
      return { kind: "focus", focus: i + 1 < ids.length ? { row: ids[i + 1] } : "composer" };
    case "ArrowUp":
      return i > 0 ? { kind: "focus", focus: { row: ids[i - 1] } } : { kind: "focus", focus: { row: id } };
    case "Home":
      return { kind: "focus", focus: { row: ids[0] } };
    case "End":
      return { kind: "focus", focus: { row: ids[ids.length - 1] } };
    case "Escape":
      return { kind: "focus", focus: "composer" };
    default:
      return null;
  }
}

/** The id order after dropping `dragged` onto `target`'s place; unchanged for a drop on itself or an unknown id. */
export function dropOrder(ids: readonly string[], dragged: string, target: string): string[] {
  const from = ids.indexOf(dragged);
  const to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const out = ids.filter((x) => x !== dragged);
  out.splice(to, 0, dragged);
  return out;
}
