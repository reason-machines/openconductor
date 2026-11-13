// Live terminals: one xterm per PTY, kept alive while its tab exists so
// switching tabs or workspaces never loses output. Tab state per workspace
// lives here too (read with useSyncExternalStore), so exit events update a
// workspace's tabs even while its panel is not mounted.
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { AckBatcher, type PtyEvent } from "./events";
import {
  onPtyEvent,
  ptyAckBytes,
  ptyClearHistory,
  ptyDeleteTerminalHistory,
  ptyDeleteWorkspaceTerminalHistory,
  ptyKill,
  ptyLoadTerminalHistory,
  ptyPersistTerminalHistory,
  ptyResize,
  ptySpawn,
  ptyWrite,
  ptyWriteMirror,
} from "./pty";
import { canOpen, canOpenTerminal, emptyTabs, tabsReducer, type TabsAction, type TabsState, type TerminalPlacement } from "./tabs";
import { PersistThrottle, restoreCwds, restoreOutput, type HistoryRecord } from "./restore";
import { subsystemStorage } from "./localStorage";
import { TABS_SIZE_LIMIT, TABS_SUBSYSTEM, TabListStore, savedWorkspace } from "./tabList";
import { getAppPrefs } from "../../settings/appPrefs";
import { FIND_COMMAND, LINE_EDIT_BYTES, terminalCommandFor } from "./shortcuts.ts";
import { currentTerminalFont, onTerminalFont, TERMINAL_LINE_HEIGHT } from "./font.ts";
import { currentScrollbackRows, onScrollbackRows } from "./scrollback.ts";
import { applySegments, emptyShellState, splitMarks, type ShellState } from "./shellIntegration.ts";
import { bigTabRequest } from "./bigTerminal.ts";

interface Live {
  workspaceId: string;
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  ack: AckBatcher;
  opened: boolean;
  appearance?: MutationObserver;
  /**
   * Opened by the app, not the user (a workspace's first terminal, restored
   * tabs). Its first attach leaves the keyboard where the user is typing.
   */
  quiet: boolean;
  /** Spawn settings, reused by a new tab opened from this one (the panel's command, not a big terminal's). */
  cwd: string;
  initialCommand?: string;
  launch: { cwds: string[]; initialCommand?: string };
  /** Saved-history fields (`pty_persist_terminal_history`). */
  startedAt: string;
  endedAt?: string;
  hasReceivedUserInput: boolean;
  /** Shell integration: output decoded as a stream, marks stripped and tracked. */
  decoder: TextDecoder;
  shell: ShellState;
}

const live = new Map<string, Live>();
const tabsByWorkspace = new Map<string, TabsState>();
const workspaceLifetimes = new Map<string, symbol>();

function workspaceLifetime(workspaceId: string): symbol {
  let lifetime = workspaceLifetimes.get(workspaceId);
  if (lifetime === undefined) workspaceLifetimes.set(workspaceId, (lifetime = Symbol()));
  return lifetime;
}
const panelWorkspaceOrder = new Set<string>();
const subscribers = new Set<() => void>();
const centerTabListeners = new Set<(workspaceId: string, id: string) => void>();

export function onCenterTabOpened(listener: (workspaceId: string, id: string) => void): () => void {
  centerTabListeners.add(listener);
  return () => { centerTabListeners.delete(listener); };
}
/** Times Find in terminal was asked for, per tab; the panel opens its find bar on a change. */
const findRequests = new Map<string, number>();
const EMPTY = emptyTabs();
let listening: Promise<() => void> | null = null;
/** Workspaces whose saved tabs were restored this launch; only these write the tab list. */
const hydrated = new Set<string>();
/** The saved tab list, in the reference's `terminal` local-storage subsystem. */
const tabList = new TabListStore(
  subsystemStorage(TABS_SUBSYSTEM, TABS_SIZE_LIMIT),
  typeof localStorage === "undefined" ? undefined : localStorage,
  (e) => console.error("Failed to save or load the terminal tab list", e),
);

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

export function getResourceTerminalLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  let panelNumber = 0;
  for (const workspaceId of panelWorkspaceOrder) {
    for (const tab of getTabs(workspaceId).tabs) {
      if (tab.placement !== "center") labels[tab.id] = `Terminal ${++panelNumber}`;
    }
  }
  let centerNumber = 0;
  for (const [id, terminal] of live) {
    if (getTabs(terminal.workspaceId).tabs.some((tab) => tab.id === id && tab.placement === "center")) {
      labels[id] = `Terminal tab ${++centerNumber}`;
    }
  }
  return labels;
}

