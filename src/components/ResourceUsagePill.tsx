// Sidebar resource usage (experimental setting "Show sidebar resource
// usage", `sidebar_resource_usage`). Conductor 0.87.6 mounts it in the
// sidebar's top bar, left of back/forward (`Isa` @10,063,841 in the decoded
// renderApp-D_fmY7hW.js), though the setting's description says "footer".
// Pill: `bna` @9,942,220 / `vna`; popover body: `qta` @9,933,654; data:
// `zta` / `RFi` (Tauri `get_resource_usage`, every 2 s while on).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useAppPrefs } from "../settings/appPrefs";
import { getResourceTerminalLabels } from "../features/terminal/session";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, ChipIcon, CopyIcon, LayersIcon, ListTreeIcon, TerminalIcon } from "./Icons";
import {
  DEFAULT_VIEW,
  REFRESH_MS,
  SHOW_ALL_THRESHOLD,
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
  sumCpu,
  sumMemory,
  type ProcessUsage,
  type ResourceUsage,
  type SortKey,
  type ViewState,
  type WorkspaceRef,
} from "./resourceUsage";

/** The snapshot, polled while `enabled`; null until the first answer (or outside the app). */
function useResourceUsage(enabled: boolean): ResourceUsage | null {
  const [usage, setUsage] = useState<ResourceUsage | null>(null);
  useEffect(() => {
    if (!enabled || !isTauri()) {
      setUsage(null);
      return;
    }
    let live = true;
    let inFlight = false;
    const poll = () => {
      if (inFlight) return; // `dedupe: "in-flight"`
      inFlight = true;
      invoke<ResourceUsage>("get_resource_usage", { terminalLabels: getResourceTerminalLabels() })
        .then((u) => live && setUsage(dropDefunct(u)))
        .catch((err) => console.warn("resource usage unavailable", err))
        .finally(() => {
          inFlight = false;
        });
    };
    poll();
    const timer = window.setInterval(poll, REFRESH_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [enabled]);
  return usage;
}

/** The sidebar's rendered width, which decides the pill's layout. */
function useSidebarWidth(anchor: React.RefObject<HTMLElement>): number | undefined {
  const [width, setWidth] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const sidebar = anchor.current?.closest(".sidebar");
    if (!sidebar) return;
    const read = () => setWidth(sidebar.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(sidebar);
    return () => ro.disconnect();
  }, [anchor]);
  return width;
}

export function ResourceUsagePill({ workspaces }: { workspaces: WorkspaceRef[] }) {
  const enabled = useAppPrefs().sidebar_resource_usage;
  const usage = useResourceUsage(enabled);
  const probe = useRef<HTMLSpanElement>(null);
  const width = useSidebarWidth(probe);
  const memoryKb = useMemo(() => sumMemory(pillProcesses(usage?.processes ?? [])), [usage]);
  const layout = pillLayout(width);
  if (!enabled || !usage || layout === "hidden") return <span ref={probe} hidden />;
  return (
    <span ref={probe} className="sb-usage-anchor">
      <UsagePopover usage={usage} memoryKb={memoryKb} collapsed={layout === "collapsed"} minWidth={popoverMinWidth(width)} workspaces={workspaces} />
    </span>
  );
}

function UsagePopover({ usage, memoryKb, collapsed, minWidth, workspaces }: { usage: ResourceUsage; memoryKb: number; collapsed: boolean; minWidth: number; workspaces: WorkspaceRef[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: "hidden" });
  const label = `Resource usage: ${formatMemory(memoryKb)}`;

  // Below the pill, right edges aligned (`align: "end"`, `sideOffset: 8`), kept 12 px inside the window.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = trigger.current?.getBoundingClientRect();
      const w = panel.current?.offsetWidth ?? minWidth;
      if (!t) return;
      const left = Math.max(12, Math.min(t.right - w, window.innerWidth - 12 - w));
      setPos({ top: t.bottom + 8, left, minWidth });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, minWidth]);

  useEffect(() => {
    if (!open) return;
    const onEvent = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
        return;
      }
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", onEvent);
    document.addEventListener("keydown", onEvent);
    return () => {
      document.removeEventListener("mousedown", onEvent);
      document.removeEventListener("keydown", onEvent);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="sb-usage-pill"
        data-collapsed={collapsed || undefined}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={collapsed ? label : undefined}
        onClick={() => setOpen(!open)}
      >
        <ChipIcon size={12} />
        {!collapsed && <span className="sb-usage-figure">{formatMemory(memoryKb)}</span>}
      </button>
      {open &&
        createPortal(
          <div ref={panel} className="usage-popover" role="dialog" aria-label="Resources" style={{ position: "fixed", ...pos }}>
            <ResourcesPanel usage={usage} workspaces={workspaces} />
          </div>,
          document.body,
        )}
    </>
  );
}

function SortHeader({ label, sortKey, view, onSort, alignEnd }: { label: string; sortKey: SortKey; view: ViewState; onSort: (k: SortKey) => void; alignEnd?: boolean }) {
  const active = view.sortKey === sortKey;
  return (
    <button type="button" className="usage-sort" data-active={active || undefined} data-end={alignEnd || undefined} onClick={() => onSort(sortKey)}>
      {label}
      {active && (view.sortDirection === "asc" ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />)}
    </button>
  );
}

function ProcessRow({ p, depth, inGroup }: { p: ProcessUsage; depth: number; inGroup: boolean }) {
  return (
    <tr>
      <td className="usage-name" style={{ paddingLeft: `${(inGroup ? 24 : 16) + depth * 12}px` }}>{p.label}</td>
      <td className="usage-cpu">{formatCpu(p.cpuPercent)}</td>
      <td className="usage-mem">{formatMemory(p.memoryKb)}</td>
    </tr>
  );
}

