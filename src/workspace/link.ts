// "Copy link" for a workspace. Conductor's handler `XV` (renderApp chunk) copies
// `IGt(...)` from index-BGEQ8YjU.js. For a local workspace that is `$$`:
// `${scheme}://workspace?id=<localId>` (URLSearchParams, `&session=<id>` when a
// session is given), with scheme "conductor" for the production app (`l7e`).
// Cloud workspaces get an https://app.conductor.build/workspace/<id> link
// instead; OpenConductor has no cloud workspaces, so only the local form exists.
// Toasts: "Copied link" / "Failed to copy link". REA-extracted, read as data.

/** OpenConductor's URL scheme (tauri.conf.json deep-link, docs/packaging.md). */
export const APP_URL_SCHEME = "openconductor";

/** The link Copy link puts on the clipboard for a local workspace. */
export function workspaceLink(workspaceId: string, sessionId?: string): string {
  const params = new URLSearchParams({ id: workspaceId });
  if (sessionId !== undefined) params.set("session", sessionId);
  return `${APP_URL_SCHEME}://workspace?${params.toString()}`;
}

export const COPIED_LINK = "Copied link";
export const COPY_LINK_FAILED = "Failed to copy link";

type Clipboard = { writeText(text: string): Promise<void> };

/** Copies the workspace's link; resolves to the toast Conductor shows for the outcome. */
export async function copyWorkspaceLink(
  workspaceId: string,
  clipboard: Clipboard | undefined = typeof navigator === "undefined" ? undefined : navigator.clipboard,
): Promise<{ kind: "info" | "error"; message: string }> {
  try {
    if (!clipboard) throw new Error("no clipboard");
    await clipboard.writeText(workspaceLink(workspaceId));
    return { kind: "info", message: COPIED_LINK };
  } catch {
    return { kind: "error", message: COPY_LINK_FAILED };
  }
}
