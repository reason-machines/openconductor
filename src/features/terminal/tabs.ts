// Terminal tabs of one workspace: pure state, no PTY or DOM.
// The panel dispatches `ready`/`exit` from pty events; ids are the PTY ids.

/** Tabs per workspace ("Allow up to 10 chat and terminal tabs per workspace"). */
export const MAX_TABS = 10;

export type TabStatus = "starting" | "running" | "exited";

export interface TerminalTab {
  id: string;
  title: string;
  status: TabStatus;
  exitCode?: number;
  signal?: string | null;
}

export interface TabsState {
  tabs: TerminalTab[];
  activeId: string | null;
  /** Number for the next tab's title; never reused within a workspace. */
  next: number;
}

export type TabsAction =
  | { type: "open"; id: string }
  | { type: "close"; id: string }
  | { type: "select"; id: string }
  | { type: "ready"; id: string }
  | { type: "exit"; id: string; exitCode: number; signal: string | null };

export const emptyTabs = (): TabsState => ({ tabs: [], activeId: null, next: 1 });

export const canOpen = (s: TabsState): boolean => s.tabs.length < MAX_TABS;

export function tabsReducer(s: TabsState, a: TabsAction): TabsState {
  switch (a.type) {
    case "open": {
      if (!canOpen(s) || s.tabs.some((t) => t.id === a.id)) return s;
      const tab: TerminalTab = { id: a.id, title: `Terminal ${s.next}`, status: "starting" };
      return { tabs: [...s.tabs, tab], activeId: a.id, next: s.next + 1 };
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
      return patch(s, a.id, (t) => (t.status === "starting" ? { ...t, status: "running" } : t));
    case "exit":
      return patch(s, a.id, (t) => ({ ...t, status: "exited", exitCode: a.exitCode, signal: a.signal }));
  }
}

function patch(s: TabsState, id: string, f: (t: TerminalTab) => TerminalTab): TabsState {
  if (!s.tabs.some((t) => t.id === id)) return s;
  return { ...s, tabs: s.tabs.map((t) => (t.id === id ? f(t) : t)) };
}