export function subscribeTabs(f: () => void): () => void {
  subscribers.add(f);
  return () => subscribers.delete(f);
}

function dispatch(workspaceId: string, a: TabsAction) {
  const next = tabsReducer(getTabs(workspaceId), a);
  tabsByWorkspace.set(workspaceId, next);
  if (a.type === "open" && a.placement !== "center") panelWorkspaceOrder.add(workspaceId);
  saveTabs(workspaceId, next);
  subscribers.forEach((f) => f());
}

function saveTabs(workspaceId: string, state: TabsState) {
  if (hydrated.has(workspaceId)) void tabList.setWorkspace(workspaceId, savedWorkspace(state, (id) => live.get(id)?.cwd), "terminal");
}

export const getFindRequests = (id: string): number => findRequests.get(id) ?? 0;

/** The live xterm of tab `id`, for the find bar. */
export const terminalOf = (id: string): Terminal | undefined => live.get(id)?.term;

export function spawnErrorOf(id: string): string | undefined {
  const terminal = live.get(id);
  return terminal ? getTabs(terminal.workspaceId).tabs.find((tab) => tab.id === id)?.spawnError : undefined;
}

export async function retryTab(id: string): Promise<void> {
  const terminal = live.get(id);
  if (!terminal || getTabs(terminal.workspaceId).tabs.find((tab) => tab.id === id)?.status !== "spawn_error") return;
  dispatch(terminal.workspaceId, { type: "retry", id });
  await spawnTerminal(id, terminal);
}

export const selectTab = (workspaceId: string, id: string) => dispatch(workspaceId, { type: "select", id });

function route(e: PtyEvent) {
  const l = live.get(e.id);
  if (!l) return;
  if (e.kind === "data") {
    const n = e.data.length;
    const { sanitized, segments } = splitMarks(l.decoder.decode(e.data, { stream: true }));
    if (applySegments(l.shell, segments)) dispatch(l.workspaceId, { type: "program", id: e.id, runningProgram: l.shell.runningProgram });
    // Bytes that were only marks are acked at once, as in the reference.
    if (sanitized.length > 0) l.term.write(sanitized, () => l.ack.rendered(n));
    else l.ack.rendered(n);
    persist.schedule(e.id);
    return;
  }
  // Ready and exit both forget tracked commands, as in the reference.
  l.shell = emptyShellState();
  l.term.options.disableStdin = e.kind !== "ready";
  l.term.options.theme = { ...l.term.options.theme, cursor: e.kind === "ready" ? cssVar("--text") : "transparent", cursorAccent: cssVar("--panel") };
  if (e.kind === "exit") {
    l.ack.flush();
    l.endedAt = new Date().toISOString();
    void persist.flush(e.id);
    const how = e.signal ? `signal ${e.signal}` : `code ${e.exitCode}`;
    l.term.write(`\r\n\x1b[2m[Process exited with ${how}]\x1b[0m\r\n`);
  }
  dispatch(l.workspaceId, e.kind === "ready" ? { type: "ready", id: e.id } : { type: "exit", id: e.id, exitCode: e.exitCode, signal: e.signal });
}

/** A colour token from src/theme/tokens.css; undefined (xterm's default) if it is not set. */
function cssVar(name: string): string | undefined {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined;
}

/** `#rrggbb` plus an alpha byte; other colour forms pass through unchanged. */
const withAlpha = (hex: string | undefined, alpha: string) => (hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex + alpha : hex);

/**
 * Open a new tab running the login shell in `cwd`; resolves to its id. `quiet`
 * when the app opens it by itself, so it does not take focus from a text field.
 */
export const openTab = (workspaceId: string, cwd: string, initialCommand?: string, opts: { quiet?: boolean } = {}): Promise<string> =>
  startTab(workspaceId, cwd, initialCommand, undefined, undefined, opts.quiet);

/**
 * Open a center tab running the Big terminal preset, then navigate to it.
 * Saved tabs restore first; their commands are never run again.
 */
