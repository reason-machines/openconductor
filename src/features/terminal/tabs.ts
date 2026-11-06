// Terminal tabs of one workspace: pure state, no PTY or DOM.
// The panel dispatches `ready`/`exit` from pty events; ids are the PTY ids.

/** Chat and terminal tabs allowed per workspace: 5, or 10 with Tab Freak Mode (Conductor's `iFt`). */
export const tabLimit = (tabFreakMode: boolean): number => (tabFreakMode ? 10 : 5);

/** Most tabs a workspace's state ever holds ("Allow up to 10 chat and terminal tabs per workspace"). */
export const MAX_TABS = tabLimit(true);

/** Each workspace has one chat tab, and it counts toward the limit. */
export const CHAT_TABS = 1;

export type TabStatus = "starting" | "running" | "exited";

export interface TerminalTab {
  id: string;
  title: string;
  status: TabStatus;
  exitCode?: number;
  signal?: string | null;
  /** From the shell integration marks (shellIntegration.ts); shown after the title. */
  runningProgram?: string;
}

export interface TabsState {
  tabs: TerminalTab[];
  activeId: string | null;
  /** Number for the next tab's title; never reused within a workspace. */
  next: number;
}

export type TabsAction =
  /** `title` keeps a restored tab's saved title and leaves the counter alone. */
  | { type: "open"; id: string; title?: string }
  /** After restoring saved tabs: their active tab and title counter. */
  | { type: "restored"; activeId: string | null; next: number }
  | { type: "close"; id: string }
  | { type: "select"; id: string }
  | { type: "ready"; id: string }
  | { type: "exit"; id: string; exitCode: number; signal: string | null }
  | { type: "program"; id: string; runningProgram?: string };

export const emptyTabs = (): TabsState => ({ tabs: [], activeId: null, next: 1 });

export const canOpen = (s: TabsState): boolean => s.tabs.length < MAX_TABS;

/** Whether a new terminal tab fits under the limit (Conductor's `oFt`: chats + terminals >= limit). */
export const canOpenTerminal = (s: TabsState, tabFreakMode: boolean): boolean => CHAT_TABS + s.tabs.length < tabLimit(tabFreakMode);

export function tabsReducer(s: TabsState, a: TabsAction): TabsState {
  switch (a.type) {
    case "open": {
      if (!canOpen(s) || s.tabs.some((t) => t.id === a.id)) return s;
      const tab: TerminalTab = { id: a.id, title: a.title ?? `Terminal ${s.next}`, status: "starting" };
      return { tabs: [...s.tabs, tab], activeId: a.id, next: a.title === undefined ? s.next + 1 : s.next };
    }
    case "restored": {
      const activeId = s.tabs.some((t) => t.id === a.activeId) ? a.activeId : s.activeId;
      return { ...s, activeId, next: Math.max(s.next, a.next) };
    }
    case "close": {
      const i = s.tabs.findIndex((t) => t.id === a.id);
      if (i < 0) return s;
      const tabs = s.tabs.filter((t) => t.id !== a.id);
      // Closing the active tab selects its right neighbour, else its left one.
      const activeId = s.activeId !== a.id ? s.activeId : (tabs[i] ?? tabs[i - 1])?.id ?? null;
      return { ...s, tabs, activeId };
    }
    case "select":
      return s.tabs.some((t) => t.id === a.id) ? { ...s, activeId: a.id } : s;
    case "ready":
      return patch(s, a.id, (t) => ({ ...noProgram(t), status: t.status === "starting" ? "running" : t.status }));
    case "exit":
      return patch(s, a.id, (t) => ({ ...noProgram(t), status: "exited", exitCode: a.exitCode, signal: a.signal }));
    case "program":
      if (a.runningProgram === undefined) return patch(s, a.id, noProgram);
      return patch(s, a.id, (t) => ({ ...t, runningProgram: a.runningProgram }));
  }
}

function noProgram({ runningProgram: _, ...t }: TerminalTab): TerminalTab {
  return t;
}

function patch(s: TabsState, id: string, f: (t: TerminalTab) => TerminalTab): TabsState {
  if (!s.tabs.some((t) => t.id === id)) return s;
  return { ...s, tabs: s.tabs.map((t) => (t.id === id ? f(t) : t)) };
}
