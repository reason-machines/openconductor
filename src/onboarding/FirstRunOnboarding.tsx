import { useCallback, useEffect, useRef, useState } from "react";
import { useKeybindings } from "../keybindings/KeybindingsProvider";
import { ArrowRightIcon } from "../components/Icons";
import { AppMark } from "../components/AppMark";
import { CONTINUE_LABEL, EXIT_LABEL, nextSlideId, SLIDES, type Slide } from "./firstRun";
import { SignUp, useReasonAccount, type SignUpProps } from "./SignIn";
import "./onboarding.css";
import type { AgentKind } from "../settings/types";

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
 * The default agent is an explicit choice. Reason sign-in is optional and
 * does not advance this screen; Continue persists the choice either way.
 */
export function FirstRunOnboarding({ onContinue, busy, onFailed }: { onContinue: (agent: AgentKind) => void; busy: boolean; onFailed: SignUpProps["onFailed"] }) {
  const [agent, setAgent] = useState<AgentKind>("reason");
  const account = useReasonAccount();
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
      if (!busy) onContinue(agent);
    },
    "onboarding.nextSlide": next,
  });

  const slide = SLIDES.find((s) => s.id === current) ?? SLIDES[0];
  return (
    <div className="onb" data-tauri-drag-region>
      <div className="onb-inner">
        <div className="onb-wordmark">
          <AppMark size={96} />
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
              <fieldset className="onb-agent-choice" disabled={busy}>
                <legend>Choose your default agent</legend>
                {([{ id: "claude", label: "Claude Code" }, { id: "codex", label: "Codex" }, { id: "reason", label: "Reason" }] satisfies { id: AgentKind; label: string }[]).map((choice) => (
                  <label key={choice.id}><input type="radio" name="first-run-agent" value={choice.id} checked={agent === choice.id} onChange={() => setAgent(choice.id)} />{choice.label}</label>
                ))}
              </fieldset>
              <p className="onb-note">The Reason CLI is ready for every agent. You can sign in later.</p>
              {account ? (
                <button type="button" className="onb-btn onb-continue" onClick={() => onContinue(agent)} disabled={busy}>
                  {CONTINUE_LABEL}
                  <span className="onb-btn-icon">
                    <ArrowRightIcon size={16} />
                  </span>
                </button>
              ) : (
                <SignUp onFailed={onFailed} onSkip={() => onContinue(agent)} />
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
