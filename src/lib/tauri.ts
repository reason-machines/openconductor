import { invoke } from "@tauri-apps/api/core";

export type AppInfo = { name: string; version: string };

/** True when running inside the Tauri webview (false in a plain browser or tests). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getAppInfo(): Promise<AppInfo> {
  if (!isTauri()) return { name: "OpenConductor", version: "dev (browser)" };
  return invoke<AppInfo>("app_info");
}
