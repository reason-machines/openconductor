// Restoring terminals after a relaunch ("cold restore"), as the reference does:
// the tab list is saved (tabList.ts); a tab restored from it loads its saved
// screen by tab id, redraws it, prints a divider and starts a new shell in the
// saved cwd. Pure pieces only (restore output, save throttle); the PTY and
// xterm side is in session.ts.

/** The reference's divider text, printed grey between the restored screen and the new shell. */
export const RESTORE_DIVIDER = "--- Previous terminal session restored. Starting new shell... ---";
export const dividerLine = (text: string) => `\r\n\x1b[90m${text}\x1b[0m\r\n`;

/** Longest wait between output and saving it (the reference's idle timeout). */
export const PERSIST_DELAY_MS = 1000;

/** `pty_load_terminal_history`'s record (src-tauri/src/terminal_history.rs). */
export interface HistoryRecord {
  localWorkspaceId: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string | null;
  hasReceivedUserInput: boolean;
  snapshotAnsi: string;
  rehydrateSequences: string;
  cwd?: string | null;
  cols: number;
  rows: number;
  alternateScreen: boolean;
  bracketedPaste: boolean;
}

/** What a restored tab's terminal is fed before its new shell's output: modes, then the screen, then the divider. */
export const restoreOutput = (r: HistoryRecord): string => r.rehydrateSequences + r.snapshotAnsi + dividerLine(RESTORE_DIVIDER);

/** Working directories to try for a restored tab's new shell, best first. */
export function restoreCwds(r: HistoryRecord | undefined, fallback: string): string[] {
  const saved = r?.cwd;
  return saved && saved !== fallback ? [saved, fallback] : [fallback];
}

export interface PersistArgs {
  id: string;
  localWorkspaceId: string;
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  hasReceivedUserInput: boolean;
}

export interface Timers {
  set(f: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/**
 * Saves per terminal, at most once per `delay` and never two at once for the
 * same terminal. `schedule` coalesces bursts of output into one save at most
 * `delay` later; `flush` saves now (exit, clear); `cancel` drops a pending
 * save; `drop` cancels and then runs `after` (deleting the saved session of a
 * closed tab) once a save already running has finished, so that save cannot
 * write the session back after it was deleted.
 */
export class PersistThrottle {
  private pending = new Map<string, unknown>();
  private chains = new Map<string, Promise<void>>();
  private save: (id: string) => Promise<void>;
  private timers: Timers;
  private delay: number;

  constructor(save: (id: string) => Promise<void>, timers: Timers, delay = PERSIST_DELAY_MS) {
    this.save = save;
    this.timers = timers;
    this.delay = delay;
  }

  schedule(id: string) {
    if (this.pending.has(id)) return;
    this.pending.set(
      id,
      this.timers.set(() => {
        this.pending.delete(id);
        void this.run(id);
      }, this.delay),
    );
  }

  flush(id: string): Promise<void> {
    this.cancel(id);
    return this.run(id);
  }

  drop(id: string, after: () => Promise<unknown>): Promise<void> {
    this.cancel(id);
    return this.run(id, after);
  }

  cancel(id: string) {
    const h = this.pending.get(id);
    if (h !== undefined) this.timers.clear(h);
    this.pending.delete(id);
  }

  isPending = (id: string) => this.pending.has(id);

  private run(id: string, step: () => Promise<unknown> = () => this.save(id)): Promise<void> {
    const next = (this.chains.get(id) ?? Promise.resolve())
      .then(step)
      .then(() => {})
      .catch(() => {});
    this.chains.set(id, next);
    void next.then(() => {
      if (this.chains.get(id) === next) this.chains.delete(id);
    });
    return next;
  }
}
