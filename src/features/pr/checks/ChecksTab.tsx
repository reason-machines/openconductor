// parity:pr.checks:ui
// Checks tab of the right panel (ledger `pr.checks`): the PR's CI checks,
// failing first, with a failing GitHub Actions job's log on click and
// "Re-run" for failed jobs, and "Fix errors", which sends the failing logs to
// the workspace's chat (`fixErrors.ts`). Data comes from the workspace's PR lookup
// (`usePullRequest`); after a re-run the jobs show as running until the next
// lookup.
import { Tooltip } from "../../../components/ui/Tooltip.tsx";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { openUrl } from "../../../backend";
import type { Check, ChecksSummary, PrInfo } from "../types";
import { checkLog, repoFixErrorsPrompt, rerunFailedChecks, type CheckLog } from "./api";
import { canFixErrors, FIX_ERRORS_MESSAGE, fixErrorsAttachments, type FixErrorsAttachment } from "./fixErrors";
import { canRerun, checkDuration, checkLink, checkName, checkState, isActionsJob, isFailing, markRerunning, rerunUrls, sortChecks, STATE_LABEL, type CheckState } from "./checks";
import { DEMO_CHECKS, demoChecksEnabled } from "./demo";
import "./checks.css";

interface Props {
  /** Worktree the `gh` commands run in. */
  worktree: string | null;
  pr: PrInfo | null;
  refresh: () => Promise<void>;
  /** Repository id, for its fix-errors prompt. */
  repoId: string;
  /** Sends a message with attachments to the workspace's own chat; unset when there is none. */
  sendToChat?: (text: string, attachments: FixErrorsAttachment[]) => void;
  /** An archived workspace: Re-run and Fix errors are disabled. */
  readOnly?: boolean;
}

const ICON: Record<CheckState, string> = { running: "◌", failed: "✕", passed: "✓", skipped: "⤼", neutral: "–", pending: "•" };

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

type LogState = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; log: CheckLog };

function LogView({ log }: { log: LogState }) {
  if (log.state === "loading") return <p className="muted small check-log-note">Loading log…</p>;
  if (log.state === "error") return <p className="error small check-log-note">Failed to fetch check logs: {log.message}</p>;
  if (log.log.kind === "unavailable") {
    return (
      <div className="check-log-note">
        <p className="muted small">{log.log.message}</p>
        {log.log.annotation && <pre className="check-log">{log.log.annotation}</pre>}
      </div>
    );
  }
  return <pre className="check-log">{log.log.logs}</pre>;
}

