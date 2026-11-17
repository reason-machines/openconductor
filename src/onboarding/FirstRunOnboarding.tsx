import { useCallback, useState } from "react";
import { useKeybindings } from "../keybindings/KeybindingsProvider";
import { AppMark } from "../components/AppMark";
import { EXIT_LABEL, nextSlideId, SLIDES, type Slide } from "./firstRun";
import { SignUp, type SignUpProps } from "./SignIn";
import "./onboarding.css";
import type { AgentKind } from "../settings/types";

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
  const [current, setCurrent] = useState<Slide["id"]>("repo");
  const [progress, setProgress] = useState(0);
  const select = useCallback((id: Slide["id"]) => {
    setCurrent(id);
  }, []);
  const next = useCallback(() => {
    setCurrent((id) => nextSlideId(id));
    setProgress(0);
  }, []);

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
              <p className="onb-note">The Reason CLI installs in the background for every agent. You can sign in later.</p>
              <SignUp onFailed={onFailed} onSkip={() => onContinue(agent)} busy={busy} />
            </div>
          </div>
          <div className="onb-right" data-tauri-drag-region>
            <div className="onb-media">
              <div className="onb-frame" aria-hidden="true">
                <video
                  key={slide.id}
                  className="onb-video"
                  src={slide.src}
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  onLoadedData={() => setProgress(0)}
                  onTimeUpdate={({ currentTarget: media }) => {
                    if (Number.isFinite(media.currentTime) && Number.isFinite(media.duration) && media.duration > 0) {
                      setProgress(Math.max(0, Math.min(100, (media.currentTime / media.duration) * 100)));
                    }
                  }}
                  onEnded={next}
                />
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
