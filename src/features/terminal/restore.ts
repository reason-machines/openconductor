// Restoring terminals after a relaunch ("cold restore"), as the reference does:
// the tab list is saved; a tab restored from it loads its saved screen by tab
// id, redraws it, prints a divider and starts a new shell in the saved cwd.
// Pure pieces only (storage format, restore output, save throttle); the PTY
// and xterm side is in session.ts.
import type { TabsState } from "./tabs.ts";

/** The reference's store name for the terminal panel's tabs. */
export const TABS_STORAGE_KEY = "terminal-panel-tabs-v1";

/** The reference's divider text, printed grey between the restored screen and the new shell. */
export const RESTORE_DIVIDER = "--- Previous terminal session restored. Starting new shell... ---";
export const dividerLine = (text: string) => `\r\n\x1b[90m${text}\x1b[0m\r\n`;

/** Longest wait between output and saving it (the reference's idle timeout). */
export const PERSIST_DELAY_MS = 1000;

export interface SavedTab {
  id: string;
  title: string;
  cwd: string;
}

export interface SavedWorkspace {
  tabs: SavedTab[];
  activeId: string | null;
  next: number;
}

type Saved = Record<string, SavedWorkspace>;

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isStr = (v: unknown): v is string => typeof v === "string";

function parseWorkspace(v: unknown): SavedWorkspace | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.tabs)) return undefined;
  const tabs = o.tabs.filter(
    (t): t is SavedTab => !!t && typeof t === "object" && isStr(t.id) && isStr(t.title) && isStr(t.cwd),
  );
  const activeId = isStr(o.activeId) && tabs.some((t) => t.id === o.activeId) ? o.activeId : (tabs[0]?.id ?? null);
  const next = typeof o.next === "number" && Number.isInteger(o.next) && o.next > 0 ? o.next : tabs.length + 1;
  return { tabs, activeId, next };
}

/** Every workspace's saved tabs; unreadable data reads as none. */
export function readSaved(store: KeyValue): Saved {
  let raw: unknown;
  try {
    raw = JSON.parse(store.getItem(TABS_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Saved = {};
  for (const [id, v] of Object.entries(raw)) {
    const w = parseWorkspace(v);
    if (w) out[id] = w;
  }
  return out;
}

/** Save one workspace's tabs, keeping every other workspace's as stored. */
export function writeWorkspace(store: KeyValue, workspaceId: string, state: TabsState, cwdOf: (id: string) => string | undefined) {
  const saved = readSaved(store);
  const tabs = state.tabs.flatMap((t) => {
    const cwd = cwdOf(t.id);
    return cwd === undefined ? [] : [{ id: t.id, title: t.title, cwd }];
  });
  if (tabs.length === 0) delete saved[workspaceId];
  else saved[workspaceId] = { tabs, activeId: state.activeId, next: state.next };
  try {
    store.setItem(TABS_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage full or unavailable: tabs just are not restored next launch.
  }
}

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
 * save (tab closed).
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

  cancel(id: string) {
    const h = this.pending.get(id);
    if (h !== undefined) this.timers.clear(h);
    this.pending.delete(id);
  }

  isPending = (id: string) => this.pending.has(id);

  private run(id: string): Promise<void> {
    const next = (this.chains.get(id) ?? Promise.resolve()).then(() => this.save(id)).catch(() => {});
    this.chains.set(id, next);
    void next.then(() => {
      if (this.chains.get(id) === next) this.chains.delete(id);
    });
    return next;
  }
}
