import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Toaster, useToasts } from "../components/Toast";
import { countRepos, finishFirstRun, readFirstRunStep } from "./api";
import { FINISH_FAILED, FIRST_RUN_DONE_STEP, firstRunView, parseFirstRunStep } from "./firstRun";
import { ExitOnboardingButton, FirstRunOnboarding, StartupLoader } from "./FirstRunOnboarding";

interface Loaded {
  step: number;
  repoCount: number | undefined;
}

/**
 * The startup part of Conductor's auth guard (renderApp `Bxa`): read the
 * onboarding step and the repositories, show a loader until both are known,
 * then the first-run onboarding or the app. A failed read counts as unset,
 * as the reference's queries do (step "1", repositories unknown).
 * `?demo=1` runs on the built-in demo state and skips the gate.
 */
export function FirstRunGate({ children }: { children: ReactNode }) {
  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [path, setPath] = useState(window.location.pathname);
  const [busy, setBusy] = useState(false);
  const { toasts, show, dismiss } = useToasts();

  useEffect(() => {
    if (demo) return;
    let live = true;
    void Promise.all([
      readFirstRunStep().catch(() => null),
      countRepos().catch(() => undefined),
    ]).then(([raw, repoCount]) => {
      if (live) setLoaded({ step: parseFirstRunStep(raw), repoCount });
    });
    return () => {
      live = false;
    };
  }, [demo]);

  const goHome = useCallback(() => {
    window.history.replaceState(window.history.state, "", "/" + window.location.search);
    setPath("/");
  }, []);

  const onContinue = useCallback(() => {
    if (busy) return;
    setBusy(true);
    finishFirstRun().then(
      () => {
        setBusy(false);
        setLoaded((l) => (l ? { ...l, step: FIRST_RUN_DONE_STEP } : l));
        goHome();
      },
      (err: unknown) => {
        setBusy(false);
        console.error("[onboarding] Failed to finish onboarding", err);
        show("error", FINISH_FAILED);
      },
    );
  }, [busy, goHome, show]);

  if (demo) return <>{children}</>;
  const view = firstRunView({ loaded: loaded !== null, step: loaded?.step ?? NaN, repoCount: loaded?.repoCount, path });
  if (view === "app") return <>{children}</>;
  if (view === "loading") return <StartupLoader />;
  return (
    <>
      <FirstRunOnboarding onContinue={onContinue} busy={busy} />
      {view === "onboarding-route" && <ExitOnboardingButton onExit={goHome} />}
      <Toaster toasts={toasts} dismiss={dismiss} />
    </>
  );
}
