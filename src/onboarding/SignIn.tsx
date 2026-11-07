import { useEffect, useRef, useState } from "react";
import { Wordmark } from "../components/Wordmark";
import type { ReasonAccount } from "../settings/agents/reasonModes";
import { ReasonSignInControls } from "./ReasonSignInControls";
import {
  PRIVACY_LABEL,
  SIGN_IN_FAILED,
  SIGN_IN_PROMPT,
  SIGN_UP_LABEL,
  SKIP_LABEL,
  openPrivacy,
  useReasonSignIn,
} from "./reasonSignIn";

export function useReasonAccount() {
  const { state, statusError, refresh } = useReasonSignIn();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let live = true;
    void refresh().then(() => { if (live) setChecked(true); });
    return () => { live = false; };
  }, [refresh]);
  return !checked || statusError || state.state === "checking" ? undefined : state.state === "connected" ? state.account : null;
}

export interface SignUpProps {
  onSignedIn?: (account: ReasonAccount) => void;
  onFailed: (title: string, description: string) => void;
  onSkip: () => void;
}

export function SignUp({ onSignedIn, onFailed, onSkip }: SignUpProps) {
  const { state } = useReasonSignIn();
  const account = useReasonAccount();
  const notified = useRef<typeof state | null>(null);
  const connectedNotified = useRef(false);
  useEffect(() => {
    if (notified.current === state) return;
    notified.current = state;
    if (state.state === "failed") onFailed(SIGN_IN_FAILED, state.message);
  }, [state, onFailed]);
  useEffect(() => {
    if (!account || connectedNotified.current) return;
    connectedNotified.current = true;
    onSignedIn?.(account);
  }, [account, onSignedIn]);

  return (
    <div className="onb-signin">
      <ReasonSignInControls variant="onboarding" label={SIGN_UP_LABEL} />
      <p className="onb-links">
        <button type="button" className="onb-link" onClick={() => void openPrivacy()}>{PRIVACY_LABEL}</button>
        <button type="button" className="onb-link onb-continue onb-skip" onClick={onSkip}>{SKIP_LABEL}</button>
      </p>
    </div>
  );
}

export function LoginScreen({ onDone, onFailed }: { onDone: () => void; onFailed: SignUpProps["onFailed"] }) {
  return (
    <div className="onb-login" data-tauri-drag-region>
      <div className="onb-login-inner" data-tauri-drag-region>
        <div data-tauri-drag-region>
          <div className="onb-wordmark"><Wordmark /></div>
          <p className="onb-login-prompt" data-tauri-drag-region>{SIGN_IN_PROMPT}</p>
        </div>
        <SignUp onSignedIn={onDone} onFailed={onFailed} onSkip={onDone} />
      </div>
    </div>
  );
}
