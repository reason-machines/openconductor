import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Tooltip } from "../../components/ui/Tooltip.tsx";
import { DropdownMenu, MenuItem, MenuSeparator } from "../../components/menu/ContextMenu.tsx";
import type { Rect } from "../../components/menu/dropdownPlacement.ts";
import type { WorkspaceDiff } from "./useWorkspaceDiff.ts";
import type { ChangesView } from "./changesTree.ts";
import { loadBranchCommits } from "./api.ts";
import type { BranchCommit } from "./types.ts";
import { agoTime } from "../../home/dashboard.ts";

export function ChangesToolbar({ diff, view, onViewChange, targetControl }: { diff: WorkspaceDiff; view: ChangesView; onViewChange: (view: ChangesView) => void; targetControl?: ReactNode }) {
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const [history, setHistory] = useState<{ key: string; commits: BranchCommit[]; error: boolean } | null>(null);
  const historyKey = JSON.stringify([diff.worktree, diff.target]);
  useEffect(() => {
    if (!anchor) return;
    let active = true;
    loadBranchCommits(diff.worktree, diff.target).then(
      (commits) => { if (active) setHistory({ key: historyKey, commits, error: false }); },
      () => { if (active) setHistory({ key: historyKey, commits: [], error: true }); },
    );
    return () => { active = false; };
  }, [anchor, diff.worktree, diff.target, historyKey]);
  const commits = history?.key === historyKey ? history.commits : [];
  const treeLabel = view === "tree" ? "Show flat list" : "Show folder hierarchy";
  const scoped = diff.turn !== null || diff.opts.scope !== "all";
  return (
    <>
      <Tooltip content={treeLabel}>
        <button type="button" className={`rp-icon oc-changes-tree-toggle${view === "tree" ? " on" : ""}`} aria-label={treeLabel} onClick={() => onViewChange(view === "tree" ? "flat" : "tree")}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {view === "tree" ? <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></> : <><path d="M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1ZM20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1ZM3 5a2 2 0 0 0 2 2h3M3 3v13a2 2 0 0 0 2 2h3" /></>}
          </svg>
        </button>
      </Tooltip>
      {scoped ? (
        <Tooltip content="Back to all changes">
          <button type="button" className={`rp-icon oc-changes-scope${typeof diff.opts.scope === "object" || diff.turn ? " oc-changes-historical-scope" : ""}`} aria-label="Back to all changes" onClick={() => diff.update({ scope: "all" })}>
            <span aria-hidden="true">×</span><span>{diff.turn ? "Historical changes" : typeof diff.opts.scope === "object" ? diff.opts.scope.commitHash.slice(0, 7) : "Uncommitted"}</span>
          </button>
        </Tooltip>
      ) : (
        <Tooltip content="Options">
          <button type="button" className="rp-icon oc-changes-options" aria-label="Changes options" aria-haspopup="menu" aria-expanded={anchor !== null} onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
          </button>
        </Tooltip>
      )}
      {anchor && <DropdownMenu anchor={anchor} align="end" label="Changes options" className="oc-changes-options-menu" onClose={close}>
        {targetControl && <><div className="oc-changes-target">Target branch {targetControl}</div><MenuSeparator /></>}
        <MenuItem onSelect={() => diff.update({ scope: "all" })}><span className="oc-changes-option-label">All changes</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m20 6-11 11-5-5" /></svg></MenuItem>
        <MenuItem onSelect={() => diff.update({ scope: "uncommitted" })}><span className="oc-changes-option-label">Uncommitted changes<span className="oc-changes-option-detail">{diff.uncommittedPaths.size ? `${diff.uncommittedPaths.size} ${diff.uncommittedPaths.size === 1 ? "file" : "files"} changed` : "No uncommitted changes"}</span></span><span className="cm-shortcut">⌘⌥U</span></MenuItem>
        {commits.length > 0 && <MenuSeparator />}
        {commits.map((commit) => <MenuItem key={commit.hash} onSelect={() => diff.update({ scope: { type: "commit", commitHash: commit.hash } })}>
          <span className="oc-changes-option-label"><span className="oc-changes-commit-message">{commit.message}</span><span className="oc-changes-option-detail">{commit.hash.slice(0, 7)} • {commit.author} • {agoTime(commit.date)}</span></span>
        </MenuItem>)}
        {history?.key === historyKey && history.error && <div role="status" className="oc-changes-option-detail">Could not load commit history</div>}
      </DropdownMenu>}
    </>
  );
}
