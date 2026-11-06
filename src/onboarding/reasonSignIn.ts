// Signing in from the onboarding and `/login`, as Conductor v0.87.6 does it
// (renderApp `xBi` @10,146,096, `xWt` @~10,147,200; evidence/screens/sign-in.md)
// but with a Reason account: OpenConductor's only account is Reason's, used
// for cloud work (Reason Sessions, cloud computers, Loops, Workspaces).
// Claude Code and Codex run locally and need no account, so unlike Conductor
// the app never requires one: every sign-in screen can be skipped.
//
// The flow is the Reason CLI's: `reason login` without a terminal prints a
// link and a code and finishes on its own once the link is used; the app
// opens the link and polls `reason status --json` until an account appears
// (evidence/reason-acp/account.md).

import { invoke } from "@tauri-apps/api/core";
import { inTauri, openUrl } from "../backend";
import { signedIn, type LoginPrompt, type ReasonAccount } from "../settings/agents/reasonModes";

/** `xBi`'s button, verbatim. */
export const SIGN_UP_LABEL = "Sign up";
/** The button while the browser opens and sign-in is under way. */
export const OPENING_LABEL = "Opening browser...";
export const FINISH_IN_BROWSER = "Finish signing in in the browser window.";
export const PRIVACY_LABEL = "Privacy";
export const PRIVACY_URL = "https://reasonmachines.com/privacy-policy";
/** `xWt`'s line under the logo. */
export const SIGN_IN_PROMPT = "Sign in to continue.";
/** OpenConductor only: local agents need no account. */
export const SKIP_LABEL = "Continue without signing in";
/** Conductor: "Couldn't start sign-in. Try again or email support@conductor.build." */
export const START_FAILED = "Couldn't start sign-in. Try again or run reason login in a terminal.";
/** Conductor's toast when the sign-in callback fails; here when `reason status` reports an account error. */
export const SIGN_IN_FAILED = "Sign-in failed";
export const POLL_MS = 2000;

/** `reason status`: the signed-in account (or null) and the error it reported, if any. */
export interface ReasonSignInStatus {
  account: ReasonAccount | null;
  error: string | null;
}

/** Reads the Reason account; no CLI, a failed read or the browser preview count as signed out. */
export async function readReasonStatus(): Promise<ReasonSignInStatus> {
  if (!inTauri()) return { account: null, error: null };
  const a = await invoke<ReasonAccount>("reason_account_status").catch(() => null);
  const error = a?.error ?? null;
  return signedIn(a) ? { account: a, error: null } : { account: null, error };
}

/** What starting a sign-in led to. */
export type SignInStart = { kind: "browser"; prompt: LoginPrompt } | { kind: "signed-in" } | { kind: "failed"; message: string };

/**
 * `reason login`, then the link opened in the browser. A login that prints no
 * link means the CLI is already signed in (or failed): `reason status` says which.
 */
export async function startReasonSignIn(): Promise<SignInStart> {
  if (!inTauri()) return { kind: "failed", message: "Reason sign-in runs in the desktop app." };
  let prompt: LoginPrompt;
  try {
    prompt = await invoke<LoginPrompt>("reason_login_start");
  } catch (e) {
    return { kind: "failed", message: String(e) };
  }
  if (!prompt.url) return (await readReasonStatus()).account ? { kind: "signed-in" } : { kind: "failed", message: prompt.message || "reason login gave no sign-in link" };
  await openUrl(prompt.url).catch(() => undefined);
  return { kind: "browser", prompt };
}

/** Settings › Account › Sign out: `reason logout`. */
export async function signOutOfReason(): Promise<void> {
  const r = await invoke<{ ok: boolean; message: string }>("reason_logout");
  if (!r.ok) throw new Error(r.message || "reason logout failed");
}

export const openPrivacy = () => openUrl(PRIVACY_URL).catch(() => undefined);
