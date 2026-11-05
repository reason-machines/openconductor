// A key-value view of one local-storage subsystem, like the reference's
// local-storage layer (index-BGEQ8YjU.js bytes 218600-236500): entries are
// JSON values, written with the subsystem's size limit, and a failed write
// throws with its reason. In the desktop app the entries are kept by the
// backend (`local_storage_*_entry`, src-tauri/src/local_storage_commands.rs);
// in a plain browser (vite dev) by the webview's localStorage.
//
// `subsystemEntries` is the reference's getEntry / setEntry for any JSON
// value (used by the turn-changes cache); `subsystemStorage` is its zustand
// adapter (byte 2806160), whose values are strings (used by the terminal tabs).
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AsyncKeyValue } from "./tabList.ts";

interface SetEntryResult {
  success: boolean;
  reason?: string;
}

/** One subsystem's entries. `getEntry` is undefined when there is none. */
export interface SubsystemEntries {
  getEntry(id: string): Promise<unknown>;
  setEntry(id: string, value: unknown): Promise<void>;
}

export function subsystemEntries(subsystem: string, sizeLimit: number): SubsystemEntries {
  if (!isTauri()) {
    const key = (id: string) => `local-storage:${subsystem}:${id}`;
    return {
      getEntry: async (id) => {
        const text = localStorage.getItem(key(id));
        return text === null ? undefined : (JSON.parse(text) as unknown);
      },
      setEntry: async (id, value) => localStorage.setItem(key(id), JSON.stringify(value)),
    };
  }
  return {
    async getEntry(id) {
      const text = await invoke<string | null>("local_storage_get_entry", { args: { subsystem, id } });
      return text === null ? undefined : (JSON.parse(text) as unknown);
    },
    async setEntry(id, value) {
      const r = await invoke<SetEntryResult>("local_storage_set_entry", {
        args: { subsystem, sizeLimit, id, content: JSON.stringify(value) },
      });
      if (!r.success) throw new Error(`Failed to persist local storage entry ${subsystem}:${id}: ${r.reason}`);
    },
  };
}

export function subsystemStorage(subsystem: string, sizeLimit: number): AsyncKeyValue {
  if (!isTauri()) {
    // Kept as the raw string, as earlier builds wrote it.
    const key = (id: string) => `local-storage:${subsystem}:${id}`;
    return {
      getItem: async (id) => localStorage.getItem(key(id)),
      setItem: async (id, value) => localStorage.setItem(key(id), value),
    };
  }
  const entries = subsystemEntries(subsystem, sizeLimit);
  return {
    async getItem(id) {
      const value = await entries.getEntry(id);
      return typeof value === "string" ? value : null;
    },
    setItem: (id, value) => entries.setEntry(id, value),
  };
}
