// Client for the backend's plain local-storage store (`SubsystemStore`,
// src-tauri/src/terminal/history_store.rs, commands in
// src-tauri/src/local_storage_commands.rs), with the reference frontend's
// API: getEntry / setEntry / listEntries / removeEntry / removeSubsystem.
// Values cross as JSON text, so sizes are the byte length of
// JSON.stringify, as in the reference.

import type { Subsystem } from "./subsystems.ts";

export type SetEntryFailure = "entryTooLarge" | "subsystemFull" | "entryStorageMismatch" | "notJsonSerializable";
export type SetEntryResult = { success: true } | { success: false; reason: SetEntryFailure };
export type EntryMeta = { id: string; size: number; lastUpdatedAt: string };
export type ListedEntry<T = unknown> = EntryMeta & { content: T };

export type SetEntryArgs = {
  subsystem: string;
  sizeLimit: number;
  id: string;
  content: unknown;
};

/** `invoke` from @tauri-apps/api/core, or a stand-in. */
export type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

type RawListed = EntryMeta & { content: string };

export class LocalStorageClient {
  private readonly call: Invoke;

  constructor(call: Invoke) {
    this.call = call;
  }

  /** The entry's value, or undefined when the subsystem does not list it. */
  async getEntry<T = unknown>({ subsystem, id }: { subsystem: string; id: string }): Promise<T | undefined> {
    const text = await this.call<string | null>("local_storage_get_entry", { args: { subsystem, id } });
    return text === null || text === undefined ? undefined : (JSON.parse(text) as T);
  }

  async setEntry({ content, ...rest }: SetEntryArgs): Promise<SetEntryResult> {
    let text: string | undefined;
    try {
      text = JSON.stringify(content);
    } catch {
      return { success: false, reason: "notJsonSerializable" };
    }
    if (typeof text !== "string") return { success: false, reason: "notJsonSerializable" };
    return this.call<SetEntryResult>("local_storage_set_entry", { args: { ...rest, content: text } });
  }

  async listEntries<T = unknown>(subsystem: string): Promise<ListedEntry<T>[]> {
    const raw = await this.call<RawListed[]>("local_storage_list_entries", { args: { subsystem } });
    return raw.map((e) => ({ id: e.id, size: e.size, lastUpdatedAt: e.lastUpdatedAt, content: JSON.parse(e.content) as T }));
  }

  async removeEntry({ subsystem, id }: { subsystem: string; id: string }): Promise<void> {
    await this.call("local_storage_remove_entry", { args: { subsystem, id } });
  }

  async removeSubsystem(subsystem: string): Promise<void> {
    await this.call("local_storage_remove_subsystem", { args: { subsystem } });
  }
}

/**
 * Storage for a persisted store kept as one entry per persist name (the
 * reference's adapter for zustand `persist`): values are the store's own
 * serialized string.
 */
export function persistStorage(client: LocalStorageClient, { name: subsystem, sizeLimit }: Subsystem) {
  return {
    async getItem(id: string): Promise<string | null> {
      const v = await client.getEntry({ subsystem, id });
      return typeof v === "string" ? v : null;
    },
    async setItem(id: string, value: string): Promise<void> {
      const r = await client.setEntry({ subsystem, sizeLimit, id, content: value });
      if (!r.success) throw new Error(`Failed to persist local storage entry ${subsystem}:${id}: ${r.reason}`);
    },
    async removeItem(id: string): Promise<void> {
      await client.removeEntry({ subsystem, id });
    },
  };
}

/** An async `Storage` over `browser-local-storage` (the reference's adapter). */
export function browserLocalStorage(client: LocalStorageClient, { name: subsystem, sizeLimit }: Subsystem) {
  const removeItem = async (key: string) => {
    await client.removeEntry({ subsystem, id: key });
  };
  return {
    async getItem(key: string): Promise<string | null> {
      const v = await client.getEntry({ subsystem, id: key });
      if (v === undefined) return null;
      if (typeof v !== "string") throw new Error(`Invalid browser local storage value for ${key}`);
      return v;
    },
    async setItem(key: string, value: string): Promise<void> {
      const r = await client.setEntry({ subsystem, sizeLimit, id: key, content: value });
      if (!r.success) throw new Error(`Failed to set browser local storage value for ${key}: ${r.reason}`);
    },
    removeItem,
    async clear(): Promise<void> {
      const entries = await client.listEntries(subsystem);
      await Promise.all(entries.map((e) => removeItem(e.id)));
    },
    async key(index: number): Promise<string | null> {
      if (!Number.isInteger(index) || index < 0) return null;
      return (await client.listEntries(subsystem))[index]?.id ?? null;
    },
    get length(): Promise<number> {
      return client.listEntries(subsystem).then((e) => e.length);
    },
  };
}
