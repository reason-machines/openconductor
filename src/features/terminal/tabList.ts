// The terminal panel's saved tab list, kept as the reference keeps it: entry
// `terminal-panel-tabs-v1` of the `terminal` local-storage subsystem (plain
// `subsystemStore`, 100 MiB), holding zustand's persisted string
// `{"state":{terminals, workspaceTerminals, activeTabPerWorkspace, lastTabKind},"version":2}`
// (index-BGEQ8YjU.js bytes 2806549-2809900; see evidence/terminal/local-storage-terminal.md).
// Pure pieces plus a store that keeps the whole list in memory and writes it
// whole after each change, one write at a time, as zustand's persist does.
import type { TabsState } from "./tabs.ts";

/** The reference's store name for the terminal panel's tabs. */
export const TABS_STORAGE_KEY = "terminal-panel-tabs-v1";
/** The local-storage subsystem holding it, and that subsystem's limit. */
export const TABS_SUBSYSTEM = "terminal";
export const TABS_SIZE_LIMIT = 100 * 1024 * 1024;
/** zustand persist version of the reference's terminal store. */
export const TABS_VERSION = 2;
/** The reference's `lastTabKind` when nothing set it. */
const DEFAULT_LAST_TAB_KIND = "spotlight";

export interface SavedTab {
  id: string;
  title: string;
  /** Where the tab's shell was when saved; the reference keeps it optional. */
  cwd?: string;
}

export interface SavedWorkspace {
  tabs: SavedTab[];
  activeId: string | null;
  next: number;
}

export interface TabList {
  workspaces: Record<string, SavedWorkspace>;
  lastTabKind: string;
}

export const emptyTabList = (): TabList => ({ workspaces: {}, lastTabKind: DEFAULT_LAST_TAB_KIND });

/** One terminal as the reference persists it, plus our `title`. */
interface StoredTerminal {
  id: string;
  cwd?: string;
  localWorkspaceId: string;
  startingCommandRan: boolean;
  title?: string;
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const pairs = (v: unknown): [unknown, unknown][] =>
  Array.isArray(v) ? v.filter((p): p is [unknown, unknown] => Array.isArray(p) && p.length === 2) : [];

/**
 * zustand's persisted string for `list`. `titleCounters` is ours (the
 * reference does not number its tabs); the reference's merge ignores it.
 * `startingCommandRan` is written false: we do not track it per tab.
 */
export function encodeTabList(list: TabList): string {
  const terminals: StoredTerminal[] = [];
  const workspaceTerminals: [string, string[]][] = [];
  const activeTabPerWorkspace: [string, string][] = [];
  const titleCounters: [string, number][] = [];
  for (const [ws, w] of Object.entries(list.workspaces)) {
    for (const t of w.tabs) {
      terminals.push({ id: t.id, ...(t.cwd === undefined ? {} : { cwd: t.cwd }), localWorkspaceId: ws, startingCommandRan: false, title: t.title });
    }
    workspaceTerminals.push([ws, w.tabs.map((t) => t.id)]);
    if (w.activeId !== null) activeTabPerWorkspace.push([ws, w.activeId]);
    titleCounters.push([ws, w.next]);
  }
  return JSON.stringify({
    state: { terminals, workspaceTerminals, activeTabPerWorkspace, lastTabKind: list.lastTabKind, titleCounters },
    version: TABS_VERSION,
  });
}

/**
 * The tab list in zustand's persisted string, merged as the reference's store
 * merges it: only terminals with a workspace id count, a workspace keeps the
 * listed ids that are such terminals (and is dropped when none are left), an
 * active tab must be one of them. Version 1 records name the workspace
 * `workspaceId` (the reference's migration). Unreadable data reads as empty.
 */
export function decodeTabList(text: string | null): TabList {
  let raw: unknown;
  try {
    raw = text === null ? undefined : JSON.parse(text);
  } catch {
    return emptyTabList();
  }
  if (!isObj(raw) || !isObj(raw.state)) return emptyTabList();
  const state = raw.state;
  const migrate = typeof raw.version !== "number" || raw.version < TABS_VERSION;
  const terminals = new Map<string, StoredTerminal>();
  for (const t of Array.isArray(state.terminals) ? state.terminals : []) {
    if (!isObj(t) || !isStr(t.id)) continue;
    const ws = t.localWorkspaceId ?? (migrate ? t.workspaceId : undefined);
    if (!isStr(ws)) continue;
    terminals.set(t.id, {
      id: t.id,
      cwd: isStr(t.cwd) ? t.cwd : undefined,
      localWorkspaceId: ws,
      startingCommandRan: t.startingCommandRan === true,
      title: isStr(t.title) ? t.title : undefined,
    });
  }
  const counters = new Map(pairs(state.titleCounters).filter((p): p is [string, number] => isStr(p[0]) && Number.isInteger(p[1]) && (p[1] as number) > 0));
  const active = new Map(pairs(state.activeTabPerWorkspace).filter((p): p is [string, string] => isStr(p[0]) && isStr(p[1])));
  const workspaces: Record<string, SavedWorkspace> = {};
  for (const [ws, ids] of pairs(state.workspaceTerminals)) {
    if (!isStr(ws) || !Array.isArray(ids)) continue;
    const tabs = ids
      .filter((id): id is string => isStr(id) && terminals.has(id))
      .map((id, i) => {
        const t = terminals.get(id)!;
        return { id, title: t.title ?? `Terminal ${i + 1}`, ...(t.cwd === undefined ? {} : { cwd: t.cwd }) };
      });
    if (tabs.length === 0) continue;
    const want = active.get(ws);
    const activeId = want !== undefined && tabs.some((t) => t.id === want) ? want : tabs[0].id;
    workspaces[ws] = { tabs, activeId, next: counters.get(ws) ?? tabs.length + 1 };
  }
  return { workspaces, lastTabKind: isStr(state.lastTabKind) ? state.lastTabKind : DEFAULT_LAST_TAB_KIND };
}

/** Our earlier format, kept in the webview's localStorage under the same key. */
export function decodeLegacyTabList(text: string | null): TabList {
  let raw: unknown;
  try {
    raw = text === null ? undefined : JSON.parse(text);
  } catch {
    return emptyTabList();
  }
  const list = emptyTabList();
  if (!isObj(raw)) return list;
  for (const [ws, v] of Object.entries(raw)) {
    if (!isObj(v) || !Array.isArray(v.tabs)) continue;
    const tabs = v.tabs
      .filter((t): t is Record<string, unknown> => isObj(t) && isStr(t.id) && isStr(t.title))
      .map((t) => ({ id: t.id as string, title: t.title as string, ...(isStr(t.cwd) ? { cwd: t.cwd } : {}) }));
    if (tabs.length === 0) continue;
    const activeId = isStr(v.activeId) && tabs.some((t) => t.id === v.activeId) ? v.activeId : tabs[0].id;
    const next = typeof v.next === "number" && Number.isInteger(v.next) && v.next > 0 ? v.next : tabs.length + 1;
    list.workspaces[ws] = { tabs, activeId, next };
  }
  return list;
}

/** One workspace's entry for `state`; `undefined` when it has no saved tabs. */
export function savedWorkspace(state: TabsState, cwdOf: (id: string) => string | undefined): SavedWorkspace | undefined {
  const tabs = state.tabs.flatMap((t) => {
    const cwd = cwdOf(t.id);
    return cwd === undefined ? [] : [{ id: t.id, title: t.title, cwd }];
  });
  return tabs.length === 0 ? undefined : { tabs, activeId: state.activeId, next: state.next };
}

export interface AsyncKeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface SyncKeyValue {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

/**
 * The saved tab list, read once and then kept in memory. Every change is
 * applied in call order and written whole, one write at a time. If the first
 * read fails nothing is written this launch, so a list that could not be read
 * is never overwritten. On the first read, a list in our earlier format in
 * `legacy` (the webview's localStorage) is moved here when the store has none.
 */
export class TabListStore {
  private loaded: Promise<TabList | undefined> | undefined;
  private chain: Promise<void> = Promise.resolve();
  private kv: AsyncKeyValue;
  private legacy: SyncKeyValue | undefined;
  private onError: (e: unknown) => void;

