import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attributeWorkspaces,
  buildTree,
  copyText,
  dropDefunct,
  filterTerminals,
  formatCpu,
  formatMemory,
  groupByWorkspace,
  nextSort,
  pillLayout,
  pillProcesses,
  popoverMinWidth,
  sortFlat,
  sumMemory,
  type ProcessUsage,
} from "./resourceUsage.ts";

const p = (pid: number, ppid: number, label: string, cpu: number, memKb: number, extra: Partial<ProcessUsage> = {}): ProcessUsage => ({
  pid,
  ppid,
  label,
  command: label,
  cpuPercent: cpu,
  memoryKb: memKb,
  ...extra,
});

// App (500) with a helper, a terminal shell running node, and a Claude agent with git under it.
const procs: ProcessUsage[] = [
  p(500, 1, "OpenConductor", 2, 200_000),
  p(501, 500, "helper", 1, 50_000),
  p(510, 500, "Terminal 1", 0, 10_000, { terminalId: "ws-lisbon-1", cwd: "/w/lisbon" }),
  p(511, 510, "node", 12, 400_000, { terminalId: "ws-lisbon-1", cwd: "/w/lisbon/app" }),
  p(520, 500, "claude", 3, 300_000, { cwd: "/w/osaka" }),
  p(521, 520, "git", 0.5, 2_000, { cwd: "/w/osaka" }),
];

test("memory reads as KB, MB with one decimal, GB with two", () => {
  assert.equal(formatMemory(512), "512 KB");
  assert.equal(formatMemory(1023.6), "1024 KB");
  assert.equal(formatMemory(1024), "1.0 MB");
  assert.equal(formatMemory(250_000), "244.1 MB");
  assert.equal(formatMemory(3 * 1024 * 1024), "3.00 GB");
  assert.equal(formatCpu(12.345), "12.3%");
  assert.equal(formatCpu(0), "0.0%");
});

test("the pill counts the app only: terminals and agents leave with their subtrees", () => {
  assert.deepEqual(pillProcesses(procs).map((x) => x.pid), [500, 501]);
  assert.equal(formatMemory(sumMemory(pillProcesses(procs))), "244.1 MB");
});

test("the pill hides under 200 px, shrinks to its icon under 260 px", () => {
  assert.equal(pillLayout(199), "hidden");
  assert.equal(pillLayout(200), "collapsed");
  assert.equal(pillLayout(259), "collapsed");
  assert.equal(pillLayout(260), "full");
  assert.equal(pillLayout(undefined), "full");
  assert.equal(popoverMinWidth(256), 360);
  assert.equal(popoverMinWidth(480), 456);
  assert.equal(popoverMinWidth(undefined), 360);
});

test("defunct processes are dropped and terminals are opt-in", () => {
  const usage = dropDefunct({ totalCpuPercent: 0, totalMemoryKb: 0, processes: [...procs, p(9, 500, "x", 0, 0, { command: "x <defunct>" })] });
  assert.equal(usage.processes.length, procs.length);
  assert.deepEqual(filterTerminals(procs, false).map((x) => x.pid), [500, 501, 520, 521]);
  assert.equal(filterTerminals(procs, true).length, procs.length);
});

test("sorting: a new column starts at its default, the same column flips", () => {
  assert.deepEqual(nextSort({ sortKey: "memory", sortDirection: "desc" }, "memory"), { sortKey: "memory", sortDirection: "asc" });
  assert.deepEqual(nextSort({ sortKey: "memory", sortDirection: "desc" }, "name"), { sortKey: "name", sortDirection: "asc" });
  assert.deepEqual(nextSort({ sortKey: "name", sortDirection: "asc" }, "cpu"), { sortKey: "cpu", sortDirection: "desc" });
  assert.deepEqual(sortFlat(procs, "memory", "desc").map((x) => x.pid), [511, 520, 500, 501, 510, 521]);
  assert.deepEqual(sortFlat(procs, "name", "asc").map((x) => x.label), ["claude", "git", "helper", "node", "OpenConductor", "Terminal 1"]);
});

test("the tree nests children under parents and sorts siblings on subtree totals", () => {
  const rows = buildTree(procs, "memory", "desc");
  assert.deepEqual(
    rows.map((r) => [r.process.pid, r.depth]),
    [[500, 0], [510, 1], [511, 2], [520, 1], [521, 2], [501, 1]],
  );
  const terminal = rows.find((r) => r.process.pid === 510)!;
  assert.equal(terminal.totalMemoryKb, 410_000);
  assert.equal(terminal.totalCpuPercent, 12);
  // A process whose parent is not in the list is a root.
  assert.deepEqual(buildTree(procs.filter((x) => x.pid !== 500), "cpu", "desc").map((r) => r.depth), [0, 1, 0, 1, 0]);
});

test("processes group by workspace: terminal id prefix first, then cwd; App first", () => {
  const workspaces = [
    { localId: "ws-lisbon", directoryName: "lisbon", workspacePath: "/w/lisbon" },
    { localId: "ws-osaka", directoryName: "osaka", workspacePath: "/w/osaka" },
  ];
  const a = attributeWorkspaces(procs, workspaces);
  assert.equal(a.pidToWorkspaceId.get(511), "ws-lisbon");
  assert.equal(a.pidToWorkspaceId.get(521), "ws-osaka");
  assert.equal(a.pidToWorkspaceId.get(500), undefined);
  // "/w/lisbonx" is not inside "/w/lisbon".
  assert.equal(attributeWorkspaces([p(1, 0, "x", 0, 0, { cwd: "/w/lisbonx" })], workspaces).pidToWorkspaceId.size, 0);
  assert.deepEqual(
    groupByWorkspace(procs, a).map((g) => [g.name, g.processes.map((x) => x.pid)]),
    [["App", [500, 501]], ["lisbon", [510, 511]], ["osaka", [520, 521]]],
  );
});

test("copy text has the totals line and one line per process with the full command", () => {
  const usage = { totalCpuPercent: 3, totalMemoryKb: 2048, processes: [p(7, 1, "node", 3, 2048, { command: "node a.js --t=<redacted>", copyCommand: "node a.js --t=x", cwd: "/w" })] };
  assert.equal(copyText(usage, new Map([[7, "lisbon"]])), "CPU 3.0% Memory 2.0 MB\nnode 3.0% 2.0 MB (pid=7 ppid=1 cmd=node a.js --t=x ws=lisbon)");
  assert.equal(copyText({ ...usage, processes: [{ ...usage.processes[0], copyCommand: undefined }] }), "CPU 3.0% Memory 2.0 MB\nnode 3.0% 2.0 MB (pid=7 ppid=1 cmd=node a.js --t=<redacted>)");
});
