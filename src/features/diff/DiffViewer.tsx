// parity:diff.changes-list:ui parity:diff.whitespace:ui parity:diff.split-unified:ui parity:diff.viewed:ui parity:diff.navigation:ui
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import "./diff.css";
import { loadWorkspaceDiff, WHOLE_FILE_CONTEXT } from "./api.ts";
import { FileDiffView, STATUS_LETTER, type LineAnchor } from "./FileDiffView";
import { useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { nextUnread, step } from "./nav.ts";
import { DEFAULT_VIEW_OPTIONS, type DiffLayout, type DiffScope, type DiffViewOptions, type FileDiff } from "./types.ts";
import { isViewed, loadViewed, pruneViewed, saveViewed, toggleViewed, viewedCount, type ViewedMap } from "./viewed.ts";

export interface DiffViewerProps {
  workspaceId: string;
  /** Worktree folder; null while the workspace has none on disk. */
  worktree: string | null;
  /** Branch the workspace is compared against for "All changes". */
  baseBranch: string;
  /** Extra toolbar content (comment and review actions). */
  actions?: (files: FileDiff[]) => ReactNode;
  onLineClick?: (file: FileDiff, anchor: LineAnchor) => void;
  annotations?: (file: FileDiff, anchor: LineAnchor) => ReactNode;
  /** Called with the loaded files and the scope they were loaded for. */
  onLoaded?: (files: FileDiff[], scope: DiffScope) => void;
}

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; files: FileDiff[] };

const OPTIONS_KEY = "openconductor.diff.options";

