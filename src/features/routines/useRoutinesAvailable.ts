// Routines needs both the explicit OpenConductor cloud-UI opt-in and a signed-in Reason CLI.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useSyncExternalStore } from "react";
import { useBoolPref } from "../../settings/useBoolPref";

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
  const cloudUI = useBoolPref("experimental_cloud_ui");
  useEffect(() => {
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);
  const available = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => signedIn,
    () => false,
  );
  return cloudUI && available;
}
