// Settings › Cloud setup (/settings/cloud/setup), laid out as Conductor
// 0.87.6's `Hua` (renderApp-D_fmY7hW.js @10,298,246; section `dOt`, step
// mark `Uua`, header `Z3`, "You're all set up!" `Gua`): a title with an
// "n/3" count and "Read the docs", then the plan, Agents and GitHub steps,
// each marked done (circle-check, "Set up") or not (circle-dashed, "Not set
// up yet"). The steps are Reason's, read by cloudSetup.ts's rules.
import type { ReactNode } from "react";
import { openUrl } from "../../backend";
import { ReasonMark } from "../agents/icons";
import { GitHubMarkIcon, RefreshIcon } from "../icons";
import {
  REASON_DOCS_URL,
  REASON_GITHUB_URL,
  REASON_PLAN_URL,
  cloudSetupView,
  githubSummary,
  planDescription,
  progressLabel,
  type StepState,
} from "./cloudSetup";
import { useCloudSetup } from "./useCloudSetup";
import "./cloud.css";

const open = (url: string) => void openUrl(url).catch(() => undefined);

/** lucide arrow-up-right (Conductor's `co`), after external links. */
export const ArrowUpRightIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 7h10v10M7 17 17 7" />
  </svg>
);

/** lucide cloud-cog (Conductor's `yui`), the Cloud setup tab's icon. */
export const CloudCogIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m10.852 19.772-.383.924M13.148 14.228l.383-.923M13.148 19.772a3 3 0 1 0-2.296-5.544l-.383-.923M13.53 20.696l-.382-.924a3 3 0 1 1-2.296-5.544M14.772 15.852l.924-.383M14.772 18.148l.924.383M4.2 15.1a7 7 0 1 1 9.93-9.858A7 7 0 0 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.2M9.228 15.852l-.923-.383M9.228 18.148l-.923.383" />
  </svg>
);

/** Conductor's `Uua`: circle-check in the success colour, or a faint circle-dashed. */
function StepMark({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <svg className="cloud-step-mark done" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="Set up" role="img">
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  return (
    <svg className="cloud-step-mark" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label={state === "todo" ? "Not set up yet" : "Checking"} role="img">
      <path d="M10.1 2.182a10 10 0 0 1 3.8 0M13.9 21.818a10 10 0 0 1-3.8 0M17.609 3.721a10 10 0 0 1 2.69 2.7M2.182 13.9a10 10 0 0 1 0-3.8M20.279 17.609a10 10 0 0 1-2.7 2.69M21.818 10.1a10 10 0 0 1 0 3.8M3.721 6.391a10 10 0 0 1 2.7-2.69M6.391 20.279a10 10 0 0 1-2.69-2.7" />
    </svg>
  );
}

/** Conductor's `dOt`: a step's heading, description and content (`bare`: no card around it). */
function Step({ title, suffix, description, state, bare, children }: { title: string; suffix?: string; description?: ReactNode; state: StepState; bare?: boolean; children: ReactNode }) {
  return (
    <section className="cloud-step" data-settings-row aria-label={title}>
      <div className="cloud-step-head">
        <h3>
          <StepMark state={state} />
          {title}
          {suffix && <span className="cloud-step-suffix">{suffix}</span>}
        </h3>
        {description && <p>{description}</p>}
      </div>
      {bare ? children : <div className="cloud-step-card">{children}</div>}
    </section>
  );
}

export function CloudSetupPage({ onOpenReasonSettings, onLaunchCloudWorkspace }: { onOpenReasonSettings: () => void; onLaunchCloudWorkspace: () => void }) {
  const { setup, loading, refresh } = useCloudSetup();
  const view = cloudSetupView(loading && !setup ? null : setup);
  const suffix = progressLabel(view);
  const signedIn = setup?.signedIn === true;
  const workspace = setup?.identity?.workspaceName ?? undefined;

  return (
    <div className="cloud-setup">
      <header className="settings-header cloud-setup-header">
        <div>
          <h1>
            Cloud setup
            {suffix && <span className="cloud-setup-suffix">{suffix}</span>}
          </h1>
          <p>
            Start running workspaces in the cloud.{" "}
            <button type="button" className="cloud-docs-link" onClick={() => open(REASON_DOCS_URL)}>
              Read the docs
              <ArrowUpRightIcon size={12} />
            </button>
          </p>
        </div>
      </header>

      <Step title="Reason" suffix={workspace} description={planDescription(loading && !setup ? null : setup)} state={view.plan} bare>
        {signedIn ? (
          <button type="button" className="btn settings-outline cloud-fit" onClick={() => open(REASON_PLAN_URL)}>
            Manage plan
            <ArrowUpRightIcon />
          </button>
        ) : (
          <button type="button" className="btn settings-outline cloud-fit" onClick={onOpenReasonSettings}>
            Sign in to Reason
          </button>
        )}
      </Step>

      <Step
        title="Agents"
        description="Set up at least one agent. Cloud workspaces run Reason's agent on Reason's models; Claude Code and Codex run only on this Mac."
        state={view.agents}
        bare
      >
        <div className="cloud-option" aria-label="Reason agent">
          <span className="cloud-option-icon">
            <ReasonMark size={20} />
          </span>
          <span className="cloud-option-text">
            <span className="cloud-option-title">Reason</span>
            <span className="cloud-option-help">
              {setup?.agentsAvailable === true
                ? "Reason's managed models are available."
                : setup?.agentsAvailable === false
                  ? "Reason's managed models aren't available in this workspace."
                  : signedIn
                    ? "Checking Reason's models…"
                    : "Sign in to Reason first."}
            </span>
          </span>
        </div>
      </Step>

      <Step title="GitHub" description="Choose how OpenConductor and your agents get access to your repo." state={view.github}>
        <div className="cloud-option" aria-label="Reason GitHub app">
          <span className="cloud-option-icon">
            <GitHubMarkIcon size={18} />
          </span>
          <span className="cloud-option-text">
            <span className="cloud-option-title">
              Reason GitHub app <span className="cloud-badge">Recommended</span>
            </span>
            <span className="cloud-option-help">{githubSummary(setup)}</span>
          </span>
          <span className="cloud-option-actions">
            <button type="button" className="btn settings-outline" onClick={refresh} disabled={loading}>
              <RefreshIcon size={14} />
              Refresh
            </button>
            <button type="button" className="btn settings-outline" onClick={() => open(REASON_GITHUB_URL)}>
              {view.github === "done" ? "Manage" : "Connect GitHub"}
              <ArrowUpRightIcon size={14} />
            </button>
          </span>
        </div>
      </Step>

      {view.complete && !loading && (
        <div className="cloud-all-set">
          <h3>You're all set up!</h3>
          <button type="button" className="btn btn-primary cloud-fit" onClick={onLaunchCloudWorkspace}>
            <CloudCogIcon />
            Launch a cloud workspace
          </button>
        </div>
      )}
    </div>
  );
}
