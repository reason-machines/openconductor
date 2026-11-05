// A key-value view of one local-storage subsystem, like the reference's
// zustand storage adapter (index-BGEQ8YjU.js byte 2806160): values are
// strings, written with the subsystem's size limit, and a failed write
// throws with its reason. In the desktop app the entries are kept by the
// backend (`local_storage_*_entry`, src-tauri/src/local_storage_commands.rs);
// in a plain browser (vite dev) by the webview's localStorage.
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AsyncKeyValue } from "./tabList.ts";

interface SetEntryResult {
  success: boolean;
  reason?: string;
}

export function subsystemStorage(subsystem: string, sizeLimit: number): AsyncKeyValue {
  if (!isTauri()) {
    const key = (id: string) => `local-storage:${subsystem}:${id}`;
    return {
      getItem: async (id) => localStorage.getItem(key(id)),
      setItem: async (id, value) => localStorage.setItem(key(id), value),
    };
  }
  return {
    async getItem(id) {
      const text = await invoke<string | null>("local_storage_get_entry", { args: { subsystem, id } });
      if (text === null) return null;
      const value: unknown = JSON.parse(text);
      return typeof value === "string" ? value : null;
    },
    async setItem(id, value) {
      const r = await invoke<SetEntryResult>("local_storage_set_entry", {
        args: { subsystem, sizeLimit, id, content: JSON.stringify(value) },
      });
      if (!r.success) throw new Error(`Failed to persist local storage entry ${subsystem}:${id}: ${r.reason}`);
    },
  };
}
