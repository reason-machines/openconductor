// parity:diff.changes-list:ui parity:diff.whitespace:ui parity:diff.split-unified:ui parity:diff.viewed:ui parity:diff.navigation:ui
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import "./diff.css";
import { loadWorkspaceDiff } from "./api.ts";
import { FileDiffView, STATUS_LETTER, type LineAnchor } from "./FileDiffView";
import { useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { step } from "./nav.ts";
import { DEFAULT_VIEW_OPTIONS, type DiffScope, type DiffViewOptions, type FileDiff } from "./types.ts";
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

export function DiffViewer({ workspaceId, worktree, baseBranch, actions, onLineClick, annotations, onLoaded }: DiffViewerProps) {
  const [opts, setOpts] = useState<DiffViewOptions>(initialOptions);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [viewed, setViewedMap] = useState<ViewedMap>(() => loadViewed(localStorage, workspaceId));
  const [current, setCurrent] = useState(-1);

  const update = (patch: Partial<DiffViewOptions>) => {
    const next = { ...opts, ...patch };
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    setOpts(next);
  };

  const refresh = useCallback(() => {
    setLoad({ state: "loading" });
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

  const totals = files.reduce((t, f) => ({ a: t.a + f.additions, d: t.d + f.deletions }), { a: 0, d: 0 });

  return (
    <div className="oc-diff">
      <div className="oc-diff-toolbar">
        <Seg value={opts.scope} options={[["all", "All changes"], ["uncommitted", "Uncommitted"]]} onChange={(scope) => update({ scope })} />
        <Seg value={opts.layout} options={[["unified", "Unified"], ["split", "Split"]]} onChange={(layout) => update({ layout })} />
        <label title="Hide changes that only touch whitespace">
          <input type="checkbox" checked={opts.ignoreWhitespace} onChange={(e) => update({ ignoreWhitespace: e.target.checked })} /> Hide whitespace
        </label>
        <span className="spacer" />
        {load.state === "ready" && files.length > 0 && (
          <span className="muted">
            {viewedCount(viewed, files)}/{files.length} viewed · <span className="add">+{totals.a}</span> <span className="del">-{totals.d}</span>
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
                file={f}
                layout={opts.layout}
                ignoreWhitespace={opts.ignoreWhitespace}
                viewed={isViewed(viewed, f)}
                onToggleViewed={() => setViewed(toggleViewed(viewed, f))}
                onLineClick={onLineClick && ((a) => onLineClick(f, a))}
                annotations={annotations && ((a) => annotations(f, a))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
