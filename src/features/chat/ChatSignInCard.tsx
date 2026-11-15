import { ReasonSignInControls } from "../../onboarding/ReasonSignInControls";
import { rememberPairedWorkspace } from "../../onboarding/reasonChatConnection";
import { openAgentSettings } from "./ChatModelPicker.tsx";
import type { ChatAgentId } from "./agentChoice.ts";
import { signInCopy } from "./agentSignIn.ts";

/**
 * The card under a turn that failed because its agent is signed out. For
 * Reason it runs the in-app browser pairing and, once it connects, sends the
 * failed message again in the same chat (`onSignedIn`), exactly once.
 */
export function ChatSignInCard({ agent, onSignedIn }: { agent: ChatAgentId; onSignedIn?: () => void }) {
  const copy = signInCopy(agent);
  return (
    <div className="chat-sign-in" data-testid="chat-sign-in" data-agent={agent}>
      <span className="chat-sign-in-badge">{copy.badge}</span>
      <p>{copy.text}</p>
      {agent === "reason" ? <ReasonResend onSignedIn={onSignedIn} label={copy.action} /> : (
        <button type="button" className="chat-sign-in-open" onClick={() => openAgentSettings(agent)}>{copy.action}</button>
      )}
    </div>
  );
}

function ReasonResend({ onSignedIn, label }: { onSignedIn?: () => void; label: string }) {
  return (
    <ReasonSignInControls
      variant="chat"
      label={label}
      onSignedIn={async (account) => {
        await rememberPairedWorkspace(account);
        onSignedIn?.();
      }}
    />
  );
}
