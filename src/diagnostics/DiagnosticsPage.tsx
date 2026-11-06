// Help › Diagnostics: Conductor 0.87.6's `/diagnostics` route (`boa`, decoded
// renderApp-D_fmY7hW.js @10,136,010; rows `_oa`, status icons `voa`). A
// full-window page over the app: a 41 px drag strip, then a centred 672 px
// column with Back, the title and description, "Run environment diagnostics"
// and "Copy all console logs"; once a run starts, the progress line and bar
// and one expandable row per check; once it ends, "Copy report" and
// "Copy redacted report". Back and ⌘Esc (`diagnostics.close`) leave.
//
// Not here yet: Conductor's "Ask agent to analyze redacted/unredacted report"
// buttons, which open a new chat with the report attached (chat owns that).
import { useCallback, useRef, useState } from "react";
import { useKeybindings } from "../keybindings/KeybindingsProvider";
import { copyText } from "../features/openIn/apps";
import { ConductorIcon } from "../components/ConductorIcon";
import { Tooltip } from "../components/Tooltip";
import { diagnosticChecks, progress, reportMarkdown, runDiagnostics, type CheckResult } from "./checks";
import { exportConsoleLogs } from "./consoleLog";
import { diagnosticsShell } from "./shell";
import "./diagnostics.css";

type Notify = (kind: "info" | "error", message: string) => void;

interface Props {
  onClose: () => void;
  notify: Notify;
}

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`diag-spinner ${className}`} aria-hidden />;
}

/** `voa`. */
function StatusIcon({ status }: { status: CheckResult["status"] }) {
  switch (status) {
    case "pending":
      return <span className="diag-status-pending" aria-hidden />;
    case "running":
      return <Spinner />;
    case "done":
      return <span className="diag-status-done"><ConductorIcon name="check" size={16} /></span>;
    case "error":
      return <span className="diag-status-error"><ConductorIcon name="circle-alert" size={16} /></span>;
  }
}

/** `_oa`: label, a one-line value inline, or "expand"/"collapse" for a multi-line one. */
function CheckRow({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(false);
  const value = check.value ?? "";
  const hasValue = value.trim().length > 0;
  const multiline = value.includes("\n");
  return (
    <div className="diag-row">
      <button type="button" className="diag-row-head" onClick={() => hasValue && setOpen(!open)} disabled={!hasValue}>
        <StatusIcon status={check.status} />
        <span className={`diag-row-label ${check.status === "pending" ? "is-pending" : ""} ${check.status === "error" ? "is-error" : ""}`}>{check.label}</span>
        {hasValue && !multiline && <span className="diag-row-value">{value}</span>}
        {hasValue && multiline && <span className="diag-row-toggle">{open ? "collapse" : "expand"}</span>}
      </button>
      {open && hasValue && <pre className="diag-row-pre">{value}</pre>}
    </div>
  );
}

export function DiagnosticsPage({ onClose, notify }: Props) {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [results, setResults] = useState<CheckResult[]>([]);
  const [copiedReport, setCopiedReport] = useState<"full" | "redacted" | undefined>();
  const [logs, setLogs] = useState<"idle" | "copying" | "copied">("idle");
  const reports = useRef({ full: "", redacted: "" });
  useKeybindings({ "diagnostics.close": onClose });

  const run = useCallback(async () => {
    setPhase("running");
    setCopiedReport(undefined);
    reports.current = { full: "", redacted: "" };
    try {
      const report = await runDiagnostics(diagnosticChecks(), diagnosticsShell, setResults);
      const [full, redacted] = await Promise.all([reportMarkdown(report, false), reportMarkdown(report, true)]);
      reports.current = { full, redacted };
    } catch (e) {
      notify("error", `Diagnostics failed: ${String(e)}`);
    } finally {
      setPhase("done");
    }
  }, [notify]);

  const copyReport = useCallback(
    async (redacted: boolean) => {
      const text = redacted ? reports.current.redacted : reports.current.full;
      if (!text) return;
      try {
        await copyText(text);
        setCopiedReport(redacted ? "redacted" : "full");
        notify("info", redacted ? "Redacted report copied" : "Report copied to clipboard");
        setTimeout(() => setCopiedReport(undefined), 2000);
      } catch {
        notify("error", "Failed to copy report to clipboard");
      }
    },
    [notify],
  );

  const copyLogs = useCallback(async () => {
    setLogs("copying");
    try {
      await copyText(exportConsoleLogs());
      setLogs("copied");
      notify("info", "Console logs copied to clipboard");
      setTimeout(() => setLogs("idle"), 2000);
    } catch (e) {
      setLogs("idle");
      notify("error", `Failed to copy logs: ${String(e)}`);
    }
  }, [notify]);

  const { finished, total, percent } = progress(results);
  return (
    <div className="diagnostics" data-testid="diagnostics-page">
      <div className="diag-drag" data-tauri-drag-region />
      <div className="diag-scroll">
        <div className="diag-column">
          <button type="button" className="diag-back" onClick={onClose} tabIndex={-1}>
            <ConductorIcon name="arrow-left" size={16} />
            <span>Back</span>
          </button>
          <div>
            <h2 className="diag-title">Diagnostics</h2>
            <p className="diag-desc">Capture information about your environment to help diagnose issues.</p>
          </div>
          <div className="diag-actions">
            <button type="button" className="diag-btn diag-btn-primary" onClick={() => void run()} disabled={phase === "running"}>
              {phase === "running" ? <Spinner /> : <ConductorIcon name="play" size={16} />}
              {phase === "idle" ? "Run environment diagnostics" : phase === "running" ? "Running diagnostics..." : "Run again"}
            </button>
            <button type="button" className="diag-btn diag-btn-outline" onClick={() => void copyLogs()} disabled={logs === "copying"}>
              {logs === "copying" ? <Spinner /> : <ConductorIcon name={logs === "copied" ? "check" : "scroll-text"} size={16} />}
              {logs === "copied" ? "Copied" : "Copy all console logs"}
            </button>
          </div>
          {results.length > 0 && (
            <div className="diag-results">
              {phase === "running" && (
                <div className="diag-progress">
                  <div className="diag-progress-line">
                    <span>Checking ({finished}/{total})</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="diag-progress-track">
                    <div className="diag-progress-bar" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              )}
              <div className="diag-list">
                {results.map((r) => (
                  <CheckRow key={r.label} check={r} />
                ))}
              </div>
              {phase === "done" && (
                <div className="diag-actions">
                  <Tooltip content="Copy the full diagnostics report to your clipboard" side="bottom">
                    <button type="button" className="diag-btn diag-btn-outline" onClick={() => void copyReport(false)}>
                      <ConductorIcon name={copiedReport === "full" ? "check" : "clipboard-copy"} size={16} />
                      {copiedReport === "full" ? "Copied" : "Copy report"}
                    </button>
                  </Tooltip>
                  <Tooltip content="Redacted report hashes the values of all env variables, except a few non-sensitive ones like PATH" side="bottom">
                    <button type="button" className="diag-btn diag-btn-outline" onClick={() => void copyReport(true)}>
                      <ConductorIcon name={copiedReport === "redacted" ? "check" : "shield-check"} size={16} />
                      {copiedReport === "redacted" ? "Copied" : "Copy redacted report"}
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
