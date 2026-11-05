// Thin bridge to the Rust side. Every call degrades gracefully in a plain
// browser (vite dev / preview) so the shell can be developed without Tauri.
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

export const inTauri = (): boolean => isTauri();

export async function appInfo(): Promise<AppInfo> {
  if (!inTauri()) return { name: "OpenConductor", version: "0.1.0", platform: "browser" };
  return invoke<AppInfo>("app_info");
}

export interface FolderInspection {
  isDir: boolean;
  hasGit: boolean;
  origin: string | null;
}

/** Backend folder checks for Open project (`inspect_project_folder`). */
export async function inspectProjectFolder(path: string): Promise<FolderInspection> {
  return invoke<FolderInspection>("inspect_project_folder", { path });
}

export interface RepositoryDto {
  id: string;
  name: string;
  root: string;
  defaultBranch: string;
}

/** Register a local checkout with the workspace service (`add_repository`). */
export async function addRepository(path: string): Promise<RepositoryDto> {
  return invoke<RepositoryDto>("add_repository", { path });
}

/** Native folder picker; returns null when cancelled or outside Tauri. */
export async function pickFolder(title: string): Promise<string | null> {
  if (!inTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false, title });
  return typeof picked === "string" ? picked : null;
}
