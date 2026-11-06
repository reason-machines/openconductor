import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { CreateFrom } from "../workspace/createFlow";
import {
  COULD_NOT_LOAD_PR,
  FROM_TABS,
  LINEAR_ISSUE_NOT_FOUND,
  SEARCH_PLACEHOLDER,
  TAB_LABEL,
  branchChoices,
  branchToFrom,
  capList,
  dedupeBranches,
  fromLabel,
  listErrorState,
  localBranchName,
  matches,
  nextTab,
  parseRef,
  statusKind,
  statusLine,
  type BranchItem,
  type FromTab,
  type SourceState,
} from "../workspace/createFrom";
import { listIssues, listPullRequests } from "../workspace/api";
import { Tooltip } from "./Tooltip";
import { ArrowRightIcon, BranchIcon, CheckIcon, ChevronDownIcon } from "./Icons";
import { ConductorIcon } from "./ConductorIcon";
import { openSettingsPage } from "../features/chat/ChatModelPicker";
import { usePresence } from "./motion/usePresence";
import { ProviderMarks } from "./create/ProviderMarks";

/** The empty trigger's accessible name and tooltip (Conductor's create-from trigger @10,954,391, read as data). */
export const CREATE_FROM = "Create from";

interface Props {
  value: CreateFrom | null;
  branches: SourceState<BranchItem>;
  /** Local checkout of the chosen repository; PRs and issues are listed through it. */
  repoPath: string | null;
  disabled?: boolean;
  /** Shortcut glyphs for the trigger's tooltip (the createFromPRBranchIssue command). */
  shortcut?: string;
  onChange: (from: CreateFrom | null) => void;
  /** Start with the picker open (Conductor's `createFromOpen`, the repo menu's "Create from..."). */
  defaultOpen?: boolean;
  /** The repository's default branch, left out of the Branches list as in Conductor's `a4a`. */
  defaultBranch?: string | null;
}

/** One row of the open list: a choice, or the "Open settings" row under a GitHub setup hint. */
type Row = { key: string; from: CreateFrom } | { key: string; settings: true };

const same = (a: CreateFrom | null, b: CreateFrom): boolean =>
  a !== null &&
  a.kind === b.kind &&
  (a.kind === "pr" ? b.kind === "pr" && a.number === b.number : a.kind === "branch" ? b.kind === "branch" && a.name === b.name : b.kind === "issue" && a.key === b.key);

/** Conductor's `$Ge` / `L9`: "Select ↵" (or "Open ↵") at the row's end, shown on the highlighted row. */
function EnterHint({ children }: { children: ReactNode }) {
  return (
    <span className="cf-hint">
      {children}
      <ConductorIcon name="corner-down-left" size={12} />
    </span>
  );
}

