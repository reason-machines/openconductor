import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { SignUp } from "../../src/onboarding/SignIn";
import { ReasonSignInControls } from "../../src/onboarding/ReasonSignInControls";
import { ChatSignInCard } from "../../src/features/chat/ChatSignInCard";
import { useReasonSignIn } from "../../src/onboarding/reasonSignIn";
import "../../src/fonts.css";
import "../../src/theme/tokens.css";
import "../../src/styles.css";
import "../../src/onboarding/onboarding.css";

Reflect.set(window, "isTauri", true);
Reflect.set(window, "__TAURI_INTERNALS__", {
  invoke(command: string, args?: unknown) {
    const bridge = Reflect.get(window, "__pairingInvoke");
    if (typeof bridge !== "function") throw new Error("The pairing Rust bridge is not installed");
    return bridge(command, args);
  },
});
document.documentElement.dataset.theme = "dark";
document.documentElement.dataset.colorPalette = "stone";

const params = new URLSearchParams(location.search);
const initial = params.get("entry") ?? "settings";
const workspace = params.get("workspace") ?? undefined;

function Fixture() {
  const { state } = useReasonSignIn();
  const [entry, setEntry] = useState(initial);
  const [visible, setVisible] = useState(true);
  const [completions, setCompletions] = useState(0);
  return <main style={{ maxWidth: 720, margin: "64px auto", padding: 32 }}>
    <h1>Reason pairing integration fixture</h1>
    <p>Production sign-in controls, real Rust login lifecycle, local fake CLI and HTTP approval only. No native or real sign-in proof.</p>
    <nav aria-label="Sign-in entry point">
      {(["settings", "onboarding", "chat"]).map((name) => <button key={name} onClick={() => setEntry(name)}>{name}</button>)}
      <button onClick={() => setVisible((old) => !old)}>{visible ? "Unmount controls" : "Mount controls"}</button>
    </nav>
    {visible && <section aria-label={`${entry} sign-in`} style={{ marginTop: 24 }}>
      {entry === "onboarding"
        ? <SignUp onSignedIn={() => setCompletions((n) => n + 1)} onFailed={() => undefined} onSkip={() => undefined} />
        : entry === "chat" ? <FixtureChat /> : <ReasonSignInControls variant="settings" workspace={workspace} />}
    </section>}
    <output data-testid="login-state">{JSON.stringify(state)}</output>
    <output data-testid="onboarding-completion-count">{completions}</output>
  </main>;
}

/** A signed-out Reason turn: the failed message, the production card, and the resend once pairing connects. */
function FixtureChat() {
  const [sends, setSends] = useState(0);
  const [replies, setReplies] = useState<string[]>([]);
  const resend = () => {
    setSends((n) => n + 1);
    const bridge = Reflect.get(window, "__pairingInvoke") as (c: string) => Promise<{ email: string | null }>;
    void bridge("reason_account_status").then((a) => setReplies((r) => [...r, `Reason (${a.email}): hello back`]));
  };
  return <div data-testid="fixture-chat">
    <div className="chat-msg chat-user">hello</div>
    <span className="chat-turn-error">Not signed in. Run `reason login`.</span>
    <ChatSignInCard agent="reason" onSignedIn={resend} />
    <output data-testid="chat-send-count">{sends}</output>
    {replies.map((r, i) => <div key={i} className="chat-msg" data-testid="chat-reply">{r}</div>)}
  </div>;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(params.get("strict") === "0" ? <Fixture /> : <StrictMode><Fixture /></StrictMode>);
