// Live terminals: one xterm per PTY, kept alive while its tab exists so
// switching tabs or workspaces never loses output. Tab state per workspace
// lives here too (read with useSyncExternalStore), so exit events update a
// workspace's tabs even while its panel is not mounted.
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { AckBatcher, type PtyEvent } from "./events";
import {
  onPtyEvent,
  ptyAckBytes,
  ptyClearHistory,
  ptyKill,
  ptyLoadTerminalHistory,
  ptyPersistTerminalHistory,
  ptyResize,
  ptySpawn,
  ptyWrite,
  ptyWriteMirror,
} from "./pty";
import { canOpen, emptyTabs, tabsReducer, type TabsAction, type TabsState } from "./tabs";
import { PersistThrottle, readSaved, restoreCwds, restoreOutput, writeWorkspace, type HistoryRecord } from "./restore";
import { FIND_COMMAND, LINE_EDIT_BYTES, terminalCommandFor } from "./shortcuts.ts";
import { currentTerminalFont, onTerminalFont, TERMINAL_LINE_HEIGHT } from "./font.ts";
import { currentScrollbackRows, onScrollbackRows } from "./scrollback.ts";

interface Live {
  workspaceId: string;
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  ack: AckBatcher;
  opened: boolean;
  /** Spawn settings, reused by a new tab opened from this one. */
  cwd: string;
  initialCommand?: string;
  /** Saved-history fields (`pty_persist_terminal_history`). */
  startedAt: string;
  endedAt?: string;
  hasReceivedUserInput: boolean;
}

const live = new Map<string, Live>();
const tabsByWorkspace = new Map<string, TabsState>();
const subscribers = new Set<() => void>();
/** Times Find in terminal was asked for, per tab; the panel opens its find bar on a change. */
const findRequests = new Map<string, number>();
const EMPTY = emptyTabs();
let listening: Promise<() => void> | null = null;
/** Workspaces whose saved tabs were restored this launch; only these write the tab list. */
const hydrated = new Set<string>();
const storage = (): Storage | undefined => (typeof localStorage === "undefined" ? undefined : localStorage);

// Tab id doubles as the PTY id and the saved session's id.
const persist = new PersistThrottle(async (id) => {
  const l = live.get(id);
  if (!l) return;
  await ptyPersistTerminalHistory({
    id,
    localWorkspaceId: l.workspaceId,
    sessionId: id,
    startedAt: l.startedAt,
    endedAt: l.endedAt ?? null,
    hasReceivedUserInput: l.hasReceivedUserInput,
  });
}, { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) });

// A Terminal font change reaches every open terminal at once, as in Conductor;
// a shown one refits, so its PTY hears the new cols and rows.
onTerminalFont((font) => {
  for (const l of live.values()) {
    l.term.options.fontFamily = font.family;
    l.term.options.fontSize = font.size;
    if (l.opened && l.host.clientWidth > 0) l.fit.fit();
  }
});

// A Scrollback limit change reaches every open terminal at once, as in
// Conductor; xterm trims a shrunk buffer from the top.
onScrollbackRows((rows) => {
  for (const l of live.values()) l.term.options.scrollback = rows;
});

let flushOnHide = false;
function persistOnHide() {
  if (flushOnHide || typeof window === "undefined") return;
  flushOnHide = true;
  // Best effort when the window goes away; the throttle already saved within a second of the last output.
  window.addEventListener("pagehide", () => live.forEach((_, id) => void persist.flush(id)));
}

export const getTabs = (workspaceId: string): TabsState => tabsByWorkspace.get(workspaceId) ?? EMPTY;

export function subscribeTabs(f: () => void): () => void {
  subscribers.add(f);
  return () => subscribers.delete(f);
}

function dispatch(workspaceId: string, a: TabsAction) {
  const next = tabsReducer(getTabs(workspaceId), a);
  tabsByWorkspace.set(workspaceId, next);
  saveTabs(workspaceId, next);
  subscribers.forEach((f) => f());
}

function saveTabs(workspaceId: string, state: TabsState) {
  const store = storage();
  if (store && hydrated.has(workspaceId)) writeWorkspace(store, workspaceId, state, (id) => live.get(id)?.cwd);
}

