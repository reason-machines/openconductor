import { useCallback, useEffect, useRef, useState } from "react";
import { useKeybindings } from "../keybindings/KeybindingsProvider";
import { ArrowRightIcon } from "../components/Icons";
import { Wordmark } from "../components/Wordmark";
import { CONTINUE_LABEL, EXIT_LABEL, nextSlideId, SLIDES, type Slide } from "./firstRun";
import { SignUp, useReasonAccount, type SignUpProps } from "./SignIn";
import "./onboarding.css";

/** How long a slide shows before the next one (the reference advances when its video ends). */
export const SLIDE_MS = 8000;
const TICK_MS = 100;

/**
 * The first-run onboarding screen (renderApp `wBi` @10151895 around `Aoa`
 * @10148881): the wordmark, the three slides on the left with Continue below,
 * and the slide's media with a progress bar on the right. Clicking a slide
 * selects it; ArrowDown (`onboarding.nextSlide`) goes to the next and Enter
 * (`onboarding.continue`) continues.
 *
 * Like Conductor, it shows "Sign up" (src/onboarding/SignIn.tsx) until the
 * account is signed in, then "Continue", and moves on by itself once signed
 * in (`wBi`'s auto_advance). The account is Reason's (`reason status`). Local
 * agents need no account, so signed out it also offers "Continue without
 * signing in", and Enter continues either way (Conductor's Enter waits for
 * the account).
 */
export function FirstRunOnboarding({ onContinue, busy, onFailed }: { onContinue: () => void; busy: boolean; onFailed: SignUpProps["onFailed"] }) {
  const account = useReasonAccount();
  // wBi: once signed in, finish without waiting for Continue (once).
  const advanced = useRef(false);
  useEffect(() => {
    if (account && !advanced.current) {
      advanced.current = true;
      onContinue();
    }
  }, [account, onContinue]);
  const [current, setCurrent] = useState<Slide["id"]>("repo");
  const [progress, setProgress] = useState(0);
  const select = useCallback((id: Slide["id"]) => {
    setCurrent(id);
    setProgress(0);
  }, []);
  const next = useCallback(() => select(nextSlideId(current)), [current, select]);

  // Progress runs 0-100% per slide, then the next slide starts (the video's onEnded).
  const started = useRef(Date.now());
  useEffect(() => {
    started.current = Date.now();
    setProgress(0);
    const t = window.setInterval(() => {
      const pct = Math.min(100, ((Date.now() - started.current) / SLIDE_MS) * 100);
      setProgress(pct);
      if (pct >= 100) setCurrent((id) => nextSlideId(id));
    }, TICK_MS);
    return () => window.clearInterval(t);
  }, [current]);

  useKeybindings({
    "onboarding.continue": () => {
      if (!busy) onContinue();
    },
    "onboarding.nextSlide": next,
  });

  const slide = SLIDES.find((s) => s.id === current) ?? SLIDES[0];
  return (
    <div className="onb" data-tauri-drag-region>
      <div className="onb-inner">
        <div className="onb-wordmark">
          <Wordmark />
        </div>
        <div className="onb-grid" data-tauri-drag-region>
          <div className="onb-left" data-tauri-drag-region>
            <div className="onb-slides" role="list">
              {SLIDES.map((s) => (
                <div
                  key={s.id}
                  role="listitem"
                  aria-current={s.id === current ? "true" : undefined}
                  className={`onb-slide ${s.id === current ? "active" : ""}`}
                  onClick={() => select(s.id)}
                >
                  <h2 className="onb-slide-title">{s.title}</h2>
                  <p className="onb-slide-desc">{s.description}</p>
                </div>
              ))}
            </div>
            <div className="onb-actions">
              {account ? (
                <button type="button" className="onb-btn onb-continue" onClick={onContinue} disabled={busy}>
                  {CONTINUE_LABEL}
                  <span className="onb-btn-icon">
                    <ArrowRightIcon size={16} />
                  </span>
                </button>
              ) : (
                <SignUp onFailed={onFailed} onSkip={onContinue} />
              )}
            </div>
          </div>
          <div className="onb-right" data-tauri-drag-region>
            <div className="onb-media">
              <div className="onb-frame" aria-hidden="true">
                <span className="onb-frame-title">{slide.title}</span>
              </div>
              <div className="onb-progress" role="progressbar" aria-label="Slide progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
                <div key={slide.id} className="onb-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** `/first-run-onboarding` (`BCa`): the same screen plus "Exit onboarding", which goes Home without finishing. */
export function ExitOnboardingButton({ onExit }: { onExit: () => void }) {
  return (
    <button type="button" className="btn btn-small onb-exit" onClick={onExit}>
      {EXIT_LABEL}
    </button>
  );
}

/** The guard's startup loader (`nHi`): a centered mark while the step and repositories load. */
export function StartupLoader() {
  return (
    <div className="onb-loader" role="status" aria-label="Loading" data-tauri-drag-region>
      <span className="onb-loader-dot" />
    </div>
  );
}
