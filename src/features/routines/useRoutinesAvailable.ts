// Whether the sidebar shows Routines. Conductor shows its row only for a cloud
// organization with automations on (`I = automations_enabled && fc(org) === "cloud"`,
// renderApp @10,033,007); OpenConductor's cloud is Reason, so the row shows once the
// `reason` CLI is signed in (`reason_account_status`, Settings › Agents › Reason).
// The /routines pages themselves open either way and say when Reason is signed out.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useSyncExternalStore } from "react";

let signedIn = false;
let checkedAt = 0;
const listeners = new Set<() => void>();
const RECHECK_MS = 60_000;

function check(): void {
  if (!isTauri() && !("__TAURI_INTERNALS__" in window)) return;
  if (Date.now() - checkedAt < RECHECK_MS && checkedAt !== 0) return;
  checkedAt = Date.now();
  invoke<{ email?: string | null; name?: string | null }>("reason_account_status").then(
    (a) => set(Boolean(a?.email || a?.name)),
    () => set(false),
  );
}

function set(v: boolean): void {
  if (v === signedIn) return;
  signedIn = v;
  for (const l of listeners) l();
}

/** True once Reason answers that it is signed in; rechecked on window focus at most once a minute. */
export function useRoutinesAvailable(): boolean {
  useEffect(() => {
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => signedIn,
    () => false,
  );
}
