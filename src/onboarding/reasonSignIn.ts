import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { inTauri, openUrl } from "../backend";
import { signedIn, type ReasonAccount } from "../settings/agents/reasonModes";
import { rememberConnection } from "../settings/connectedDefault";

export const SIGN_UP_LABEL = "Sign up";
export const OPENING_LABEL = "Opening browser...";
export const FINISH_IN_BROWSER = "Finish signing in in the browser window.";
export const PRIVACY_LABEL = "Privacy";
export const PRIVACY_URL = "https://reasonmachines.com/privacy-policy";
export const SIGN_IN_PROMPT = "Sign in to continue.";
export const SKIP_LABEL = "Continue without signing in";
export const START_FAILED = "Couldn't start sign-in. Try again.";
export const SIGN_IN_FAILED = "Sign-in failed";
export const POLL_MS = 1000;

export type ReasonLoginState =
  | { state: "idle" }
  | { state: "starting"; attemptId: string }
  | { state: "waiting"; attemptId: string; prompt: { url: string; code: string | null } }
  | { state: "connected"; account: ReasonAccount }
  | { state: "cancelled" }
  | { state: "timedOut" }
  | { state: "failed"; message: string };

export type ReasonSignInState = ReasonLoginState | { state: "checking" };
type Snapshot = {
  state: ReasonSignInState;
  busy: "starting" | "cancelling" | null;
  browserError: string | null;
  statusError: string | null;
};

function nullableText(value: unknown): string | null {
  if (value === null || typeof value === "string") return value;
  throw new Error("Invalid Reason account response");
}

function parseWorkspace(value: unknown): ReasonAccount["workspaces"][number] {
  if (typeof value !== "object" || value === null || !("slug" in value) || typeof value.slug !== "string" || !("name" in value) || typeof value.name !== "string" || !("selected" in value) || typeof value.selected !== "boolean" || !("connected" in value) || typeof value.connected !== "boolean") throw new Error("Invalid Reason workspace response");
  return { slug: value.slug, name: value.name, selected: value.selected, connected: value.connected };
}

function parseAccount(value: unknown): ReasonAccount {
  if (typeof value !== "object" || value === null || !("version" in value) || !("name" in value) || !("email" in value) || !("credential" in value) || !("error" in value) || !("organization" in value) || !("workspaces" in value) || !Array.isArray(value.workspaces) || !("computerConnected" in value) || typeof value.computerConnected !== "boolean") throw new Error("Invalid Reason account response");
  return {
    version: nullableText(value.version), name: nullableText(value.name), email: nullableText(value.email),
    credential: nullableText(value.credential), error: nullableText(value.error), organization: nullableText(value.organization),
    workspaces: value.workspaces.map(parseWorkspace), computerConnected: value.computerConnected,
  };
}

