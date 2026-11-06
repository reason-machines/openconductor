import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { CreateFrom } from "../workspace/createFlow";
import {
  COULD_NOT_LOAD_PR,
  FROM_TABS,
  LINEAR_ISSUE_NOT_FOUND,
  TAB_LABEL,
  branchToFrom,
  dedupeBranches,
  fromLabel,
  listErrorState,
  matches,
  nextTab,
  parseRef,
  statusLine,
  type BranchItem,
  type FromTab,
  type SourceState,
} from "../workspace/createFrom";
import { listIssues, listPullRequests } from "../workspace/api";

interface Props {
  value: CreateFrom | null;
  branches: SourceState<BranchItem>;
  /** Local checkout of the chosen repository; PRs and issues are listed through it. */
  repoPath: string | null;
  disabled?: boolean;
  onChange: (from: CreateFrom | null) => void;
  /** Start with the picker open (Conductor's `createFromOpen`, the repo menu's "Create from..."). */
  defaultOpen?: boolean;
}

/** "Create from..." in the create composer's eyebrow, and its PR / branch / issue picker. */
export function CreateFromPicker({ value, branches, repoPath, disabled, onChange, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<FromTab>("pr");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [refError, setRefError] = useState<string | null>(null);
  const [prs, setPrs] = useState<SourceState<CreateFrom>>({ status: "loading" });
  const [issues, setIssues] = useState<SourceState<CreateFrom>>({ status: "loading" });

  useEffect(() => {
    if (!open) return;
    let live = true;
    setPrs({ status: "loading" });
    setIssues({ status: "loading" });
    listPullRequests(repoPath).then((s) => live && setPrs(s), (e) => live && setPrs(listErrorState(e)));
    listIssues(repoPath).then((s) => live && setIssues(s), (e) => live && setIssues(listErrorState(e)));
    return () => {
      live = false;
    };
  }, [open, repoPath]);

  const source: SourceState<CreateFrom> =
    tab === "pr" ? prs : tab === "issue" ? issues : branches.status === "ready" ? { status: "ready", items: dedupeBranches(branches.items).map(branchToFrom) } : branches;
  const items = useMemo(() => (source.status === "ready" ? source.items.filter((i) => matches(i, query)) : []), [source, query]);
  const status = refError ?? statusLine(tab, source, items.length, query);

  function choose(item: CreateFrom | undefined) {
    if (!item) return;
    onChange(item);
    setOpen(false);
    setQuery("");
  }

  function search(q: string) {
    setQuery(q);
    setActive(0);
    setRefError(null);
    const ref = parseRef(q);
    if (!ref) return;
    const tabFor: FromTab = ref.kind === "pr" ? "pr" : "issue";
    setTab(tabFor);
    const pool = tabFor === "pr" ? prs : issues;
    const all = pool.status === "ready" ? pool.items : [];
    const hit = all.find((i) =>
      ref.kind === "pr" ? i.kind === "pr" && i.number === ref.number
      : i.kind === "issue" && (ref.provider === "linear" ? i.key === ref.key : i.key === `#${ref.number}`),
    );
    if (hit) return choose(hit);
    if (pool.status === "ready" || pool.status === "unavailable") setRefError(ref.kind === "pr" ? COULD_NOT_LOAD_PR : ref.provider === "linear" ? LINEAR_ISSUE_NOT_FOUND : statusLine("issue", pool, 0, q));
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Tab") {
      e.preventDefault();
      setTab(nextTab(tab, e.shiftKey));
      setActive(0);
      setRefError(null);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, Math.min(items.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="create-from">
      <button type="button" className="create-chip create-from-btn" onClick={() => setOpen(!open)} disabled={disabled} aria-expanded={open} title="Create new workspace from PR, branch, or issue">
        {value ? fromLabel(value) : "Create from..."}
      </button>
      {value && (
        <button type="button" className="create-chip create-from-clear" aria-label="Clear create from selection" title="Clear create from selection" onClick={() => onChange(null)} disabled={disabled}>
          ×
        </button>
      )}
      {open && (
        <div className="create-from-panel" role="listbox" aria-label="Create new workspace from PR, branch, or issue">
          <div className="create-from-tabs" role="tablist">
            {FROM_TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={t === tab} className={t === tab ? "active" : ""} onClick={() => { setTab(t); setActive(0); setRefError(null); }}>
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
          <input autoFocus value={query} onChange={(e) => search(e.target.value)} onKeyDown={onKey} placeholder={tab === "branch" ? "Search branches" : "Search by number, title, or paste a link"} />
          {status ? (
            <p className="muted small create-from-status" role="status">{status}</p>
          ) : (
            <ul>
              {items.map((item, i) => (
                <li key={fromLabel(item)} role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(item); }}>
                  {fromLabel(item)}
                </li>
              ))}
            </ul>
          )}
          <p className="muted small create-from-hint">Tab switches lists · ↑↓ to move · ↵ to choose</p>
        </div>
      )}
    </div>
  );
}
