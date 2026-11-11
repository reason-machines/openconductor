import type { WorkspaceStatusValue } from "../state/workspaceStatus.ts";

export type SidebarGroupBy = "repo" | "status";

export const SIDEBAR_GROUP_OPTIONS: readonly { value: SidebarGroupBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "repo", label: "Project" },
];

export const SIDEBAR_STATUS_ORDER: readonly WorkspaceStatusValue[] = ["done", "in-review", "in-progress", "backlog", "canceled"];

export function parseSidebarGroupBy(value: unknown): SidebarGroupBy {
  return value === "status" ? "status" : "repo";
}

export function parseStatusCollapsed(value: unknown): Partial<Record<WorkspaceStatusValue, boolean>> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const flags: Partial<Record<WorkspaceStatusValue, boolean>> = {};
  for (const status of SIDEBAR_STATUS_ORDER) {
    const flag: unknown = Reflect.get(value, status);
    if (typeof flag === "boolean") flags[status] = flag;
  }
  return Object.keys(flags).length > 0 ? flags : undefined;
}
