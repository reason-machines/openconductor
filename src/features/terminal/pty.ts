// Bridge to the `pty_*` commands (src-tauri/src/terminal_commands.rs).
// Outside Tauri (vite dev in a browser) spawning fails with a clear error
// and the event listener is a no-op.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PTY_EVENT, decodeBase64, parsePtyEvent, type PtyEvent } from "./events";
import type { HistoryRecord, PersistArgs } from "./restore";
import { createPtyWriter } from "./writeQueue.ts";

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

export const ptyWrite = createPtyWriter((id, data) => invoke<void>("pty_write", { id, data }));
export const ptyResize = (id: string, cols: number, rows: number) => invoke<void>("pty_resize", { id, cols, rows });
export const ptyKill = (id: string) => invoke<void>("pty_kill", { id });
export const ptyAckBytes = (id: string, bytes: number) => invoke<void>("pty_ack_bytes", { id, bytes });
export const ptyClearHistory = (id: string) => invoke<void>("pty_clear_history", { id });

/** Feed `data` to terminal or mirror `id`'s backend screen only, not to its shell. */
export const ptyWriteMirror = (id: string, data: string) => invoke<void>("pty_write_mirror", { args: { id, data } });

/** Save terminal `args.id`'s screen under `args.sessionId` for a later launch. */
export const ptyPersistTerminalHistory = (args: PersistArgs) => invoke<void>("pty_persist_terminal_history", { args });

/** The screen saved under `sessionId`, if any; outside the desktop app there is none. */
export async function ptyLoadTerminalHistory(sessionId: string): Promise<HistoryRecord | undefined> {
  if (!isTauri()) return undefined;
  return (await invoke<HistoryRecord | null>("pty_load_terminal_history", { args: { sessionId } })) ?? undefined;
}

/** Forget the session saved under `sessionId` (its tab was closed). */
export const ptyDeleteTerminalHistory = (sessionId: string) => invoke<void>("pty_delete_terminal_history", { args: { sessionId } });

/** Forget every session saved for `localWorkspaceId`; resolves to how many. */
export const ptyDeleteWorkspaceTerminalHistory = (localWorkspaceId: string) =>
  invoke<number>("pty_delete_workspace_terminal_history", { args: { localWorkspaceId } });

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