function initialOptions(): DiffViewOptions {
  try {
    return { ...DEFAULT_VIEW_OPTIONS, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_VIEW_OPTIONS;
  }
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <span className="oc-seg">
      {options.map(([v, label]) => (
        <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </span>
  );
}

const LAYOUT_ICON: Record<DiffLayout, ReactNode> = {
  unified: <path d="M3 4h10M3 7h10M3 10h10M3 13h6" />,
  split: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M8 3v10" />
    </>
  ),
  file: (
    <>
      <path d="M4 2.5h5l3 3v8H4z" />
      <path d="M6 8h4M6 10.5h4" />
    </>
  ),
};
const LAYOUT_TITLE: Record<DiffLayout, string> = { unified: "Unified diff", split: "Split diff", file: "Entire file" };

function LayoutToggle({ value, onChange }: { value: DiffLayout; onChange: (v: DiffLayout) => void }) {
  return (
    <span className="oc-seg oc-icons" role="group" aria-label="Diff layout">
      {(Object.keys(LAYOUT_ICON) as DiffLayout[]).map((v) => (
        <button key={v} aria-pressed={v === value} onClick={() => onChange(v)} title={LAYOUT_TITLE[v]} aria-label={LAYOUT_TITLE[v]}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {LAYOUT_ICON[v]}
          </svg>
        </button>
      ))}
    </span>
  );
}

export function DiffViewer({ workspaceId, worktree, baseBranch, actions, onLineClick, annotations, onLoaded }: DiffViewerProps) {
  const [opts, setOpts] = useState<DiffViewOptions>(initialOptions);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [viewed, setViewedMap] = useState<ViewedMap>(() => loadViewed(localStorage, workspaceId));
  const [current, setCurrent] = useState(-1);
  // Files whose unmodified lines were expanded: reloaded alone with full context.
  const [expanded, setExpanded] = useState<Record<string, FileDiff>>({});

  const update = (patch: Partial<DiffViewOptions>) => {
    const next = { ...opts, ...patch };
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    setOpts(next);
  };

  const refresh = useCallback(() => {
    setLoad({ state: "loading" });
    setExpanded({});
    loadWorkspaceDiff(worktree, baseBranch, opts).then(
      (files) => setLoad({ state: "ready", files }),
      (e: unknown) => setLoad({ state: "error", message: String(e) }),
    );
  }, [worktree, baseBranch, opts]);

  useEffect(refresh, [refresh]);
  useEffect(() => setViewedMap(loadViewed(localStorage, workspaceId)), [workspaceId]);

  const files = useMemo(() => (load.state === "ready" ? load.files : []), [load]);

  const setViewed = (map: ViewedMap) => {
    const pruned = pruneViewed(map, files);
    saveViewed(localStorage, workspaceId, pruned);
    setViewedMap(pruned);
  };

  const goTo = useCallback(
    (i: number) => {
      setCurrent(i);
      if (i >= 0) document.getElementById(`oc-file-${encodeURIComponent(files[i].path)}`)?.scrollIntoView({ block: "start" });
    },
    [files],
  );

  useEffect(() => {
    if (load.state === "ready") onLoaded?.(load.files, opts.scope);
  }, [load, opts.scope, onLoaded]);

  // Keys come from the registry (diff.nextFile = ArrowDown, diff.previousFile = ArrowUp,
  // diff.toggleViewed = Ctrl+V), so user overrides apply and bare arrows stay out of text fields.
  useKeybindings({
    "diff.nextFile": () => goTo(step(current, files.length, 1)),
    "diff.previousFile": () => goTo(step(current, files.length, -1)),
    "diff.toggleViewed": () => current >= 0 && current < files.length && setViewed(toggleViewed(viewed, files[current])),
  });

  const expand = (f: FileDiff) =>
    loadWorkspaceDiff(worktree, baseBranch, opts, { path: f.path, contextLines: WHOLE_FILE_CONTEXT }).then(
      ([full]) => full && setExpanded((m) => ({ ...m, [f.path]: full })),
      () => undefined,
    );
  const unread = nextUnread(current, files.length, (i) => isViewed(viewed, files[i]));

  const totals = files.reduce((t, f) => ({ a: t.a + f.additions, d: t.d + f.deletions }), { a: 0, d: 0 });

  return (
    <div className="oc-diff">
      <div className="oc-diff-toolbar">
        <Seg value={opts.scope} options={[["all", "All changes"], ["uncommitted", "Uncommitted"]]} onChange={(scope) => update({ scope })} />
        <LayoutToggle value={opts.layout} onChange={(layout) => update({ layout })} />
        <label title="Hide changes that only touch whitespace">
          <input type="checkbox" checked={opts.ignoreWhitespace} onChange={(e) => update({ ignoreWhitespace: e.target.checked })} /> Hide whitespace
        </label>
        <span className="spacer" />
        {load.state === "ready" && files.length > 0 && (
          <span className="muted">
            {viewedCount(viewed, files)}/{files.length} viewed
          </span>
        )}
        {actions?.(files)}
        <button className="btn btn-small" onClick={refresh} title="Reload changes">
          Refresh
        </button>
      </div>
      {load.state === "loading" && <div className="placeholder small">Loading changes…</div>}
      {load.state === "error" && (
        <div className="placeholder small">
          <p className="error">Couldn't load changes.</p>
          <p className="muted">{load.message}</p>
        </div>
      )}
      {load.state === "ready" && files.length === 0 && (
        <div className="placeholder small" style={{ gridColumn: "1 / -1" }}>
          <p>{opts.scope === "uncommitted" ? "Nothing uncommitted." : "No changes on this branch yet."}</p>
          <p className="muted">Changes the agent makes show up here.</p>
        </div>
      )}
      {load.state === "ready" && files.length > 0 && (
        <>
          <nav className="oc-changes" aria-label="Changed files">
            <div className="oc-changes-header">
              <span>
                {files.length} {files.length === 1 ? "file" : "files"} changed
              </span>
              <span className="oc-count">
                <span className="a">+{totals.a}</span>
                <span className="d">-{totals.d}</span>
              </span>
            </div>
            {files.map((f, i) => (
              <button key={f.path} className={`oc-change${isViewed(viewed, f) ? " viewed" : ""}`} aria-current={i === current} onClick={() => goTo(i)} title={f.path}>
                <span className={`oc-status ${f.status}`}>{STATUS_LETTER[f.status]}</span>
                <span className="name">{f.path}</span>
                <span className="oc-count">
                  <span className="a">+{f.additions}</span>
                  <span className="d">-{f.deletions}</span>
                </span>
              </button>
            ))}
          </nav>
          <div className="oc-files">
            {files.map((f) => (
              <FileDiffView
                key={f.path}
                file={expanded[f.path] ?? f}
                layout={opts.layout}
                ignoreWhitespace={opts.ignoreWhitespace}
                viewed={isViewed(viewed, f)}
                onToggleViewed={() => setViewed(toggleViewed(viewed, f))}
                onLineClick={onLineClick && ((a) => onLineClick(f, a))}
                annotations={annotations && ((a) => annotations(f, a))}
                onExpand={expanded[f.path] ? undefined : () => expand(f)}
              />
            ))}
            {unread >= 0 && (
              <button className="btn btn-small oc-next-unread" onClick={() => goTo(unread)} title="Jump to the next file not marked as viewed">
                Next unread ›
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
