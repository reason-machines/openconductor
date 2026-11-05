// Conductor's workspace status (renderApp chunk, REA-extracted, read as data):
// the effective status is `manualStatus ?? derivedStatus` (`h8t`); "Set status"
// writes manual_status, a derived update clears it (`MQe` / `OQe`). Values and
// their order come from `uJn` / `sZe`; the derived default is in-progress.

export type WorkspaceStatusValue = "backlog" | "in-progress" | "in-review" | "done" | "canceled";

export const WORKSPACE_STATUSES: readonly WorkspaceStatusValue[] = ["backlog", "in-progress", "in-review", "done", "canceled"];

export const DEFAULT_DERIVED_STATUS: WorkspaceStatusValue = "in-progress";

const LABEL: Record<WorkspaceStatusValue, string> = {
  backlog: "Backlog",
  "in-progress": "In progress",
  "in-review": "In review",
  done: "Done",
  canceled: "Canceled",
};

export function statusLabel(s: WorkspaceStatusValue): string {
  return LABEL[s];
}

export function isWorkspaceStatus(v: unknown): v is WorkspaceStatusValue {
  return typeof v === "string" && (WORKSPACE_STATUSES as readonly string[]).includes(v);
}

export function effectiveStatus(ws: { manualStatus?: WorkspaceStatusValue | null; derivedStatus?: WorkspaceStatusValue | null }): WorkspaceStatusValue {
  return ws.manualStatus ?? ws.derivedStatus ?? DEFAULT_DERIVED_STATUS;
}
