export type SidebarSort = "updated" | "created";

export const SIDEBAR_SORT_OPTIONS: readonly { value: SidebarSort; label: string }[] = [
  { value: "updated", label: "Updated" },
  { value: "created", label: "Created" },
];

export function parseSidebarSort(value: unknown): SidebarSort {
  return value === "created" ? "created" : "updated";
}

export function sortSidebarWorkspaces<T extends { createdAt: number; updatedAt?: number }>(rows: readonly T[], sort: SidebarSort = "updated"): T[] {
  const time = (row: T) => sort === "created" ? row.createdAt : row.updatedAt ?? row.createdAt;
  return [...rows].sort((a, b) => time(b) - time(a));
}