export const getFindRequests = (id: string): number => findRequests.get(id) ?? 0;

/** The live xterm of tab `id`, for the find bar. */
export const terminalOf = (id: string): Terminal | undefined => live.get(id)?.term;

export const selectTab = (workspaceId: string, id: string) => dispatch(workspaceId, { type: "select", id });

function route(e: PtyEvent) {
  const l = live.get(e.id);
  if (!l) return;
  if (e.kind === "data") {
    const n = e.data.length;
    l.term.write(e.data, () => l.ack.rendered(n));
    persist.schedule(e.id);
    return;
  }
  if (e.kind === "exit") {
    l.ack.flush();
    l.endedAt = new Date().toISOString();
    void persist.flush(e.id);
    const how = e.signal ? `signal ${e.signal}` : `code ${e.exitCode}`;
    l.term.write(`\r\n\x1b[2m[Process exited with ${how}]\x1b[0m\r\n`);
  }
  dispatch(l.workspaceId, e.kind === "ready" ? { type: "ready", id: e.id } : { type: "exit", id: e.id, exitCode: e.exitCode, signal: e.signal });
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** `#rrggbb` plus an alpha byte; other colour forms pass through unchanged. */
const withAlpha = (hex: string, alpha: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? hex + alpha : hex);

/** Open a new tab running the login shell in `cwd`; resolves to its id. */
export const openTab = (workspaceId: string, cwd: string, initialCommand?: string): Promise<string> =>
  startTab(workspaceId, cwd, initialCommand);

/**
 * Reopen the tabs `workspaceId` had when the app last ran, each with its saved
 * screen (if any) above a divider and a new shell. Runs once per workspace per
 * launch; resolves to whether the workspace now has tabs.
 */
export function restoreWorkspaceTabs(workspaceId: string, cwd: string, initialCommand?: string): Promise<boolean> {
  let p = restoring.get(workspaceId);
  if (!p) restoring.set(workspaceId, (p = restoreOnce(workspaceId, cwd, initialCommand)));
  return p.then(() => getTabs(workspaceId).tabs.length > 0);
}
const restoring = new Map<string, Promise<void>>();

async function restoreOnce(workspaceId: string, cwd: string, initialCommand?: string): Promise<void> {
  const store = storage();
  const saved = store ? readSaved(store)[workspaceId] : undefined;
  for (const tab of saved?.tabs ?? []) {
    if (live.has(tab.id)) continue;
    await startTab(workspaceId, cwd, initialCommand, { id: tab.id, title: tab.title }).catch(() => {});
  }
  hydrated.add(workspaceId);
  dispatch(workspaceId, { type: "restored", activeId: saved?.activeId ?? null, next: saved?.next ?? 1 });
}

async function startTab(workspaceId: string, cwd: string, initialCommand?: string, restore?: { id: string; title: string }): Promise<string> {
  if (!canOpen(getTabs(workspaceId))) throw new Error("Tab limit reached for this workspace.");
  listening ??= onPtyEvent(route);
  await listening;
  persistOnHide();
  const record: HistoryRecord | undefined = restore ? await ptyLoadTerminalHistory(restore.id).catch(() => undefined) : undefined;

  const id = restore?.id ?? `term-${crypto.randomUUID()}`;
  const font = currentTerminalFont();
  const term = new Terminal({
    cursorBlink: true,
    fontFamily: font.family,
    fontSize: font.size,
    lineHeight: TERMINAL_LINE_HEIGHT,
    scrollback: currentScrollbackRows(),
    theme: {
      background: cssVar("--panel", "#1d2025"),
      foreground: cssVar("--text", "#e6e7e9"),
      // xterm's default selection is pale white, invisible on the light theme.
      // The inactive colour matters for Find: the match is selected while the
      // find input, not the terminal, has focus.
      selectionBackground: withAlpha(cssVar("--accent", "#5b82f0"), "66"),
      selectionInactiveBackground: withAlpha(cssVar("--accent", "#5b82f0"), "4d"),
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const host = document.createElement("div");
  host.className = "term-host";
  const ack = new AckBatcher((n) => void ptyAckBytes(id, n).catch(() => {}));
  // Registered before spawning so the first output is not dropped.
  if (record) {
    // At the saved size so wrapped rows land where they were; attaching refits.
    term.resize(Math.max(record.cols, 1), Math.max(record.rows, 1));
    term.write(restoreOutput(record));
  }
  live.set(id, {
    workspaceId,
    term,
    fit,
    host,
    ack,
    opened: false,
    cwd,
    initialCommand,
    startedAt: record?.startedAt ?? new Date().toISOString(),
    hasReceivedUserInput: record?.hasReceivedUserInput ?? false,
  });
  term.attachCustomKeyEventHandler((e) => {
    const command = e.type === "keydown" ? terminalCommandFor(e) : undefined;
    if (command === undefined) return true;
    // Cancelling keydown also drops its keypress; stopping it keeps window shortcuts out.
    e.preventDefault();
    e.stopPropagation();
    runTerminalCommand(id, command);
    return false;
  });
  term.onData((d) => {
    const l = live.get(id);
    if (l && d.length > 0) l.hasReceivedUserInput = true;
    void ptyWrite(id, d).catch(() => {});
  });
  term.onResize(({ cols, rows }) => void ptyResize(id, cols, rows).catch(() => {}));
  dispatch(workspaceId, { type: "open", id, title: restore?.title });
  try {
    await spawnIn(restore ? restoreCwds(record, cwd) : [cwd], (dir) =>
      ptySpawn({ id, cwd: dir, cols: term.cols, rows: term.rows, initialCommand }),
    );
  } catch (err) {
    dispose(id);
    dispatch(workspaceId, { type: "close", id });
    throw err;
  }
  return id;
}

/** Spawn in the first directory that works (a restored tab's saved cwd may be gone). */
async function spawnIn(dirs: string[], spawn: (dir: string) => Promise<unknown>) {
  for (let i = 0; ; i++) {
    try {
      return await spawn(dirs[i]);
    } catch (err) {
      if (i >= dirs.length - 1) throw err;
    }
  }
}

/** Show terminal `id` inside `container`; returns the detach function. */
export function attachTab(id: string, container: HTMLElement): () => void {
  const l = live.get(id);
  if (!l) return () => {};
  container.appendChild(l.host);
  if (!l.opened) {
    l.term.open(l.host);
    l.opened = true;
  }
  const refit = () => {
    if (l.host.clientWidth > 0) l.fit.fit();
  };
  refit();
  l.term.focus();
  const ro = new ResizeObserver(refit);
  ro.observe(container);
  return () => {
    ro.disconnect();
    l.host.remove();
  };
}

function runTerminalCommand(id: string, command: string) {
  const l = live.get(id);
  if (!l) return;
  const bytes = LINE_EDIT_BYTES[command];
  if (bytes !== undefined) void ptyWrite(id, bytes).catch(() => {});
  else if (command === "terminal.clearScrollback") clearTab(id);
  else if (command === FIND_COMMAND) {
    findRequests.set(id, getFindRequests(id) + 1);
    subscribers.forEach((f) => f());
  }
  else if (command === "terminal.closeTab") closeTab(l.workspaceId, id);
  else if (command === "terminal.newTab" || command === "terminal.newBigTab")
    void openTab(l.workspaceId, l.cwd, l.initialCommand).catch(() => {});
}

export function clearTab(id: string) {
  live.get(id)?.term.clear();
  void ptyClearHistory(id).catch(() => {});
  // Clear the backend screen too, as the reference does, so saved history does not bring it back.
  void ptyWriteMirror(id, "\x1b[H\x1b[2J\x1b[3J")
    .catch(() => {})
    .then(() => persist.flush(id));
}

export function closeTab(workspaceId: string, id: string) {
  persist.cancel(id);
  void ptyKill(id).catch(() => {});
  dispose(id);
  dispatch(workspaceId, { type: "close", id });
}

function dispose(id: string) {
  live.get(id)?.term.dispose();
  live.delete(id);
  findRequests.delete(id);
}
