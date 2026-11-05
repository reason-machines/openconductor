// In-memory stand-in for the local_storage_* commands, for the browser build
// (vite dev, previews) and tests. Same results as the backend's
// SubsystemStore for sizes, ordering, eviction and failures; nothing is
// written to disk.

import type { EntryMeta, Invoke, SetEntryResult } from "./client.ts";

type Subsystem = { sizeLimit: number; totalSize: number; entries: EntryMeta[]; contents: Map<string, string> };

/** The stand-in, plus a read-only look at a subsystem's index record for tests. */
export type MemoryInvoke = Invoke & { subsystem(name: string): Omit<Subsystem, "contents"> | undefined };

/** The encrypted subsystem the plain store refuses, as the backend does. */
const ENCRYPTED = "terminal-history";

const byteLength = (s: string) => new TextEncoder().encode(s).byteLength;

function oldestOther(entries: EntryMeta[], keep: string): EntryMeta | undefined {
  return entries
    .filter((e) => e.id !== keep)
    .reduce<EntryMeta | undefined>((best, e) => (best && best.lastUpdatedAt <= e.lastUpdatedAt ? best : e), undefined);
}

export function memoryInvoke(now: () => string = () => new Date().toISOString()): MemoryInvoke {
  const subsystems = new Map<string, Subsystem>();
  const record = (subsystem: string) => {
    if (subsystem === ENCRYPTED) throw new Error("local storage entry is kept with another storage kind");
    return subsystems.get(subsystem);
  };
  const content = (subsystem: string, r: Subsystem, id: string) => {
    const c = r.contents.get(id);
    if (c === undefined) throw new Error(`Missing local storage entry ${subsystem}:${id} content`);
    return c;
  };

  type Args = { subsystem: string; id: string; sizeLimit: number; content: string };
  const commands: Record<string, (a: Args) => unknown> = {
    local_storage_get_entry: ({ subsystem, id }) => {
      const r = record(subsystem);
      if (!r || !r.entries.some((e) => e.id === id)) return null;
      return content(subsystem, r, id);
    },
    local_storage_list_entries: ({ subsystem }) => {
      const r = record(subsystem);
      return r ? r.entries.map((e) => ({ ...e, content: content(subsystem, r, e.id) })) : [];
    },
    local_storage_set_entry: (a): SetEntryResult => {
      const size = byteLength(a.content);
      if (size > a.sizeLimit) return { success: false, reason: "entryTooLarge" };
      if (a.subsystem === ENCRYPTED) return { success: false, reason: "entryStorageMismatch" };
      const existing = subsystems.get(a.subsystem);
      const previous = existing?.entries.find((e) => e.id === a.id);
      const entries = (existing?.entries ?? []).filter((e) => e.id !== a.id);
      entries.push({ id: a.id, size, lastUpdatedAt: now() });
      let total = (existing?.totalSize ?? 0) - (previous?.size ?? 0) + size;
      const evicted: string[] = [];
      while (total > a.sizeLimit) {
        const victim = oldestOther(entries, a.id);
        if (!victim) break;
        evicted.push(victim.id);
        total -= victim.size;
        entries.splice(entries.indexOf(victim), 1);
      }
      if (total > a.sizeLimit) return { success: false, reason: "subsystemFull" };
      const contents = existing?.contents ?? new Map<string, string>();
      contents.set(a.id, a.content);
      for (const id of evicted) contents.delete(id);
      subsystems.set(a.subsystem, { sizeLimit: a.sizeLimit, totalSize: total, entries, contents });
      return { success: true };
    },
    local_storage_remove_entry: ({ subsystem, id }) => {
      const r = record(subsystem);
      const e = r?.entries.find((x) => x.id === id);
      if (!r || !e) return null;
      r.entries = r.entries.filter((x) => x.id !== id);
      r.totalSize = Math.max(0, r.totalSize - e.size);
      r.contents.delete(id);
      return null;
    },
    local_storage_remove_subsystem: ({ subsystem }) => {
      record(subsystem);
      subsystems.delete(subsystem);
      return null;
    },
  };

  const call = async <T,>(cmd: string, args: Record<string, unknown> = {}): Promise<T> => {
    const run = commands[cmd];
    if (!run) throw new Error(`unknown command ${cmd}`);
    return run(args.args as Args) as T;
  };
  return Object.assign(call, {
    subsystem(name: string) {
      const r = subsystems.get(name);
      return r && { sizeLimit: r.sizeLimit, totalSize: r.totalSize, entries: r.entries.map((e) => ({ ...e })) };
    },
  });
}
