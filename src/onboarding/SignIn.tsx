import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "../components/Icons";
import { Wordmark } from "../components/Wordmark";
import type { ReasonAccount } from "../settings/agents/reasonModes";
import {
  FINISH_IN_BROWSER,
  OPENING_LABEL,
  POLL_MS,
  PRIVACY_LABEL,
  SIGN_IN_FAILED,
  SIGN_IN_PROMPT,
  SIGN_UP_LABEL,
  SKIP_LABEL,
  START_FAILED,
  openPrivacy,
  readReasonStatus,
  startReasonSignIn,
} from "./reasonSignIn";

/** The Reason account: undefined while `reason status` runs, then the account or null. */
export function useReasonAccount() {
  const [account, setAccount] = useState<ReasonAccount | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void readReasonStatus().then((s) => live && setAccount(s.account));
    return () => {
      live = false;
    };
  }, []);
  return [account, setAccount] as const;
}

export interface SignUpProps {
  /** The account once `reason status` reports one. */
  onSignedIn: (account: ReasonAccount | null) => void;
  /** "Sign-in failed" with what `reason status` said. */
  onFailed: (title: string, description: string) => void;
  /** OpenConductor only: go on without an account (carries `.onb-continue`, which drivers click). */
  onSkip: () => void;
}

/**
 * Conductor's sign-up block (`xBi`): "Sign up" with an arrow, which turns into
 * "Opening browser..." with "Finish signing in in the browser window." under
 * it while the sign-in runs, a "Privacy" link, and "Couldn't start sign-in…"
 * when it cannot start. The account is Reason's; the code `reason login`
 * prints is shown too so it can be compared with the page.
 */
export function SignUp({ onSignedIn, onFailed, onSkip }: SignUpProps) {
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [startError, setStartError] = useState(false);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );

  // While the browser sign-in runs, poll `reason status` until an account appears.
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => {
      void readReasonStatus().then((s) => {
        if (!live.current) return;
        if (s.account) {
          window.clearInterval(id);
          setPending(false);
          onSignedIn(s.account);
        } else if (s.error) {
          window.clearInterval(id);
          setPending(false);
          onFailed(SIGN_IN_FAILED, s.error);
        }
      });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [pending, onSignedIn, onFailed]);

  const start = useCallback(() => {
    if (pending) return;
    setStartError(false);
    setCode(null);
    setPending(true);
    void startReasonSignIn().then((r) => {
      if (!live.current) return;
      if (r.kind === "browser") return setCode(r.prompt.code);
      setPending(false);
      if (r.kind === "signed-in") return void readReasonStatus().then((s) => onSignedIn(s.account));
      console.warn("[sign-in] reason login failed", r.message);
      setStartError(true);
    });
  }, [pending, onSignedIn]);

  return (
    <div className="onb-signin">
      <button type="button" className="onb-btn onb-signup" onClick={start}>
        {pending ? OPENING_LABEL : SIGN_UP_LABEL}
        <span className="onb-btn-icon onb-signup-icon">
          <ArrowRightIcon size={16} />
        </span>
      </button>
      <p className="onb-links">
        <button type="button" className="onb-link" onClick={() => void openPrivacy()}>
          {PRIVACY_LABEL}
        </button>
        <button type="button" className="onb-link onb-continue onb-skip" onClick={onSkip}>
          {SKIP_LABEL}
        </button>
      </p>
      {pending && (
        <p className="onb-note" role="status">
          {FINISH_IN_BROWSER}
          {code && (
            <>
              {" "}
              The page shows the code <span className="onb-code">{code}</span>.
            </>
          )}
        </p>
      )}
      {startError && (
        <p className="onb-error" role="alert">
          {START_FAILED}
        </p>
      )}
    </div>
  );
}

/**
 * `/login` (Conductor's `xWt`, route `pSa` outside the auth guard): the logo,
 * "Sign in to continue." and the sign-up block, centred. Signing in, or going
 * on without an account, leaves for Home.
 */
export function LoginScreen({ onDone, onFailed }: { onDone: () => void; onFailed: SignUpProps["onFailed"] }) {
  return (
    <div className="onb-login" data-tauri-drag-region>
      <div className="onb-login-inner" data-tauri-drag-region>
        <div data-tauri-drag-region>
          <div className="onb-wordmark">
            <Wordmark />
          </div>
          <p className="onb-login-prompt" data-tauri-drag-region>
            {SIGN_IN_PROMPT}
          </p>
        </div>
        <SignUp onSignedIn={(a) => a && onDone()} onFailed={onFailed} onSkip={onDone} />
      </div>
    </div>
  );
}
