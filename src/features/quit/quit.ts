// Quit through the webview, as Conductor 0.87.6 does (REA on Sven's Mac,
// evidence/keybindings/README.md "Native menu"):
//
// - The native app menu's Quit item (`custom_quit`, ⌘Q) emits `quit_requested`
//   once the webview has called `set_quit_handler_ready` (src-tauri/src/app_quit.rs).
// - The webview (renderApp-D_fmY7hW.js `b5a` @ ~11,072,003) quits at once when no
//   agent is running, else opens the confirm dialog (`y5a`); confirming calls
//   `quit_app`.
//
// The registry's `quitApplication` (⌘Q, global, fixed) runs the same request, so
// a platform without the native menu quits through the dispatcher too.
import { workspaceChatStatuses } from "../../state/workspaceSessions.ts";

/** Chat statuses that mean its agent is still running (stopping counts: quitting would cut it off). */
const RUNNING = new Set(["working", "cancelling"]);

/**
 * How many agents quitting would stop, by the sidebar row's rule
 * (useWorkspaceAgentStatus): every chat in this window whose agent is
 * running, plus a workspace's own `sessionStatus` (the demo's) when it has no
 * chat here and is not the open workspace.
 */
export function countRunningAgents(
  chats: ReadonlyMap<string, string>,
  workspaces: readonly { id: string; sessionStatus?: string }[],
  openWorkspaceId?: string,
): number {
  let n = 0;
  for (const status of chats.values()) if (RUNNING.has(status)) n++;
  for (const ws of workspaces) {
    if (ws.id === openWorkspaceId || ws.sessionStatus === undefined) continue;
    if (workspaceChatStatuses(chats, ws.id).length === 0 && RUNNING.has(ws.sessionStatus)) n++;
  }
  return n;
}

/** Where a quit request came from: the app menu item, or the `quitApplication` shortcut. */
export type QuitSource = "menu" | "shortcut";

/** Quit now, or ask first because agents would be stopped (`b5a`). */
export const quitDecision = (running: number): "quit" | "confirm" => (running > 0 ? "confirm" : "quit");

/** The confirm dialog's text (`y5a`); the product name is ours. */
export const QUIT_DIALOG = {
  title: "Quit OpenConductor?",
  cancelLabel: "Cancel",
  confirmLabel: "Quit",
  description(running: number | undefined): string {
    if (running === undefined) return "Agents may be running and will be stopped.";
    if (running === 0) return "No agents are running, so it's safe to quit.";
    if (running === 1) return "1 agent is currently running and will be stopped.";
    return `${running} agents are currently running and will be stopped.`;
  },
} as const;

/** The dialog's id for the keybinding dispatcher (`[data-dialog-id]`). */
export const QUIT_DIALOG_ID = "quit-app";