function parseLoginState(value: unknown): ReasonLoginState {
  if (typeof value !== "object" || value === null || !("state" in value)) throw new Error("Invalid Reason sign-in response");
  switch (value.state) {
    case "idle": case "cancelled": case "timedOut": return { state: value.state };
    case "connected": {
      if (!("account" in value)) break;
      const account = parseAccount(value.account);
      const error = account.error;
      if (!signedIn(account)) return { state: "failed", message: error || "Your Reason sign-in is no longer valid. Try again." };
      return { state: "connected", account };
    }
    case "failed":
      if ("message" in value && typeof value.message === "string") return { state: "failed", message: value.message };
      break;
    case "starting":
      if ("attemptId" in value && typeof value.attemptId === "string") return { state: "starting", attemptId: value.attemptId };
      break;
    case "waiting": {
      if (!("attemptId" in value) || typeof value.attemptId !== "string" || !("prompt" in value) || typeof value.prompt !== "object" || value.prompt === null || !("url" in value.prompt) || typeof value.prompt.url !== "string" || !("code" in value.prompt)) break;
      const url = new URL(value.prompt.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") break;
      return { state: "waiting", attemptId: value.attemptId, prompt: { url: url.href, code: nullableText(value.prompt.code) } };
    }
  }
  throw new Error("Invalid Reason sign-in response");
}

let snapshot: Snapshot = { state: { state: "checking" }, busy: null, browserError: null, statusError: null };
const listeners = new Set<() => void>();
const openedAttempts = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let revision = 0;
let statusRead: Promise<void> | null = null;
const active = (state: ReasonSignInState) => state.state === "starting" || state.state === "waiting";
const getSnapshot = () => snapshot;

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function queuePoll() {
  clearTimeout(timer);
  if (active(snapshot.state)) timer = setTimeout(() => void refreshReasonSignIn(), POLL_MS);
}

async function openSignInPage(state: Extract<ReasonLoginState, { state: "waiting" }>) {
  publish({ ...snapshot, browserError: null });
  try {
    await openUrl(state.prompt.url);
  } catch {
    if (snapshot.state.state === "waiting" && snapshot.state.attemptId === state.attemptId) {
      publish({ ...snapshot, browserError: "Couldn't open your default browser. Open the sign-in page again to continue." });
    }
  }
}

function accept(state: ReasonLoginState) {
  if (state.state === "connected") void rememberConnection("reason").catch((error: unknown) => console.error("Could not save first connected runtime", error));
  publish({ ...snapshot, state, statusError: null, browserError: state.state === "waiting" ? snapshot.browserError : null });
  if (state.state === "waiting" && !openedAttempts.has(state.attemptId)) {
    openedAttempts.add(state.attemptId);
    void openSignInPage(state);
  }
  queuePoll();
}

export function refreshReasonSignIn(): Promise<void> {
  if (statusRead) return statusRead;
  if (!inTauri()) {
    accept({ state: "idle" });
    return Promise.resolve();
  }
  const request = revision;
  statusRead = invoke<unknown>("reason_login_status")
    .then((value) => { if (request === revision) accept(parseLoginState(value)); })
    .catch(() => {
      if (request !== revision) return;
      publish({ ...snapshot, state: snapshot.state.state === "checking" ? { state: "idle" } : snapshot.state, statusError: "Couldn't check Reason sign-in. Try refreshing." });
    })
    .finally(() => { statusRead = null; queuePoll(); });
  return statusRead;
}

async function start(workspace?: string): Promise<void> {
  if (snapshot.busy || active(snapshot.state)) return;
  if (!inTauri()) {
    accept({ state: "failed", message: "Reason sign-in runs in the desktop app." });
    return;
  }
  const request = ++revision;
  publish({ ...snapshot, busy: "starting", browserError: null, statusError: null });
  try {
    const value = await invoke<unknown>("reason_login_start", { workspace: workspace ?? null });
    if (request === revision) accept(parseLoginState(value));
  } catch {
    if (request === revision) accept({ state: "failed", message: START_FAILED });
  } finally {
    if (request === revision) publish({ ...snapshot, busy: null });
  }
}

async function cancel(): Promise<void> {
  const state = snapshot.state;
  if (snapshot.busy || (state.state !== "starting" && state.state !== "waiting")) return;
  const request = ++revision;
  clearTimeout(timer);
  publish({ ...snapshot, busy: "cancelling", browserError: null, statusError: null });
  try {
    const value = await invoke<unknown>("reason_login_cancel", { attemptId: state.attemptId });
    if (request === revision) accept(parseLoginState(value));
  } catch {
    if (request === revision) publish({ ...snapshot, statusError: "Couldn't cancel sign-in. Try again." });
  } finally {
    if (request === revision) { publish({ ...snapshot, busy: null }); queuePoll(); }
  }
}

function reopen(): Promise<void> {
  return snapshot.state.state === "waiting" ? openSignInPage(snapshot.state) : Promise.resolve();
}

function subscribe(listener: () => void) {
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) void refreshReasonSignIn();
  return () => { listeners.delete(listener); };
}

export function useReasonSignIn() {
  return { ...useSyncExternalStore(subscribe, getSnapshot, getSnapshot), start, cancel, retry: start, reopen, refresh: refreshReasonSignIn };
}

export async function readReasonStatus(): Promise<{ account: ReasonAccount | null; error: string | null }> {
  if (!inTauri()) return { account: null, error: null };
  try {
    const account = parseAccount(await invoke<unknown>("reason_account_status"));
    const error = account.error;
    return signedIn(account) ? { account, error: null } : { account: null, error };
  } catch {
    return { account: null, error: "Couldn't check Reason sign-in. Try refreshing." };
  }
}

export async function signOutOfReason(): Promise<void> {
  const result = await invoke<{ ok: boolean; message: string }>("reason_logout");
  if (!result.ok) throw new Error("Couldn't sign out of Reason. Try again.");
  revision++;
  accept({ state: "idle" });
  await refreshReasonSignIn();
}

export const openPrivacy = () => openUrl(PRIVACY_URL).catch(() => undefined);