/** `qta`: header (title, toggles, totals), sortable table, "Show all (n)". View state lasts for the session (`Gw`). */
let sessionView: ViewState = DEFAULT_VIEW;

export function ResourcesPanel({ usage, workspaces }: { usage: ResourceUsage; workspaces: WorkspaceRef[] }) {
  const [view, setViewState] = useState<ViewState>(sessionView);
  const setView = useCallback((next: ViewState) => {
    sessionView = next;
    setViewState(next);
  }, []);
  const [copied, setCopied] = useState(false);
  const shown = filterTerminals(usage.processes, view.includeTerminals);
  const attribution = attributeWorkspaces(shown, workspaces);
  const groups = groupByWorkspace(shown, attribution);
  const rows = (list: ProcessUsage[], inGroup: boolean) =>
    view.treeMode
      ? buildTree(list, view.sortKey, view.sortDirection).map((r) => <ProcessRow key={r.process.pid} p={r.process} depth={r.depth} inGroup={inGroup} />)
      : sortFlat(list, view.sortKey, view.sortDirection).map((p) => <ProcessRow key={p.pid} p={p} depth={0} inGroup={inGroup} />);
  const ordered = view.treeMode ? buildTree(shown, view.sortKey, view.sortDirection).map((r) => r.process) : sortFlat(shown, view.sortKey, view.sortDirection);
  const copy = () => {
    const names = new Map([...attribution.pidToWorkspaceId].map(([pid, id]) => [pid, attribution.workspaceIdToName.get(id) ?? id]));
    const text = copyText({ totalCpuPercent: sumCpu(shown), totalMemoryKb: sumMemory(shown), processes: ordered }, names);
    navigator.clipboard.writeText(text).then(() => setCopied(true), (err) => console.error("Failed to copy resource usage", err));
  };
  const onSort = (key: SortKey) => setView({ ...view, ...nextSort(view, key) });
  const toggle = (key: "includeTerminals" | "groupByWorkspace" | "treeMode") => setView({ ...view, [key]: !view[key] });
  const toggleGroup = (name: string) => {
    const next = new Set(view.collapsedGroups);
    if (!next.delete(name)) next.add(name);
    setView({ ...view, collapsedGroups: next });
  };
  return (
    <>
      <div className="usage-head">
        <div className="usage-head-row">
          <p className="usage-title">Resources</p>
          <div className="usage-tools">
            <button type="button" className="usage-tool" data-on={view.includeTerminals || undefined} title={view.includeTerminals ? "Exclude terminal processes" : "Include terminal processes"} aria-label={view.includeTerminals ? "Exclude terminal processes" : "Include terminal processes"} onClick={() => toggle("includeTerminals")}>
              <TerminalIcon size={14} />
            </button>
            <button type="button" className="usage-tool" data-on={view.groupByWorkspace || undefined} title={view.groupByWorkspace ? "Ungroup processes" : "Group by workspace"} aria-label={view.groupByWorkspace ? "Ungroup processes" : "Group by workspace"} onClick={() => toggle("groupByWorkspace")}>
              <LayersIcon size={14} />
            </button>
            <button type="button" className="usage-tool" data-on={view.treeMode || undefined} title={view.treeMode ? "Switch to flat view" : "Switch to tree view"} aria-label={view.treeMode ? "Switch to flat view" : "Switch to tree view"} onClick={() => toggle("treeMode")}>
              <ListTreeIcon size={14} />
            </button>
            <button type="button" className="usage-tool" title={copied ? "Copied" : "Copy resource usage"} aria-label={copied ? "Copied" : "Copy resource usage"} onClick={copy}>
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </button>
          </div>
        </div>
        <p className="usage-totals">
          <span className="usage-muted">CPU</span> <span className="usage-strong">{formatCpu(sumCpu(shown))}</span> <span className="usage-muted">Memory</span> <span className="usage-num">{formatMemory(sumMemory(shown))}</span>
        </p>
      </div>
      <div className="usage-scroll" data-all={view.showAll || undefined}>
        <table className="usage-table">
          <thead>
            <tr>
              <th className="usage-th-name"><SortHeader label="Name" sortKey="name" view={view} onSort={onSort} /></th>
              <th className="usage-th-num"><SortHeader label="CPU" sortKey="cpu" view={view} onSort={onSort} alignEnd /></th>
              <th className="usage-th-mem"><SortHeader label="Mem" sortKey="memory" view={view} onSort={onSort} alignEnd /></th>
            </tr>
          </thead>
          <tbody>
            {view.groupByWorkspace
              ? groups.map((g) => {
                  const collapsed = view.collapsedGroups.has(g.name);
                  return [
                    <tr key={`group-${g.name}`} className="usage-group" onClick={() => toggleGroup(g.name)}>
                      <td>
                        <span className="usage-group-name">
                          <span className="usage-group-chevron" data-open={!collapsed || undefined}><ChevronDownIcon size={12} /></span>
                          <span>{g.name}</span>
                        </span>
                      </td>
                      <td className="usage-cpu">{formatCpu(sumCpu(g.processes))}</td>
                      <td className="usage-mem">{formatMemory(sumMemory(g.processes))}</td>
                    </tr>,
                    ...(collapsed ? [] : rows(g.processes, true)),
                  ];
                })
              : rows(shown, false)}
          </tbody>
        </table>
      </div>
      {shown.length > SHOW_ALL_THRESHOLD && (
        <button type="button" className="usage-show-all" onClick={() => setView({ ...view, showAll: !view.showAll })}>
          {view.showAll ? "Show less" : `Show all (${shown.length})`}
        </button>
      )}
    </>
  );
}