/** "Create from..." in the create composer's eyebrow, and its PR / branch / issue picker. */
export function CreateFromPicker({ value, branches, repoPath, disabled, shortcut, onChange, defaultOpen = false, defaultBranch = null }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const presence = usePresence(open);
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
  const items = useMemo(() => {
    if (source.status !== "ready") return [];
    if (tab === "branch") {
      const names = branchChoices(dedupeBranches(branches.status === "ready" ? branches.items : []).map(localBranchName), defaultBranch, query);
      return names.map((name): CreateFrom => ({ kind: "branch", name }));
    }
    return source.items.filter((i) => matches(i, query));
  }, [source, tab, branches, defaultBranch, query]);
  const { shown, more } = capList(items);
  const status = refError ?? statusLine(tab, source, items.length, query);
  const kind = refError ? "error" : statusKind(source);
  // Conductor offers "Open settings" under the hint only when GitHub is set up nowhere (not for a missing remote).
  const settingsRow = !refError && source.status === "unavailable" && source.reason === "no_github";
  const rows: Row[] = status ? (settingsRow ? [{ key: "open-github-settings", settings: true }] : []) : shown.map((from) => ({ key: fromLabel(from), from }));

  function close() {
    setOpen(false);
    setQuery("");
    setRefError(null);
  }

  function choose(row: Row | undefined) {
    if (!row) return;
    if ("settings" in row) {
      close();
      return openSettingsPage("account");
    }
    onChange(row.from);
    close();
  }

  function switchTab(t: FromTab) {
    setTab(t);
    setActive(0);
    setRefError(null);
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
    if (hit) return choose({ key: fromLabel(hit), from: hit });
    if (pool.status === "ready" || pool.status === "unavailable") setRefError(ref.kind === "pr" ? COULD_NOT_LOAD_PR : ref.provider === "linear" ? LINEAR_ISSUE_NOT_FOUND : statusLine("issue", pool, 0, q));
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Tab") {
      e.preventDefault();
      switchTab(nextTab(tab, e.shiftKey));
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, Math.min(rows.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  const row = (r: Row, i: number, content: ReactNode) => (
    <div
      key={r.key}
      role="option"
      aria-selected={i === active}
      data-selected={i === active || undefined}
      className="cf-row"
      onMouseMove={() => setActive(i)}
      onMouseDown={(e) => {
        e.preventDefault();
        choose(r);
      }}
    >
      {content}
    </div>
  );

  const renderRow = (r: Row, i: number) => {
    if ("settings" in r)
      return row(r, i, (
        <>
          <ArrowRightIcon size={16} />
          <span className="cf-title">Open settings</span>
          <EnterHint>Open</EnterHint>
        </>
      ));
    const f = r.from;
    const end = same(value, f) ? <span className="cf-check"><CheckIcon size={16} /></span> : <EnterHint>Select</EnterHint>;
    if (f.kind === "pr")
      return row(r, i, (
        <>
          {/* Conductor's `s4a` for an open PR: git-pull-request in the positive colour. */}
          <span className="cf-state cf-open"><ConductorIcon name="git-pull-request" size={16} /></span>
          <span className="cf-number cf-number-pr">#{f.number}</span>
          <span className="cf-title">{f.title}</span>
          {end}
        </>
      ));
    if (f.kind === "branch")
      return row(r, i, (
        <>
          <span className="cf-state"><BranchIcon size={16} /></span>
          <span className="cf-title">{f.name}</span>
          {end}
        </>
      ));
    return row(r, i, (
      <>
        {/* Conductor's `Q6a`: the provider mark, the open-issue circle, the number, the title. */}
        <span className="cf-state cf-open"><ConductorIcon name="circle-dot" size={16} /></span>
        <span className="cf-number cf-number-issue">{f.key}</span>
        <span className="cf-title">{f.title}</span>
        {end}
      </>
    ));
  };

  return (
    <div className="create-from">
      {/* Conductor's create-from trigger: Tooltip "Create from" with its command's shortcut hint. */}
      {/* Empty, Conductor's trigger is only the Linear and GitHub marks and a chevron, named "Create from";
          with a choice it shows the choice and is named by it. */}
      <Tooltip content={CREATE_FROM} shortcut={shortcut}>
        <button type="button" className="create-chip create-from-btn" onClick={() => (open ? close() : setOpen(true))} disabled={disabled} aria-expanded={open} aria-label={value ? undefined : CREATE_FROM}>
          {value ? fromLabel(value) : (
            <>
              <ProviderMarks />
              <ChevronDownIcon size={14} />
            </>
          )}
        </button>
      </Tooltip>
      {value && (
        <button type="button" className="create-chip create-from-clear" aria-label="Clear create from selection" onClick={() => onChange(null)} disabled={disabled}>
          ×
        </button>
      )}
      {/* Conductor's `l4a` popover: w-[28rem] bg-popover ring-popover-ring rounded-lg; the search box first
          (cmdk input, h-11 px-4, no icon), then the PRs / Branches / Issues tabs, then the list (max-h 320). */}
      {presence.mounted && (
        <div className="create-from-panel" data-motion="popup" {...presence.attrs} role="dialog" aria-label="Create new workspace from PR, branch, or issue" onKeyDown={onKey}>
          <div className="cf-input">
            <input
              autoFocus
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder={SEARCH_PLACEHOLDER[tab]}
              aria-label={SEARCH_PLACEHOLDER[tab]}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
          <div className="cf-tabs" role="tablist">
            {FROM_TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={t === tab} data-active={t === tab || undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => switchTab(t)}>
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="cf-list" role="listbox" aria-label={TAB_LABEL[tab]}>
            {status && kind === "empty" ? (
              <p className="cf-empty" role="status">{status}</p>
            ) : (
              <div className="cf-group">
                {tab === "issue" && (source.status === "ready" || settingsRow) && <div className="cf-heading">GitHub</div>}
                {status && kind === "loading" && (
                  <p className="cf-loading" role="status">
                    <span className="clone-spinner" aria-hidden />
                    {status}
                  </p>
                )}
                {status && kind === "error" && <p className="cf-error" role="status">{status}</p>}
                {status && kind === "setup" && <p className="cf-setup" role="status">{status}</p>}
                {rows.map(renderRow)}
                {more > 0 && <div className="cf-more">{more} more</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