export async function openBigTab(workspaceId: string, cwd: string, run: { command: string | undefined }, initialCommand?: string): Promise<string> {
  const lifetime = workspaceLifetime(workspaceId);
  await restoreWorkspaceTabs(workspaceId, cwd, initialCommand);
  if (workspaceLifetimes.get(workspaceId) !== lifetime) throw new Error("Terminal startup cancelled");
  return startTab(workspaceId, cwd, initialCommand, undefined, run, false, "center");
}

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
  const lifetime = workspaceLifetime(workspaceId);
  const saved = await tabList.workspace(workspaceId);
  if (workspaceLifetimes.get(workspaceId) !== lifetime) return;
  for (const tab of saved?.tabs ?? []) {
    if (live.has(tab.id)) continue;
    await startTab(workspaceId, cwd, initialCommand, { id: tab.id, title: tab.title }, undefined, true, tab.placement).catch(() => {});
    if (workspaceLifetimes.get(workspaceId) !== lifetime) return;
  }
  hydrated.add(workspaceId);
  dispatch(workspaceId, { type: "restored", activeId: saved?.activeId ?? null, next: saved?.next ?? 1 });
}

/**
 * `initialCommand` is the panel's auto-run command, kept for tabs opened from
 * this one; `run` overrides what this tab alone runs (a big terminal's preset,
 * `undefined` command for a plain shell).
 */
async function startTab(
  workspaceId: string,
  cwd: string,
  initialCommand?: string,
  restore?: { id: string; title: string },
  run?: { command: string | undefined },
  quiet = false,
  placement: TerminalPlacement = "panel",
): Promise<string> {
  const lifetime = workspaceLifetime(workspaceId);
  // Saved tabs come back as they were; new ones respect Tab Freak Mode's limit.
  const tabs = getTabs(workspaceId);
  if (!canOpen(tabs) || (!restore && !canOpenTerminal(tabs, getAppPrefs().experimental_tab_freak_mode)))
    throw new Error("Tab limit reached for this workspace.");
  listening ??= onPtyEvent(route);
  await listening;
  persistOnHide();
  const record: HistoryRecord | undefined = restore ? await ptyLoadTerminalHistory(restore.id).catch(() => undefined) : undefined;
  if (workspaceLifetimes.get(workspaceId) !== lifetime) throw new Error("Terminal startup cancelled");

  const id = restore?.id ?? `term-${crypto.randomUUID()}`;
  const font = currentTerminalFont();
  const term = new Terminal({
    allowProposedApi: true,
    convertEol: true,
    disableStdin: true,
    cursorBlink: true,
    fontFamily: font.family,
    fontSize: font.size,
    lineHeight: TERMINAL_LINE_HEIGHT,
    scrollback: currentScrollbackRows(),
    theme: {
      background: cssVar("--panel"),
      foreground: cssVar("--text"),
      cursor: "transparent",
      cursorAccent: cssVar("--panel"),
      // xterm's default selection is pale white, invisible on the light theme.
      // The inactive colour matters for Find: the match is selected while the
      // find input, not the terminal, has focus.
      selectionBackground: withAlpha(cssVar("--accent"), "66"),
      selectionInactiveBackground: withAlpha(cssVar("--accent"), "4d"),
      black: cssVar("--terminal-black"),
      red: cssVar("--terminal-red"),
      green: cssVar("--terminal-green"),
      yellow: cssVar("--terminal-yellow"),
      blue: cssVar("--terminal-blue"),
      magenta: cssVar("--terminal-magenta"),
      cyan: cssVar("--terminal-cyan"),
      white: cssVar("--terminal-white"),
      brightBlack: cssVar("--terminal-bright-black"),
      brightRed: cssVar("--terminal-bright-red"),
      brightGreen: cssVar("--terminal-bright-green"),
      brightYellow: cssVar("--terminal-bright-yellow"),
      brightBlue: cssVar("--terminal-bright-blue"),
      brightMagenta: cssVar("--terminal-bright-magenta"),
      brightCyan: cssVar("--terminal-bright-cyan"),
      brightWhite: cssVar("--terminal-bright-white"),
    },
  });
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = "11";
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
  const terminal: Live = {
    workspaceId,
    term,
    fit,
    host,
    ack,
    opened: false,
    quiet,
    cwd,
    initialCommand,
    launch: { cwds: restore ? restoreCwds(record, cwd) : [cwd], initialCommand: run ? run.command : initialCommand },
    startedAt: record?.startedAt ?? new Date().toISOString(),
    hasReceivedUserInput: record?.hasReceivedUserInput ?? false,
    decoder: new TextDecoder(),
    shell: emptyShellState(),
  };
  live.set(id, terminal);
  if (typeof MutationObserver !== "undefined") {
    terminal.appearance = new MutationObserver(() => {
      if (live.get(id) !== terminal) return;
      term.options.theme = {
        background: cssVar("--panel"),
        foreground: cssVar("--text"),
        cursor: term.options.disableStdin ? "transparent" : cssVar("--text"),
        cursorAccent: cssVar("--panel"),
        selectionBackground: withAlpha(cssVar("--accent"), "66"),
        selectionInactiveBackground: withAlpha(cssVar("--accent"), "4d"),
        black: cssVar("--terminal-black"),
        red: cssVar("--terminal-red"),
        green: cssVar("--terminal-green"),
        yellow: cssVar("--terminal-yellow"),
        blue: cssVar("--terminal-blue"),
        magenta: cssVar("--terminal-magenta"),
        cyan: cssVar("--terminal-cyan"),
        white: cssVar("--terminal-white"),
        brightBlack: cssVar("--terminal-bright-black"),
        brightRed: cssVar("--terminal-bright-red"),
        brightGreen: cssVar("--terminal-bright-green"),
        brightYellow: cssVar("--terminal-bright-yellow"),
        brightBlue: cssVar("--terminal-bright-blue"),
        brightMagenta: cssVar("--terminal-bright-magenta"),
        brightCyan: cssVar("--terminal-bright-cyan"),
        brightWhite: cssVar("--terminal-bright-white"),
      };
    });
    terminal.appearance.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-color-palette", "data-low-contrast"],
    });
  }
  term.attachCustomKeyEventHandler((e) => {
    const command = e.type === "keydown" ? terminalCommandFor(e) : undefined;
    if (command === undefined) return true;
    if (
      term.buffer.active !== term.buffer.normal &&
      (command === "terminal.clearScrollback" || (command !== "terminal.insertNewline" && LINE_EDIT_BYTES[command] !== undefined))
    ) return true;
    // Cancelling keydown also drops its keypress; stopping it keeps window shortcuts out.
    e.preventDefault();
    e.stopPropagation();
    runTerminalCommand(id, command);
    return false;
  });
  term.onData((d) => writeInput(id, d));
  term.onResize(({ cols, rows }) => void ptyResize(id, cols, rows).catch(() => {}));
  dispatch(workspaceId, { type: "open", id, title: restore?.title, placement });
  if (placement === "center") centerTabListeners.forEach((listener) => listener(workspaceId, id));
  await spawnTerminal(id, terminal);
  return id;
}