export function ChecksTab({ worktree, pr, refresh, repoId, sendToChat, readOnly = false }: Props) {
  const demo = !isTauri() && demoChecksEnabled();
  const live: ChecksSummary | null = demo ? DEMO_CHECKS : (pr?.status?.checks ?? null);
  // A re-run's optimistic state, dropped when the next lookup arrives.
  const [override, setOverride] = useState<ChecksSummary | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, LogState>>({});
  useEffect(() => setOverride(null), [live]);
  useEffect(() => {
    setLogs({});
    setOpen(null);
    setError(null);
  }, [pr?.number, pr?.headRefOid]);

  const summary = override ?? live;
  const checks = summary?.checks ? sortChecks(summary.checks) : [];
  const now = useNow(checks.some((c) => checkState(c) === "running"));

  if (!pr && !demo) {
    return <div className="placeholder small"><p>No pull request for this branch yet.</p><p>Checks appear here once it has one.</p></div>;
  }
  if (pr?.isMerged && !demo) return <div className="checks"><div className="placeholder small"><p>PR #{pr.number} is merged.</p></div></div>;
  if (checks.length === 0) return <div className="checks"><div className="placeholder small"><p>No checks reported for this pull request.</p></div></div>;

  const failing = summary?.failing ?? [];
  const rerun = async () => {
    if (!worktree && !demo) return;
    const urls = rerunUrls(failing);
    setRerunning(true);
    setError(null);
    try {
      await rerunFailedChecks(worktree ?? "", urls);
      if (summary) setOverride(markRerunning(summary, urls));
      void refresh();
    } catch (e) {
      setError(`Failed to re-run checks: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRerunning(false);
    }
  };

  const fixErrors = async () => {
    if (!sendToChat || (!worktree && !demo)) return;
    setFixing(true);
    setError(null);
    try {
      // As in Conductor, a log that cannot be fetched is left out rather than failing the request.
      const fetched = await Promise.all(failing.map((c) => (isActionsJob(c) ? checkLog(worktree ?? "", c).catch(() => null) : Promise.resolve(null))));
      const custom = await repoFixErrorsPrompt(repoId);
      sendToChat(FIX_ERRORS_MESSAGE, fixErrorsAttachments(fetched, custom));
    } catch (e) {
      setError(`Failed to fix checks: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFixing(false);
    }
  };

  const toggleLog = (c: Check) => {
    const key = c.detailsUrl as string;
    if (open === key) return setOpen(null);
    setOpen(key);
    if (logs[key] && logs[key].state !== "error") return;
    setLogs((l) => ({ ...l, [key]: { state: "loading" } }));
    checkLog(worktree ?? "", c).then(
      (log) => setLogs((l) => ({ ...l, [key]: { state: "ready", log } })),
      (e) => setLogs((l) => ({ ...l, [key]: { state: "error", message: e instanceof Error ? e.message : String(e) } })),
    );
  };

  return (
    <div className="checks" aria-label="Checks">
      <div className="checks-head">
        <span className="checks-title">Checks</span>
        <span className="checks-actions">
          {canRerun(failing) && (
            <Tooltip content="Re-run failed checks">
              <button className="btn btn-small btn-ghost" disabled={readOnly || rerunning} onClick={() => void rerun()}>
                {rerunning ? "Re-running…" : "Re-run"}
              </button>
            </Tooltip>
          )}
          {sendToChat && canFixErrors(failing) && (
            <button className="btn btn-small btn-ghost" disabled={readOnly || fixing} aria-busy={fixing} onClick={() => void fixErrors()}>
              {fixing ? "Fixing…" : "Fix errors"}
            </button>
          )}
        </span>
      </div>
      {error && <p className="error small checks-error" role="alert">{error}</p>}
      <ul className="checks-list">
        {checks.map((c, i) => {
          const state = checkState(c);
          const link = checkLink(c);
          const hasLog = isFailing(c) && isActionsJob(c);
          const key = c.detailsUrl ?? `${checkName(c)}-${i}`;
          const expanded = hasLog && open === c.detailsUrl;
          return (
            <li key={key} className={`check-row state-${state}`}>
              <div
                className={`check-line${hasLog ? " clickable" : ""}`}
                role={hasLog ? "button" : undefined}
                tabIndex={hasLog ? 0 : undefined}
                aria-expanded={hasLog ? expanded : undefined}
                onClick={hasLog ? () => toggleLog(c) : undefined}
                onKeyDown={hasLog ? (e) => (e.key === "Enter" || e.key === " ") && toggleLog(c) : undefined}
              >
                <span className="check-icon" title={STATE_LABEL[state]} aria-label={STATE_LABEL[state]}>{ICON[state]}</span>
                <span className="check-name">{checkName(c)}</span>
                {c.workflowName && <span className="check-workflow">{c.workflowName}</span>}
                <span className="check-duration">{checkDuration(c, now)}</span>
                {link && (
                  <button
                    className="check-open"
                    aria-label="Open externally"
                    title="Open externally"
                    onClick={(e) => {
                      e.stopPropagation();
                      void openUrl(link);
                    }}
                  >
                    ↗
                  </button>
                )}
              </div>
              {expanded && logs[key] && <LogView log={logs[key]} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
