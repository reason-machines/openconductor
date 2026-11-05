// Sidebar resource usage: the data model and pure helpers behind the header
// pill and its "Resources" popover. Ported from Conductor 0.87.6's decoded
// renderApp-D_fmY7hW.js (character offsets in that file, see
// evidence/sidebar-resource-usage/NOTES.md). No React, no IPC: unit tested in
// resourceUsage.test.ts.

/** One process of `get_resource_usage` (keys as the IPC result, `RFi`). */
export interface ProcessUsage {
  pid: number;
  ppid: number;
  label: string;
  command: string;
  copyCommand?: string;
  cpuPercent: number;
  memoryKb: number;
  terminalId?: string;
  cwd?: string;
}

export interface ResourceUsage {
  totalCpuPercent: number;
  totalMemoryKb: number;
  processes: ProcessUsage[];
}

/** Poll period of the snapshot query (`zta`: `refetchInterval: 2e3`). */
export const REFRESH_MS = 2000;

/** Zombies are dropped before anything is shown (`RFi`). */
export function dropDefunct(usage: ResourceUsage): ResourceUsage {
  return { ...usage, processes: usage.processes.filter((p) => !p.command.includes("<defunct>")) };
}

/** `DA` @7,317,950: one decimal and a percent sign. */
export function formatCpu(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

/** `yk` @7,317,974: KB under 1024, MB with one decimal, GB with two. */
export function formatMemory(kb: number): string {
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`;
}

/** `Gao`: agent CLIs, by label. */
export function isAgentProcess(p: ProcessUsage): boolean {
  return p.label === "Claude Code" || p.label === "claude" || p.label === "Codex" || p.label === "codex" || p.label === "node";
}

/** `qao`: the given pids and every descendant. */
export function withDescendants(processes: ProcessUsage[], roots: Iterable<number>): Set<number> {
  const children = new Map<number, ProcessUsage[]>();
  for (const p of processes) {
    const list = children.get(p.ppid) ?? [];
    list.push(p);
    children.set(p.ppid, list);
  }
  const seen = new Set<number>();
  const stack = [...roots];
  while (stack.length > 0) {
    const pid = stack.pop();
    if (pid === undefined || seen.has(pid)) continue;
    seen.add(pid);
    for (const c of children.get(pid) ?? []) stack.push(c.pid);
  }
  return seen;
}

/**
 * `Kao`: what the pill's memory figure counts. Terminal processes and agent
 * processes, with their whole subtrees, are left out, so the pill shows the
 * app's own footprint.
 */
export function pillProcesses(processes: ProcessUsage[]): ProcessUsage[] {
  const roots = new Set<number>();
  for (const p of processes) if (p.terminalId || isAgentProcess(p)) roots.add(p.pid);
  const excluded = withDescendants(processes, roots);
  return processes.filter((p) => !excluded.has(p.pid));
}

export function sumMemory(processes: ProcessUsage[]): number {
  return processes.reduce((n, p) => n + p.memoryKb, 0);
}

export function sumCpu(processes: ProcessUsage[]): number {
  return processes.reduce((n, p) => n + p.cpuPercent, 0);
}

export type PillLayout = "hidden" | "collapsed" | "full";

/**
 * `bna`: no pill under 200 px of sidebar, icon only under 260 px (the memory
 * figure moves to the tooltip). An unknown width shows it in full.
 */
export function pillLayout(sidebarWidth: number | undefined): PillLayout {
  if (sidebarWidth !== undefined && sidebarWidth < 200) return "hidden";
  if (sidebarWidth !== undefined && sidebarWidth < 260) return "collapsed";
  return "full";
}

/** `bna`: the popover is at least the sidebar less 24 px (280 unknown), and never under 360. */
export function popoverMinWidth(sidebarWidth: number | undefined): number {
  return Math.max(sidebarWidth !== undefined ? sidebarWidth - 24 : 280, 360);
}

/** `zzt`: terminal processes only when "Include terminal processes" is on. */
export function filterTerminals(processes: ProcessUsage[], includeTerminals: boolean): ProcessUsage[] {
  return includeTerminals ? processes : processes.filter((p) => !p.terminalId);
}

export type SortKey = "name" | "cpu" | "memory";
export type SortDirection = "asc" | "desc";

/** The popover's view state (`Gw` store), with Conductor's defaults. */
export interface ViewState {
  sortKey: SortKey;
  sortDirection: SortDirection;
  showAll: boolean;
  treeMode: boolean;
  groupByWorkspace: boolean;
  includeTerminals: boolean;
  collapsedGroups: Set<string>;
}

export const DEFAULT_VIEW: ViewState = {
  sortKey: "memory",
  sortDirection: "desc",
  showAll: false,
  treeMode: true,
  groupByWorkspace: true,
  includeTerminals: false,
  collapsedGroups: new Set(),
};

/** `Hta`: a newly picked column's first direction. */
const FIRST_DIRECTION: Record<SortKey, SortDirection> = { name: "asc", cpu: "desc", memory: "desc" };

/** `handleSort`: the same column flips direction; another column starts at its own default. */
export function nextSort(view: Pick<ViewState, "sortKey" | "sortDirection">, key: SortKey): Pick<ViewState, "sortKey" | "sortDirection"> {
  if (key === view.sortKey) return { sortKey: key, sortDirection: view.sortDirection === "asc" ? "desc" : "asc" };
  return { sortKey: key, sortDirection: FIRST_DIRECTION[key] };
}

/** `QAt`: the flat list, sorted on one column, ties by pid. */
export function sortFlat(processes: ProcessUsage[], key: SortKey, direction: SortDirection): ProcessUsage[] {
  const d = direction === "asc" ? 1 : -1;
  return [...processes].sort((a, b) => {
    let c: number;
    switch (key) {
      case "name":
        c = d * a.label.localeCompare(b.label);
        break;
      case "memory":
        c = d * (a.memoryKb - b.memoryKb);
        break;
      default:
        c = d * (a.cpuPercent - b.cpuPercent);
    }
    return c || a.pid - b.pid;
  });
}

export interface TreeRow {
  process: ProcessUsage;
  depth: number;
  totalCpuPercent: number;
  totalMemoryKb: number;
}

/**
 * `YAt`: parents before children, siblings sorted on the subtree totals
 * (CPU ties broken by memory and the reverse), ties by pid.
 */
export function buildTree(processes: ProcessUsage[], key: SortKey, direction: SortDirection): TreeRow[] {
  const pids = new Set(processes.map((p) => p.pid));
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  const children = new Map<number, ProcessUsage[]>();
  const roots: ProcessUsage[] = [];
  for (const p of processes) {
    if (!pids.has(p.ppid)) roots.push(p);
    else {
      const list = children.get(p.ppid) ?? [];
      list.push(p);
      children.set(p.ppid, list);
    }
  }
  const totals = new Map<number, { cpu: number; mem: number }>();
  const total = (pid: number): { cpu: number; mem: number } => {
    const known = totals.get(pid);
    if (known) return known;
    const p = byPid.get(pid);
    let cpu = p?.cpuPercent ?? 0;
    let mem = p?.memoryKb ?? 0;
    for (const c of children.get(pid) ?? []) {
      const t = total(c.pid);
      cpu += t.cpu;
      mem += t.mem;
    }
    const t = { cpu, mem };
    totals.set(pid, t);
    return t;
  };
  for (const p of processes) total(p.pid);
  const d = direction === "asc" ? 1 : -1;
  const rows: TreeRow[] = [];
  const walk = (list: ProcessUsage[], depth: number) => {
    const sorted = [...list].sort((a, b) => {
      if (key === "name") return d * a.label.localeCompare(b.label) || a.pid - b.pid;
      const ta = totals.get(a.pid)!;
      const tb = totals.get(b.pid)!;
      return key === "cpu"
        ? d * (ta.cpu - tb.cpu) || d * (ta.mem - tb.mem) || a.pid - b.pid
        : d * (ta.mem - tb.mem) || d * (ta.cpu - tb.cpu) || a.pid - b.pid;
    });
    for (const p of sorted) {
      const t = totals.get(p.pid)!;
      rows.push({ process: p, depth, totalCpuPercent: t.cpu, totalMemoryKb: t.mem });
      walk(children.get(p.pid) ?? [], depth + 1);
    }
  };
  walk(roots, 0);
  return rows;
}

/** A workspace the popover can attribute processes to. */
export interface WorkspaceRef {
  localId: string;
  directoryName: string;
  workspacePath: string;
}

export interface WorkspaceAttribution {
  pidToWorkspaceId: Map<number, string>;
  workspaceIdToName: Map<string, string>;
}

/**
 * `ZCi`: a process belongs to a workspace when its terminal id starts with
 * `<workspace id>-`, else when its cwd is the workspace folder or inside it.
 */
export function attributeWorkspaces(processes: ProcessUsage[], workspaces: WorkspaceRef[]): WorkspaceAttribution {
  const pidToWorkspaceId = new Map<number, string>();
  const workspaceIdToName = new Map<string, string>();
  for (const p of processes) {
    if (p.terminalId) {
      for (const w of workspaces) {
        if (p.terminalId.startsWith(`${w.localId}-`)) {
          pidToWorkspaceId.set(p.pid, w.localId);
          workspaceIdToName.set(w.localId, w.directoryName);
          break;
        }
      }
    }
    if (!pidToWorkspaceId.has(p.pid) && p.cwd) {
      for (const w of workspaces) {
        if (p.cwd === w.workspacePath || p.cwd.startsWith(`${w.workspacePath}/`)) {
          pidToWorkspaceId.set(p.pid, w.localId);
          workspaceIdToName.set(w.localId, w.directoryName);
          break;
        }
      }
    }
  }
  return { pidToWorkspaceId, workspaceIdToName };
}

export interface ProcessGroup {
  name: string;
  processes: ProcessUsage[];
}

/** `Wta`: "App" first (processes of no workspace), then workspaces by name. */
export function groupByWorkspace(processes: ProcessUsage[], a: WorkspaceAttribution): ProcessGroup[] {
  const APP = "__app__";
  const groups = new Map<string, ProcessUsage[]>();
  for (const p of processes) {
    const id = a.pidToWorkspaceId.get(p.pid) ?? APP;
    const list = groups.get(id) ?? [];
    list.push(p);
    groups.set(id, list);
  }
  const out: ProcessGroup[] = [];
  const app = groups.get(APP);
  if (app) {
    out.push({ name: "App", processes: app });
    groups.delete(APP);
  }
  const name = (id: string) => a.workspaceIdToName.get(id) ?? id;
  for (const [id, list] of [...groups.entries()].sort(([x], [y]) => name(x).localeCompare(name(y)))) {
    out.push({ name: name(id), processes: list });
  }
  return out;
}

/**
 * `e8i` with `commandSource: "localCopy"`: the text "Copy resource usage"
 * puts on the clipboard. The header line, then one line per process with
 * its full command and workspace.
 */
export function copyText(usage: ResourceUsage, pidToWorkspace?: Map<number, string>): string {
  return [
    `CPU ${formatCpu(usage.totalCpuPercent)} Memory ${formatMemory(usage.totalMemoryKb)}`,
    ...usage.processes.map((p) => {
      const ws = pidToWorkspace?.get(p.pid);
      const suffix = ws ? ` ws=${ws}` : "";
      return `${p.label} ${formatCpu(p.cpuPercent)} ${formatMemory(p.memoryKb)} (pid=${p.pid} ppid=${p.ppid} cmd=${p.copyCommand ?? p.command}${suffix})`;
    }),
  ].join("\n");
}

/**
 * `qta`: "Show all (n)" appears past 7 processes. It does not add rows; it
 * lifts the list's height cap from 220 px to 60vh.
 */
export const SHOW_ALL_THRESHOLD = 7;