async function spawnTerminal(id: string, terminal: Live): Promise<void> {
  try {
    await spawnIn(terminal.launch.cwds, async (cwd) => {
      const { cols, rows } = terminal.term;
      await ptySpawn({ id, cwd, cols, rows, initialCommand: terminal.launch.initialCommand });
      if (
        live.get(id) === terminal &&
        getTabs(terminal.workspaceId).tabs.some((tab) => tab.id === id && tab.status !== "exited") &&
        (terminal.term.cols !== cols || terminal.term.rows !== rows)
      ) {
        void ptyResize(id, terminal.term.cols, terminal.term.rows).catch(() => {});
      }
    });
    if (live.get(id) !== terminal) void ptyKill(id).catch(() => {});
  } catch (error) {
    if (live.get(id) === terminal) {
      terminal.term.options.disableStdin = true;
      terminal.term.options.theme = { ...terminal.term.options.theme, cursor: "transparent", cursorAccent: cssVar("--panel") };
      dispatch(terminal.workspaceId, { type: "failed", id, error: error instanceof Error ? error.message : String(error) });
    }
    throw error;
  }
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

/** Focus is in a text field outside the terminal panel: the chat box, a dialog's input. */
function typingElsewhere(): boolean {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement) || a.closest(".terminal-panel")) return false;
  return a.isContentEditable || a instanceof HTMLTextAreaElement || a instanceof HTMLInputElement || a instanceof HTMLSelectElement;
}

// Conductor's `w9e` toasts "Failed to attach terminal" when a terminal's screen cannot be
// attached (renderApp-D_fmY7hW.js ~6,878,113); the app shell listens here and shows it.
const attachFailureListeners = new Set<(error: unknown) => void>();
export const ATTACH_FAILED = "Failed to attach terminal";
export function onAttachFailure(f: (error: unknown) => void): () => void {
  attachFailureListeners.add(f);
  return () => void attachFailureListeners.delete(f);
}

