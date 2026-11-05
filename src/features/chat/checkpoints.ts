// parity:chat.revert-checkpoint:ui
// Turn checkpoints and "Reset chat", as Conductor does them (read from the
// shipped v0.87.6 app; see evidence/checkpoint/NOTES.md):
//
// - Before and after every agent turn the workspace is snapshotted to
//   `refs/conductor-checkpoints/session-<session>-turn-<turn>-<start|end>`
//   (`checkpointer.sh save --id … --force`). A skipped save (merge/rebase in
//   progress, unresolved conflicts) or a failed one is logged, never shown:
//   the turn runs either way.
// - "Reset chat" on a turn checks that the turn's `end` checkpoint exists
//   ("Checkpoint not found for this turn" otherwise), restores it when
//   "Also reset files" is on, and only then deletes the later messages.
// - The dialog's "N changed" is how many files differ between that `end`
//   checkpoint and the workspace now.
//
// The commands are in src-tauri/src/checkpoint_commands.rs. `invoke` is a
// parameter so the sequence is testable without Tauri.

export type Invoke = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
export type CheckpointPoint = "start" | "end";

/** Characters git refuses in a ref component (and our own ':' separator) become '-'. */
const refSafe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "-");

/** A turn id without its chat prefix: `ws1:t3` in chat `ws1` is `t3`. */
export function turnKey(chatId: string, turnId: string): string {
  const prefix = `${chatId}:`;
  return refSafe(turnId.startsWith(prefix) ? turnId.slice(prefix.length) : turnId);
}

/** Conductor's id scheme: `session-<sessionId>-turn-<turnId>-<start|end>`. */
export function checkpointId(chatId: string, turnId: string, point: CheckpointPoint): string {
  return `session-${refSafe(chatId)}-turn-${turnKey(chatId, turnId)}-${point}`;
}

/** Snapshot the workspace at a turn's start or end. Never throws. */
export async function saveTurnCheckpoint(invoke: Invoke, workspacePath: string, chatId: string, turnId: string, point: CheckpointPoint): Promise<void> {
  const id = checkpointId(chatId, turnId, point);
  try {
    const r = (await invoke("checkpoint_save", { workspacePath, checkpointId: id })) as { saved: boolean; skipped?: string };
    if (!r.saved) console.info(`[checkpoint] ${point} checkpoint ${id} skipped: ${r.skipped ?? "unknown reason"}`);
  } catch (e) {
    console.error(`[checkpoint] ${point} checkpoint ${id} failed:`, e);
  }
}

/** Files that differ between the turn's `end` checkpoint and the workspace now. */
export async function changedSinceTurn(invoke: Invoke, workspacePath: string, chatId: string, turnId: string): Promise<number> {
  return (await invoke("checkpoint_changed_count", { workspacePath, checkpointId: checkpointId(chatId, turnId, "end") })) as number;
}

/**
 * The file half of "Reset chat": with `resetFiles`, make the workspace match
 * the turn's `end` checkpoint. Throws before touching anything when the
 * checkpoint is missing; the caller deletes later messages only after this
 * resolves.
 */
export async function restoreCheckpoint(invoke: Invoke, workspacePath: string, chatId: string, turnId: string, resetFiles: boolean): Promise<void> {
  if (!resetFiles) return;
  const id = checkpointId(chatId, turnId, "end");
  if (!(await invoke("checkpoint_exists", { workspacePath, checkpointId: id }))) {
    console.error(`Checkpoint not found: ${id} (session=${chatId}, turn=${turnId}, path=${workspacePath})`);
    throw new Error("Checkpoint not found for this turn");
  }
  await invoke("checkpoint_restore", { workspacePath, checkpointId: id });
}

/** Conductor's storage key and default (on) for the "Also reset files" checkbox. */
export const RESET_FILES_KEY = "reset-chat-also-reset-files";

export function parseResetFilesPreference(value: string | null): boolean {
  return value !== "false";
}
