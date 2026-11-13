// parity:chat.linkLinear — Conductor's pick-issues-dialog (VVt/wA, renderApp @7,444,222).
// Opens with chat.linkLinear (Cmd+I). Lists open GitHub issues via gh_issue_list_open;
// for the unconnected state it shows a "Run gh auth login" prompt (Conductor renderApp @7,444,650).
// Linear is listed with a "Connect Linear" prompt leading to account settings.
// Selecting an issue attaches a brief context note to the active composer.
//
// Evidence: REA static corpus, retained-reference renderApp bundle offsets 7,444,222–7,444,720.
// Acquisition: read-only byte extraction. No target JavaScript executed.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { DialogFrame } from "../../components/DialogFrame.tsx";
import { listIssues } from "../../workspace/api.ts";
import { matches, type SourceState } from "../../workspace/createFrom.ts";
import type { CreateFrom } from "../../workspace/createFlow.ts";
import type { TextAttachment } from "../diff/chatAttachment.ts";

interface Props {
  /** Filesystem path of the workspace checkout, forwarded to gh_issue_list_open. */
  repoPath: string | null;
  /** Called when the user picks an issue; the caller attaches it to the composer. */
  onSelect: (attachment: TextAttachment) => void;
  /** Called when the dialog should navigate to Settings › Personal › Account. */
  onOpenAccountSettings: () => void;
  onClose: () => void;
}

export function LinkIssueDialog({ repoPath, onSelect, onOpenAccountSettings, onClose }: Props) {
  const [issues, setIssues] = useState<SourceState<CreateFrom>>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [pointer, setPointer] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    void listIssues(repoPath).then(setIssues);
  }, [repoPath]);

  const ready = issues.status === "ready";
  const rows: CreateFrom[] = ready
    ? issues.items.filter((i) => matches(i, query))
    : [];

  // Reset pointer when the filtered list changes.
  useEffect(() => { setPointer(0); }, [query, issues.status]);

  function scrollPointer(next: number) {
    const item = listRef.current?.children[next] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!ready || rows.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (pointer + 1) % rows.length;
      setPointer(next);
      scrollPointer(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = (pointer - 1 + rows.length) % rows.length;
      setPointer(next);
      scrollPointer(next);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[pointer];
      if (row) pick(row);
    }
  }

  function pick(row: CreateFrom) {
    if (row.kind !== "issue") return;
    const text = row.url
      ? `${row.key}: ${row.title}\n${row.url}`
      : `${row.key}: ${row.title}`;
    onSelect({ name: `issue-${row.key.replace(/^#/, "")}.txt`, text });
    onClose();
  }

  return (
    <DialogFrame kind="dialog" titleId="link-issue-title" onClose={onClose} className="link-issue-dialog">
      <style>{styles}</style>
      <header className="link-issue-header">
        <h2 id="link-issue-title">Link issue</h2>
      </header>
      <div className="link-issue-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="link-issue-search-icon">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          className="link-issue-input"
          placeholder="Search issues by number or title"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={handleKey}
          aria-label="Search issues"
          autoFocus
        />
      </div>
      <div className="link-issue-list" ref={listRef} role="listbox" aria-label="Issues">
        {issues.status === "loading" && (
          <div className="link-issue-state">
            <span className="sb-ws-loader link-issue-loader" aria-hidden />
            <span>Loading issues…</span>
          </div>
        )}
        {issues.status === "error" && (
          <div className="link-issue-state link-issue-error" role="alert">{issues.message}</div>
        )}
        {/* GitHub unavailable: matches Conductor renderApp @7,444,650 */}
        {issues.status === "unavailable" && issues.reason === "no_github" && (
          <div className="link-issue-state link-issue-setup">
            <p className="link-issue-setup-hint">GitHub is not connected. Run <code>gh auth login</code> in a terminal to sign in.</p>
          </div>
        )}
        {issues.status === "unavailable" && issues.reason === "no_remote" && (
          <div className="link-issue-state link-issue-setup">
            <p className="link-issue-setup-hint">No GitHub remote found for this workspace.</p>
          </div>
        )}
        {/* Linear: "Connect Linear" setup prompt → account settings */}
        {issues.status === "unavailable" && issues.reason === "no_linear" && (
          <div className="link-issue-state link-issue-setup">
            <p className="link-issue-setup-hint">Linear is not connected.</p>
            <button
              type="button"
              className="btn btn-primary link-issue-connect"
              onClick={() => { onOpenAccountSettings(); onClose(); }}
            >
              Connect Linear
            </button>
          </div>
        )}
        {ready && rows.length === 0 && query && (
          <div className="link-issue-state">No issues match <strong>{query}</strong>.</div>
        )}
        {ready && rows.length === 0 && !query && (
          <div className="link-issue-state">No open issues found.</div>
        )}
        {rows.map((row, i) => row.kind === "issue" ? (
          <div
            key={`${row.provider}:${row.key}`}
            role="option"
            aria-selected={i === pointer}
            className={`link-issue-row${i === pointer ? " is-selected" : ""}`}
            onMouseEnter={() => setPointer(i)}
            onClick={() => pick(row)}
          >
            <span className="link-issue-key">{row.key}</span>
            <span className="link-issue-title">{row.title}</span>
          </div>
        ) : null)}
      </div>
    </DialogFrame>
  );
}

const styles = `
.modal.project-dialog.link-issue-dialog { width: 480px; padding: 0; overflow: hidden; display: flex; flex-direction: column; max-height: 480px; }
.link-issue-header { padding: 16px 16px 0; }
.link-issue-header h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
.link-issue-search { display: flex; align-items: center; gap: 6px; padding: 0 12px 8px; border-bottom: 1px solid var(--border); }
.link-issue-search-icon { flex: none; color: var(--muted-foreground); }
.link-issue-input { flex: 1; background: none; border: 0; outline: none; font-size: 13px; color: var(--foreground); }
.link-issue-input::placeholder { color: var(--muted-foreground); }
.link-issue-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.link-issue-row { display: flex; align-items: center; gap: 8px; padding: 7px 14px; cursor: pointer; border-radius: 4px; }
.link-issue-row:hover, .link-issue-row.is-selected { background: var(--hover); }
.link-issue-key { font-family: var(--font-mono); font-size: 11px; color: var(--muted-foreground); white-space: nowrap; flex: none; }
.link-issue-title { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.link-issue-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 16px; color: var(--muted-foreground); font-size: 13px; text-align: center; }
.link-issue-state.link-issue-error { color: var(--destructive); }
.link-issue-setup-hint { margin: 0; }
.link-issue-connect { margin-top: 4px; }
.link-issue-loader { width: 14px; height: 14px; border: 1.5px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin .6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;
