import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Toaster, useToasts, type ToastItem } from "../components/Toast";
import { getSettings } from "../settings/api";
import { applyAppearance } from "../settings/appearance";
import { countRepos, finishFirstRun, readFirstRunStep } from "./api";
import { FINISH_FAILED, FIRST_RUN_DONE_STEP, firstRunView, parseFirstRunStep } from "./firstRun";
import { ExitOnboardingButton, FirstRunOnboarding, StartupLoader } from "./FirstRunOnboarding";
import { LoginScreen } from "./SignIn";
import { ensureReasonCli } from "./reasonCli";
import type { AgentKind } from "../settings/types";

/** Conductor's `/login` route (`pSa`), outside the auth guard. */
export const LOGIN_ROUTE = "/login";

interface Loaded {
  step: number;
  repoCount: number | undefined;
}

type CliSetup =
  | { status: "installing" }
  | { status: "ready"; warning?: string }
  | { status: "error"; message: string };

/**
 * The startup part of Conductor's auth guard (renderApp `Bxa`): read the
 * onboarding step and the repositories, show a loader until both are known,
 * then the first-run onboarding or the app. A failed read counts as unset,
 * as the reference's queries do (step "1", repositories unknown).
 * `?demo=1` runs on the built-in demo state and skips the gate.
 *
 * `/login` shows the sign-in screen whatever the gate decides, as Conductor's
 * route outside the guard does. Unlike Conductor, a signed-out user is never
 * sent there: local agents need no account.
 */
export function FirstRunGate({ children }: { children: ReactNode }) {
  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [path, setPath] = useState(window.location.pathname);
  const [busy, setBusy] = useState(false);
  const [cli, setCli] = useState<CliSetup>({ status: "installing" });
  const [installAttempt, retryInstall] = useState(0);
  const [dismissedCliStatus, setDismissedCliStatus] = useState<CliSetup["status"]>();

  useEffect(() => {
    if (demo) return;
    let live = true;
    setCli({ status: "installing" });
    setDismissedCliStatus(undefined);
    void ensureReasonCli().then(
      (result) => { if (live) setCli({ status: "ready", warning: result?.warning }); },
      (error: unknown) => { if (live) setCli({ status: "error", message: error instanceof Error ? error.message : String(error) }); },
    );
    return () => { live = false; };
  }, [demo, installAttempt]);
  const { toasts, show, dismiss } = useToasts();

  // The app shell applies the theme once it mounts; the onboarding and
  // sign-in screens come before it, so they apply the stored one themselves.
  useEffect(() => {
    if (demo) return;
    void getSettings().then(applyAppearance, () => undefined);
  }, [demo]);

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

  const onContinue = useCallback((agent: AgentKind = "reason") => {
    if (busy) return;
    setBusy(true);
    finishFirstRun(agent).then(
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

  const onFailed = useCallback((title: string, description: string) => show("error", title, { description }), [show]);

  if (demo) return <>{children}</>;
  const cliNotice: ToastItem | undefined = cli.status === "installing"
    ? { id: 0, kind: "info", message: "Installing or updating the Reason CLI in the background. You can continue without signing in.", sticky: true }
    : cli.status === "error"
      ? { id: 0, kind: "error", message: "Couldn't set up the Reason CLI. You can keep using OpenConductor.", description: cli.message, sticky: true, extraActions: [{ label: "Retry setup", onClick: () => retryInstall((attempt) => attempt + 1) }] }
      : cli.warning ? { id: 0, kind: "info", message: cli.warning, sticky: true } : undefined;
  const shownToasts = cliNotice && dismissedCliStatus !== cli.status ? [cliNotice, ...toasts] : toasts;
  const toaster = <Toaster toasts={shownToasts} dismiss={(id) => { if (id === 0) setDismissedCliStatus(cli.status); else dismiss(id); }} />;
  if (path === LOGIN_ROUTE)
    return (
      <>
        <LoginScreen onDone={goHome} onFailed={onFailed} />
        {toaster}
      </>
    );
  const view = firstRunView({ loaded: loaded !== null, step: loaded?.step ?? NaN, repoCount: loaded?.repoCount, path });
  if (view === "app") return <>{children}{toaster}</>;
  if (view === "loading") return <StartupLoader />;
  return (
    <>
      <FirstRunOnboarding onContinue={onContinue} busy={busy} onFailed={onFailed} />
      {view === "onboarding-route" && <ExitOnboardingButton onExit={goHome} />}
      {toaster}
    </>
  );
}
