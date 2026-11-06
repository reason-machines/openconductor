// "Downloading Claude Code 2.1.284… 12 MB / 80 MB" above the composer while the
// chat agent's bundled binary is not ready (Conductor's `UAo` in the `YNi`
// banner shell, renderApp-D_fmY7hW.js; evidence/persistence/agent-binaries).
import { useEffect, useState } from "react";
import { getSettings } from "../../settings/api";
import { SETTINGS_CHANGED } from "../../settings/appearance";
import { bannerModel, bannerStatus, type BinaryAgent } from "./agentBinaries.ts";
import { agentBinaryStore, useAgentBinaryStatus } from "./agentBinaryStore.ts";
import "./agentBinaryBanner.css";

const EXECUTABLE_KEY = { claude: "claude_code_executable_path", codex: "codex_executable_path" } as const;

/** Settings' executable path for the agent; `loading` until read (Conductor hides the banner meanwhile). */
function useCustomPath(agent: BinaryAgent | undefined): { path: string | null | undefined; loading: boolean } {
  const [read, setRead] = useState<{ agent: BinaryAgent; path: string | null | undefined } | null>(null);
  useEffect(() => {
    if (!agent) return;
    let live = true;
    const load = () =>
      getSettings().then(
        (s) => live && setRead({ agent, path: s[EXECUTABLE_KEY[agent]] }),
        () => live && setRead({ agent, path: undefined }),
      );
    void load();
    window.addEventListener(SETTINGS_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(SETTINGS_CHANGED, load);
    };
  }, [agent]);
  return read && read.agent === agent ? { path: read.path, loading: false } : { path: undefined, loading: true };
}

/** Re-renders every second while `at` is set (the retry countdown, Conductor's `$Ao`). */
function useNow(at: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === undefined) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [at]);
  return now;
}

const Icon = ({ paths, size }: { paths: string[]; size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {paths.map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);
// Lucide download / triangle-alert / refresh-cw, as Conductor draws them (`Mk`, `e0`, `iv`).
const DOWNLOAD = ["M12 15V3", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5"];
const ALERT = ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"];
const REFRESH = ["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"];

/** Shown above the composer of a local chat whose agent is Claude Code or Codex. */
export function AgentBinaryBanner({ agent }: { agent: BinaryAgent | undefined }) {
  const status = useAgentBinaryStatus(agent);
  const custom = useCustomPath(agent);
  const shown = bannerStatus({ agent, local: true, customPath: custom.path, customPathLoading: custom.loading, status });
  const now = useNow(shown?.state === "retrying" ? shown.nextAttemptUnixMs : undefined);
  const [errorOpen, setErrorOpen] = useState(false);
  if (!shown) return null;
  const m = bannerModel(shown, now);
  return (
    <div role="status" className="agent-binary-banner" data-state={shown.state} data-testid="agent-binary-banner">
      <div className="agent-binary-banner-row">
        <div className="agent-binary-banner-main">
          <span className={m.failed ? "agent-binary-banner-icon is-failed" : "agent-binary-banner-icon is-downloading"}>
            <Icon paths={m.failed ? ALERT : DOWNLOAD} size={16} />
          </span>
          <div className="agent-binary-banner-text">
            <span>
              <span className="agent-binary-banner-title">{m.title}</span>
              {m.detail ? <span className="agent-binary-banner-detail">{m.detail}</span> : null}
            </span>
            {m.error ? (
              <>
                {" "}
                <button type="button" className="agent-binary-banner-toggle" aria-expanded={errorOpen} onClick={() => setErrorOpen((o) => !o)}>
                  {errorOpen ? "hide error" : "see error"}
                </button>
              </>
            ) : null}
          </div>
        </div>
        {m.action && agent ? (
          <button type="button" className="agent-binary-banner-action" onClick={() => void agentBinaryStore.retry(agent).catch(() => undefined)}>
            <Icon paths={REFRESH} size={12} />
            {m.action}
          </button>
        ) : null}
      </div>
      {m.error && errorOpen ? <pre className="agent-binary-banner-error">{m.error}</pre> : null}
    </div>
  );
}
