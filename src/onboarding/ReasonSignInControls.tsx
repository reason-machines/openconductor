import { useEffect, useRef, useState } from "react";
import type { ReasonAccount } from "../settings/agents/reasonModes";
import { ArrowRightIcon } from "../components/Icons";
import { inTauri } from "../backend";
import { FINISH_IN_BROWSER, OPENING_LABEL, useReasonSignIn } from "./reasonSignIn";

export interface ReasonSignInControlsProps {
  variant?: "settings" | "chat" | "onboarding";
  label?: string;
  workspace?: string;
  onSignedIn?: (account: ReasonAccount) => void | Promise<void>;
}

export function ReasonSignInControls({ variant = "settings", label = "Sign in with Reason", workspace, onSignedIn }: ReasonSignInControlsProps) {
  const { state, busy, browserError, statusError, start, cancel, reopen, refresh } = useReasonSignIn();
  const continuation = useRef<typeof onSignedIn>();
  const [continuationError, setContinuationError] = useState<string>();
  useEffect(() => {
    if (state.state === "cancelled" || state.state === "timedOut" || state.state === "failed") continuation.current = undefined;
    if (state.state !== "connected" || !continuation.current) return;
    const resume = continuation.current;
    continuation.current = undefined;
    void Promise.resolve().then(() => resume(state.account)).catch((error: unknown) => setContinuationError(error instanceof Error ? error.message : String(error)));
  }, [state]);
  const begin = () => {
    continuation.current = onSignedIn;
    setContinuationError(undefined);
    void start(workspace);
  };
  const onboarding = variant === "onboarding";
  const primaryClass = onboarding ? "onb-btn onb-signup" : variant === "chat" ? "chat-sign-in-open" : "ag-btn ag-primary ag-sm";
  const secondaryClass = onboarding ? "onb-link" : variant === "chat" ? "chat-sign-in-open" : "ag-btn ag-outline ag-sm";
  const noteClass = onboarding ? "onb-note" : "ag-text-sm ag-muted";
  const errorClass = onboarding ? "onb-error" : "ag-detail";
  const pending = busy === "starting" || state.state === "starting" || state.state === "waiting";
  const retry = state.state === "failed" || state.state === "cancelled" || state.state === "timedOut";
  const canCancel = state.state === "starting" || state.state === "waiting";
  const message = state.state === "timedOut" ? "Sign-in timed out. Try again to open a new sign-in page." : state.state === "cancelled" ? "Sign-in cancelled in OpenConductor. Close the browser page if you no longer want to sign in." : null;

  if (state.state === "connected") {
    const selected = state.account.workspaces.find((item) => workspace ? item.slug === workspace : item.selected);
    return (
      <div className="ag-stack-1" role="status" data-testid="reason-login-connected">
        <p className={noteClass}>Connected as {state.account.email ?? state.account.name}.</p>
        <p className={noteClass}>Workspace: {selected?.name ?? state.account.organization ?? "No workspace selected"}</p>
        {continuationError && <p className={errorClass} role="alert">{continuationError}</p>}
        {statusError && <><p className={errorClass} role="alert">{statusError}</p><button type="button" className={secondaryClass} onClick={() => void refresh()}>Refresh sign-in</button></>}
      </div>
    );
  }

  return (
    <div className="ag-stack-2" data-testid="reason-sign-in-controls" data-state={state.state}>
      <button type="button" className={primaryClass} disabled={!inTauri() || state.state === "checking" || pending || busy !== null} onClick={begin}>
        {state.state === "checking" ? "Checking sign-in..." : pending ? OPENING_LABEL : retry ? "Retry sign-in" : label}
        {onboarding && <span className="onb-btn-icon onb-signup-icon"><ArrowRightIcon size={16} /></span>}
      </button>
      {pending && (
        <div className="ag-stack-2" data-testid="reason-login-waiting">
          <p className={noteClass} role="status">{state.state === "waiting" ? FINISH_IN_BROWSER : "Preparing Reason sign-in..."}</p>
          {state.state === "waiting" && state.prompt.code && <p className={noteClass}>The page shows the code <span className="onb-code agk-mono ag-medium" data-testid="reason-login-code">{state.prompt.code}</span>.</p>}
          <div className="ag-row-2">
            {canCancel && <button type="button" className={secondaryClass} disabled={busy !== null} onClick={() => { continuation.current = undefined; void cancel(); }}>{busy === "cancelling" ? "Cancelling..." : "Cancel"}</button>}
            {state.state === "waiting" && <button type="button" className={secondaryClass} disabled={busy !== null} onClick={() => void reopen()}>Open the sign-in page again</button>}
          </div>
        </div>
      )}
      {!pending && message && <p className={noteClass} role="status">{message}</p>}
      {!pending && state.state === "failed" && <p className={errorClass} role="alert">{state.message}</p>}
      {browserError && <p className={errorClass} role="alert">{browserError}</p>}
      {statusError && <div className="ag-stack-1"><p className={errorClass} role="alert">{statusError}</p><button type="button" className={secondaryClass} onClick={() => void refresh()}>Refresh sign-in</button></div>}
      {!inTauri() && <p className={noteClass}>Reason sign-in runs in the desktop app.</p>}
    </div>
  );
}