  constructor(kv: AsyncKeyValue, legacy?: SyncKeyValue, onError: (e: unknown) => void = () => {}) {
    this.kv = kv;
    this.legacy = legacy;
    this.onError = onError;
  }

  /** The list, or `undefined` when it could not be read. */
  load(): Promise<TabList | undefined> {
    this.loaded ??= this.read().catch((e) => {
      this.onError(e);
      return undefined;
    });
    return this.loaded;
  }

  /** The saved tabs of `workspaceId`, after every earlier change. */
  async workspace(workspaceId: string): Promise<SavedWorkspace | undefined> {
    await this.chain;
    return (await this.load())?.workspaces[workspaceId];
  }

  /** Set (or with `undefined`, forget) one workspace's saved tabs. */
  setWorkspace(workspaceId: string, saved: SavedWorkspace | undefined, lastTabKind?: string): Promise<void> {
    return this.update((list) => {
      if (saved) list.workspaces[workspaceId] = saved;
      else delete list.workspaces[workspaceId];
      if (lastTabKind !== undefined) list.lastTabKind = lastTabKind;
    });
  }

  private update(change: (list: TabList) => void): Promise<void> {
    this.chain = this.chain
      .then(async () => {
        const list = await this.load();
        if (!list) return;
        change(list);
        await this.kv.setItem(TABS_STORAGE_KEY, encodeTabList(list));
      })
      .catch(this.onError);
    return this.chain;
  }

  private async read(): Promise<TabList> {
    const text = await this.kv.getItem(TABS_STORAGE_KEY);
    if (text !== null) return decodeTabList(text);
    const old = this.legacy?.getItem(TABS_STORAGE_KEY) ?? null;
    if (old === null) return emptyTabList();
    const list = decodeLegacyTabList(old);
    await this.kv.setItem(TABS_STORAGE_KEY, encodeTabList(list));
    this.legacy?.removeItem(TABS_STORAGE_KEY);
    return list;
  }
}