/** Show terminal `id` inside `container`; returns the detach function. */
export function attachTab(id: string, container: HTMLElement): () => void {
  const l = live.get(id);
  if (!l) return () => {};
  container.appendChild(l.host);
  if (!l.opened) {
    try {
      l.term.open(l.host);
    } catch (err) {
      l.host.remove();
      console.error(ATTACH_FAILED, err);
      for (const f of attachFailureListeners) f(err);
      return () => {};
    }
    l.opened = true;
  }
  const refit = () => {
    if (l.host.clientWidth > 0) l.fit.fit();
  };
  refit();
  // A tab takes the keyboard when shown. A quiet tab's first showing lands a
  // moment after the workspace opens (it waits on the PTY listener), so it
  // leaves focus in a text field the user is typing in, such as the chat box.
  if (!(l.quiet && typingElsewhere())) l.term.focus();
  l.quiet = false;
  const ro = new ResizeObserver(refit);
  ro.observe(container);
  return () => {
    ro.disconnect();
    l.host.remove();
  };
}

function writeInput(id: string, data: string) {
  const l = live.get(id);
  if (!l || l.term.options.disableStdin || getTabs(l.workspaceId).tabs.find((tab) => tab.id === id)?.status !== "running") return;
  if (data.length > 0) l.hasReceivedUserInput = true;
  void ptyWrite(id, data).catch(() => {});
}

function runTerminalCommand(id: string, command: string) {
  const l = live.get(id);
  if (!l) return;
  const bytes = LINE_EDIT_BYTES[command];
  if (bytes !== undefined) writeInput(id, bytes);
  else if (command === "terminal.clearScrollback") clearTab(id);
  else if (command === FIND_COMMAND) {
    findRequests.set(id, getFindRequests(id) + 1);
    subscribers.forEach((f) => f());
  }
  else if (command === "terminal.closeTab") closeTab(l.workspaceId, id);
  else if (command === "terminal.newTab") void openTab(l.workspaceId, l.cwd, l.initialCommand).catch(() => {});
  else if (command === "terminal.newBigTab") {
    const big = bigTabRequest();
    if (big) void openBigTab(l.workspaceId, l.cwd, big, l.initialCommand).catch(() => {});
  }
}

export function clearTab(id: string) {
  const l = live.get(id);
  l?.term.clear();
  if (l && !l.term.options.disableStdin && getTabs(l.workspaceId).tabs.find((tab) => tab.id === id)?.status === "running") {
    void ptyWrite(id, "\x0c").catch(() => {});
  }
  void ptyClearHistory(id).catch(() => {});
  // Clear the backend screen too, as the reference does, so saved history does not bring it back.
  void ptyWriteMirror(id, "\x1b[H\x1b[2J\x1b[3J")
    .catch(() => {})
    .then(() => persist.flush(id));
}

export function closeTab(workspaceId: string, id: string) {
  void ptyKill(id).catch(() => {});
  dispose(id);
  dispatch(workspaceId, { type: "close", id });
  void forget(id);
}

/**
 * Delete tab `id`'s saved session, as the reference does for every terminal
 * that leaves its tab stores; after any save already running, so that save
 * cannot bring it back.
 */
const forget = (id: string): Promise<void> => persist.drop(id, () => ptyDeleteTerminalHistory(id));

/**
 * End every terminal of `workspaceId` and delete what was saved for it: its
 * tab list and every saved session, including ones from earlier launches that
 * were never restored in this one. The reference does this when a workspace
 * is archived or its repository removed (`destroyAllWorkspaceTerminalInstances`).
 */
export async function destroyWorkspaceTerminals(workspaceId: string): Promise<void> {
  workspaceLifetimes.delete(workspaceId);
  restoring.delete(workspaceId);
  const ids = getTabs(workspaceId).tabs.map((t) => t.id);
  for (const id of ids) {
    void ptyKill(id).catch(() => {});
    dispose(id);
  }
  tabsByWorkspace.delete(workspaceId);
  panelWorkspaceOrder.delete(workspaceId);
  hydrated.delete(workspaceId);
  void tabList.setWorkspace(workspaceId, undefined);
  subscribers.forEach((f) => f());
  await Promise.all(ids.map(forget));
  await ptyDeleteWorkspaceTerminalHistory(workspaceId).catch(() => {});
}

function dispose(id: string) {
  live.get(id)?.appearance?.disconnect();
  live.get(id)?.term.dispose();
  live.delete(id);
  findRequests.delete(id);
}
