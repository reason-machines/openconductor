// Live terminals: one xterm per PTY, kept alive while its tab exists so
// switching tabs or workspaces never loses output. Tab state per workspace
// lives here too (read with useSyncExternalStore), so exit events update a
// workspace's tabs even while its panel is not mounted.
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { AckBatcher, type PtyEvent } from "./events";
import { onPtyEvent, ptyAckBytes, ptyClearHistory, ptyKill, ptyResize, ptySpawn, ptyWrite } from "./pty";
import { canOpen, emptyTabs, tabsReducer, type TabsAction, type TabsState } from "./tabs";

interface Live {
  workspaceId: string;
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  ack: AckBatcher;
  opened: boolean;
}

const live = new Map<string, Live>();
const tabsByWorkspace = new Map<string, TabsState>();
const subscribers = new Set<() => void>();
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
    theme: { background: cssVar("--panel", "#1d2025"), foreground: cssVar("--text", "#e6e7e9") },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const host = document.createElement("div");
  host.className = "term-host";
  const ack = new AckBatcher((n) => void ptyAckBytes(id, n).catch(() => {}));
  // Registered before spawning so the first output is not dropped.
  live.set(id, { workspaceId, term, fit, host, ack, opened: false });
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
}
