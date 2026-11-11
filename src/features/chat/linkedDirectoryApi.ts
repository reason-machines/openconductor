import { invoke, isTauri } from "@tauri-apps/api/core";
import { directoryExcluded, localDirectoryPath } from "./linkedDirectories.ts";

export interface LinkedDirectoryServices {
  browse: () => Promise<string | null>;
  isDirectory: (path: string) => Promise<boolean>;
}

export const localLinkedDirectoryServices: LinkedDirectoryServices = {
  async browse() {
    if (!isTauri()) throw new Error("Browsing local directories requires the desktop app.");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selection = await open({ directory: true, multiple: false, title: "Select directory to link" });
    if (selection === null || typeof selection === "string") return selection;
    throw new Error("Choose one local directory.");
  },
  async isDirectory(path) {
    if (!isTauri()) throw new Error("Checking local directories requires the desktop app.");
    const result = await invoke<unknown>("inspect_project_folder", { path });
    if (typeof result !== "object" || result === null || !("isDir" in result) || typeof result.isDir !== "boolean") {
      throw new Error("Could not check the selected directory.");
    }
    return result.isDir;
  },
};

/** Read-only selection: no workspace registration, linking or filesystem writes. */
export async function chooseLinkedDirectory({ path, excludedPaths = [], services = localLinkedDirectoryServices }: {
  path?: string;
  excludedPaths?: readonly string[];
  services?: LinkedDirectoryServices;
} = {}): Promise<string | null> {
  const selected = path ?? await services.browse();
  if (selected === null) return null;
  const localPath = localDirectoryPath(selected);
  if (!localPath) throw new Error("Choose an absolute local directory path.");
  if (directoryExcluded(localPath, excludedPaths)) throw new Error("This directory is already linked or is the current workspace.");
  if (!await services.isDirectory(localPath)) throw new Error("The selected directory no longer exists or is not a directory.");
  return localPath;
}
