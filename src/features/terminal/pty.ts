// Bridge to the `pty_*` commands (src-tauri/src/terminal_commands.rs).
// Outside Tauri (vite dev in a browser) spawning fails with a clear error
// and the event listener is a no-op.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PTY_EVENT, decodeBase64, parsePtyEvent, type PtyEvent } from "./events";

export interface SpawnArgs {
  id?: string;
  cwd: string;
  /** argv instead of the login shell (run scripts). */
  command?: string[];
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  /** Typed into a new tab after it starts. */
  initialCommand?: string;
  scrollbackLimit?: number;
}

export const ptySpawn = (args: SpawnArgs): Promise<string> =>
  isTauri() ? invoke<string>("pty_spawn", { args }) : Promise.reject(new Error("Terminals need the desktop app."));

export const ptyWrite = (id: string, data: string) => invoke<void>("pty_write", { id, data });
export const ptyResize = (id: string, cols: number, rows: number) => invoke<void>("pty_resize", { id, cols, rows });
export const ptyKill = (id: string) => invoke<void>("pty_kill", { id });
export const ptyAckBytes = (id: string, bytes: number) => invoke<void>("pty_ack_bytes", { id, bytes });
export const ptyClearHistory = (id: string) => invoke<void>("pty_clear_history", { id });

/** Output kept by the backend, for a renderer that attaches late. */
export async function ptyReadHistory(id: string): Promise<Uint8Array> {
  return decodeBase64(await invoke<string>("pty_read_history", { id }));
}

/** Subscribe to every terminal's events; returns the unsubscribe function. */
export async function onPtyEvent(handler: (e: PtyEvent) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  return listen<unknown>(PTY_EVENT, ({ payload }) => {
    try {
      handler(parsePtyEvent(payload));
    } catch (err) {
      console.error(err);
    }
  });
}
