import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { LoginScreen } from "../../src/onboarding/SignIn";
import type { LoginPrompt, ReasonAccount } from "../../src/settings/agents/reasonModes";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";
import "../../src/onboarding/onboarding.css";

const params = new URLSearchParams(location.search);
const emptyAccount: ReasonAccount = { version: null, name: null, email: null, credential: null, error: null, organization: null, workspaces: [], computerConnected: false };
const fixtureAccount: ReasonAccount = { ...emptyAccount, name: "Isolated fixture", email: "fixture@example.invalid" };
const prompt: LoginPrompt = { url: "https://example.invalid/isolated-sign-in", code: "TEST-CODE", message: "Synthetic login response" };
let account = emptyAccount;
let attempts = 0;
let resolveStart: ((prompt: LoginPrompt) => void) | undefined;
Reflect.set(window, "isTauri", true);
Reflect.set(window, "__TAURI_INTERNALS__", {
  async invoke(command: string) {
    if (command === "reason_account_status") return account;
    if (command === "reason_login_start") {
      attempts++;
      const start = params.get("start");
      if (start === "failed" || (start === "retry" && attempts === 1)) throw new Error("Synthetic login failure");
      if (start === "already-signed-in") {
        account = fixtureAccount;
        return { ...prompt, url: null };
      }
      if (start === "delayed") return new Promise<LoginPrompt>((resolve) => { resolveStart = resolve; });
      return prompt;
    }
    if (command === "plugin:opener|open_url") return;
    throw new Error(`Isolated sign-in fixture does not implement ${command}`);
  },
});
document.documentElement.dataset.theme = "dark";
document.documentElement.dataset.colorPalette = "stone";

function Fixture() {
  const [visible, setVisible] = useState(true);
  const [events, setEvents] = useState<string[]>([]);
  const record = (event: string) => setEvents((old) => [...old, event]);
  return <>
    {visible && <LoginScreen onDone={() => record("done")} onFailed={(title) => record(title)} />}
    <aside style={{ position: "fixed", bottom: 0, padding: 12, background: "var(--background)", borderTop: "1px solid var(--border)", width: "100%" }}>
      <p>Isolated IPC fixture; no browser login, account, workspace or filesystem is changed.</p>
      <button type="button" onClick={() => { account = fixtureAccount; }}>Resolve synthetic account</button>
      <button type="button" onClick={() => setVisible((old) => !old)}>{visible ? "Hide sign-up" : "Show sign-up"}</button>
      <button type="button" onClick={() => resolveStart?.(prompt)}>Resolve delayed start</button>
      <output data-testid="events">{JSON.stringify(events)}</output>
    </aside>
  </>;
}
const root = document.getElementById("root");
if (root) createRoot(root).render(params.get("strict") === "0" ? <Fixture /> : <StrictMode><Fixture /></StrictMode>);
