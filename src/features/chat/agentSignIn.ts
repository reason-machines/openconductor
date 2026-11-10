// When a chat turn failed because its agent is not signed in, the turn's
// error links to that agent's tab on Settings › Agents (Sven's redesign: no
// onboarding step, the chat sends you there). The Claude Code rule is
// Conductor 0.87.6's `oVt` (renderApp-D_fmY7hW.js, read on sven m5 max):
// "please run /login", "authentication_error", or a 401 with "invalid
// authentication credentials". Codex and Reason use the messages their CLIs
// and app servers end a turn with (Codex: "unexpected status 401
// Unauthorized", see src-tauri/src/agent/codex_events.rs).
import type { ChatAgentId } from "./agentChoice.ts";

const PATTERNS: Record<ChatAgentId, readonly string[]> = {
  claude: ["please run /login", "authentication_error", "not logged in", "invalid api key", "oauth token has expired"],
  codex: ["401 unauthorized", "not logged in", "codex login", "invalid api key", "incorrect api key", "token_expired", "refresh token"],
  reason: ["reason login", "not signed in", "not logged in", "401 unauthorized", "authentication required", "authentication_required"],
};

/** True when `error` says the chat's agent is not signed in. */
export function isSignInFailure(agent: ChatAgentId, error: string | null | undefined): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  if (agent === "claude" && error.includes("401") && e.includes("invalid authentication credentials")) return true;
  return PATTERNS[agent].some((p) => e.includes(p));
}

export const AGENT_LABEL: Record<ChatAgentId, string> = { reason: "Reason", claude: "Claude Code", codex: "Codex" };

/** The copy under the failed turn. */
export function signInCopy(agent: ChatAgentId) {
  const label = AGENT_LABEL[agent];
  if (agent === "reason") return {
    badge: "Authentication required",
    text: "Sign in to Reason in your browser. Your original message will continue automatically in this chat.",
    action: "Sign in to Reason",
  };
  return {
    badge: "Authentication required",
    text: `${label} is not signed in. Sign in on its Settings › Agents tab, then send your message again.`,
    action: `Open ${label} settings`,
  };
}
