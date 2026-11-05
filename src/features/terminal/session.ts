// Live terminals: one xterm per PTY, kept alive while its tab exists so
// switching tabs or workspaces never loses output. Tab state per workspace
// lives here too (read with useSyncExternalStore), so exit events update a
// workspace's tabs even while its panel is not mounted.
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { AckBatcher, type PtyEvent } from "./events";
import { onPtyEvent, ptyAckBytes, ptyClearHistory, ptyKill, ptyResize, ptySpawn, ptyWrite } from "./pty";
import { canOpen, emptyTabs, tabsReducer, type TabsAction, type TabsState } from "./tabs";
import { FIND_COMMAND, LINE_EDIT_BYTES, terminalCommandFor } from "./shortcuts.ts";

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
}

const live = new Map<string, Live>();
const tabsByWorkspace = new Map<string, TabsState>();
const subscribers = new Set<() => void>();
/** Times Find in terminal was asked for, per tab; the panel opens its find bar on a change. */
const findRequests = new Map<string, number>();
const EMPTY = emptyTabs();
let listening: Promise<() => void> | null = null;

export const getTabs = (workspaceId: string): TabsState => tabsByWorkspace.get(workspaceId) ?? EMPTY;

export function subscribeTabs(f: () => void): () => void {
  subscribers.add(f);
  return () => subscribers.delete(f);
}

function dispatch(workspaceId: string, a: TabsAction) {
  tabsByWorkspace.set(workspaceId, tabsReducer(getTabs(workspaceId), a));
  subscribers.forEach((f) => f());
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
    return;
  }
  if (e.kind === "exit") {
    l.ack.flush();
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
export async function openTab(workspaceId: string, cwd: string, initialCommand?: string): Promise<string> {
  if (!canOpen(getTabs(workspaceId))) throw new Error("Tab limit reached for this workspace.");
  listening ??= onPtyEvent(route);
  await listening;

  const id = `term-${crypto.randomUUID()}`;
  const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    fontSize: 12,
    scrollback: 5000,
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
  live.set(id, { workspaceId, term, fit, host, ack, opened: false, cwd, initialCommand });
  term.attachCustomKeyEventHandler((e) => {
    const command = e.type === "keydown" ? terminalCommandFor(e) : undefined;
    if (command === undefined) return true;
    // Cancelling keydown also drops its keypress; stopping it keeps window shortcuts out.
    e.preventDefault();
    e.stopPropagation();
    runTerminalCommand(id, command);
    return false;
  });
  term.onData((d) => void ptyWrite(id, d).catch(() => {}));
  term.onResize(({ cols, rows }) => void ptyResize(id, cols, rows).catch(() => {}));
  dispatch(workspaceId, { type: "open", id });
  try {
    await ptySpawn({ id, cwd, cols: term.cols, rows: term.rows, initialCommand });
  } catch (err) {
    dispose(id);
    dispatch(workspaceId, { type: "close", id });
    throw err;
  }
  return id;
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
}

export function closeTab(workspaceId: string, id: string) {
  void ptyKill(id).catch(() => {});
  dispose(id);
  dispatch(workspaceId, { type: "close", id });
}

function dispose(id: string) {
  live.get(id)?.term.dispose();
  live.delete(id);
  findRequests.delete(id);
}
