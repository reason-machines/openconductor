import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LoginScreen } from "../../src/onboarding/SignIn";
import type { ReasonLoginState } from "../../src/onboarding/reasonSignIn";
import { ReasonTab } from "../../src/settings/agents/ReasonTab";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/types";
import type { ReasonAccount } from "../../src/settings/agents/reasonModes";
import { Transcript } from "../../src/features/chat/Transcript";
import type { ChatTranscript } from "../../src/features/chat/reducer";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";
import "../../src/settings/settings.css";
import "../../src/settings/agents/agents.css";
import "../../src/onboarding/onboarding.css";

const params = new URLSearchParams(location.search);
const emptyAccount: ReasonAccount = { version: null, name: null, email: null, credential: null, error: null, organization: null, workspaces: [], computerConnected: false };
const fixtureAccount: ReasonAccount = { ...emptyAccount, name: "Isolated fixture", email: "fixture@example.invalid", workspaces: [{ slug: "fixture-workspace", name: "Fixture workspace", selected: true, connected: true }], computerConnected: true };
const prompt = { url: "https://example.invalid/isolated-sign-in", code: "TEST-CODE" };
let state: ReasonLoginState = params.get("account") === "connected" ? { state: "connected", account: fixtureAccount } : { state: "idle" };
let attempts = 0;
let opens = 0;
let cancels = 0;
let statusReads = 0;
let settings: Settings = { ...DEFAULT_SETTINGS, reason: { workspace: params.get("workspace") } };
let deadline: ReturnType<typeof setTimeout> | undefined;
const transcript: ChatTranscript = {
  sessionId: "isolated-sign-in", activeTurn: null,
  messages: [{ id: "prompt", sessionId: "isolated-sign-in", turnId: "failed-turn", role: "user", createdAt: "2026-01-01T12:00:00Z", blocks: [{ type: "text", text: "Continue this Reason chat." }] }],
  turns: { "failed-turn": { status: "failed", error: "Reason is not signed in.", startedAt: "2026-01-01T12:00:00Z", endedAt: "2026-01-01T12:00:01Z" } },
};

Reflect.set(window, "isTauri", true);
Reflect.set(window, "__TAURI_INTERNALS__", {
  async invoke(command: string, args?: Record<string, unknown>) {
    if (command === "reason_account_status") return state.state === "connected" ? state.account : emptyAccount;
    if (command === "reason_logout") { state = { state: "idle" }; return { ok: true, message: "" }; }
    if (command === "reason_login_status") { statusReads++; return state; }
    if (command === "reason_login_cancel") {
      if ((state.state === "starting" || state.state === "waiting") && state.attemptId === args?.attemptId) {
        cancels++;
        clearTimeout(deadline);
        state = { state: "cancelled" };
      }
      return state;
    }
    if (command === "reason_login_start") {
      if (state.state === "starting" || state.state === "waiting" || state.state === "connected") return state;
      attempts++;
      const mode = params.get("start");
      if (mode === "failed" || (mode === "retry" && attempts === 1)) return state = { state: "failed", message: "Couldn't start sign-in. Try again." };
      if (mode === "already-signed-in") return state = { state: "connected", account: fixtureAccount };
      state = { state: mode === "delayed" ? "starting" : "waiting", attemptId: `fixture-${attempts}`, prompt };
      if (mode === "timed-out") deadline = setTimeout(() => { state = { state: "timedOut" }; }, 1200);
      return state;
    }
    if (command === "plugin:opener|open_url") {
      opens++;
      if (params.get("opener") === "failed" && opens === 1) throw new Error("Synthetic browser launch failure");
      return;
    }
    if (command === "provider_status" || command === "connect_provider") return { kind: "reason_login", agent: "reason", ready: true, secrets: [] };
    if (command === "reason_paths") return { systemCli: null, configDir: null };
    if (command === "reason_models") return [];
    throw new Error(`Isolated sign-in fixture does not implement ${command}`);
  },
});
document.documentElement.dataset.theme = params.get("theme") === "light" ? "light" : "dark";
document.documentElement.dataset.colorPalette = "stone";

type View = "onboarding" | "settings" | "chat";
const initialView: View = params.get("surface") === "settings" ? "settings" : params.get("surface") === "chat" ? "chat" : "onboarding";

function Fixture() {
  const [visible, setVisible] = useState(true);
  const [view, setView] = useState<View>(initialView);
  const [events, setEvents] = useState<string[]>([]);
  const [savedSettings, setSettings] = useState(settings);
  const [, redraw] = useState(0);
  useEffect(() => { const timer = setInterval(() => redraw((old) => old + 1), 100); return () => clearInterval(timer); }, []);
  const record = (event: string) => setEvents((old) => [...old, event]);
  return <>
    {visible && (view === "onboarding" ? <LoginScreen onDone={() => record("done")} onFailed={(title) => record(title)} /> : (
      <main className="settings oc-ag" style={{ maxWidth: 780, margin: "48px auto 190px", padding: 24 }}>
        <h1>{view === "settings" ? "Reason settings" : "Reason chat"}</h1>
        {view === "settings" ? <ReasonTab settings={savedSettings} save={async (next) => { settings = next; setSettings(next); return true; }} reload={() => undefined} /> : <Transcript transcript={transcript} chatAgent="reason" />}
      </main>
    ))}
    <aside style={{ position: "fixed", bottom: 0, padding: 12, background: "var(--background)", borderTop: "1px solid var(--border)", width: "100%" }}>
      <p>Isolated IPC fixture. No browser login, account, workspace or filesystem is changed.</p>
      <button type="button" onClick={() => { if (state.state === "starting" || state.state === "waiting") { clearTimeout(deadline); state = { state: "connected", account: fixtureAccount }; } }}>Resolve synthetic account</button>
      <button type="button" onClick={() => { state = { state: "idle" }; }}>Expire synthetic account</button>
      <button type="button" onClick={() => setVisible((old) => !old)}>{visible ? "Hide sign-up" : "Show sign-up"}</button>
      <button type="button" onClick={() => { if (state.state === "starting") state = { ...state, state: "waiting", prompt }; }}>Resolve delayed start</button>
      <button type="button" onClick={() => setView("onboarding")}>Show onboarding</button>
      <button type="button" onClick={() => setView("settings")}>Show Settings sign-in</button>
      <button type="button" onClick={() => setView("chat")}>Show Chat sign-in</button>
      <output data-testid="events">{JSON.stringify(events)}</output>
      <output data-testid="calls">{JSON.stringify({ attempts, opens, cancels, statusReads })}</output>
    </aside>
  </>;
}
const root = document.getElementById("root");
if (root) createRoot(root).render(params.get("strict") === "0" ? <Fixture /> : <StrictMode><Fixture /></StrictMode>);
