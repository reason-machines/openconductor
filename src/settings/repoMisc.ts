// Settings › repository › Misc (Conductor 0.87.6's `Sba` registry in
// renderApp-D_fmY7hW.js): the copy, the Preview URLs row model (`X3a`, saved
// by `wJs`), the path split (`bj`) and the IPC behind "Files to copy" (`Z3a`,
// preview `Nei`) and "Remove repository" (`J3a`).
import { invoke } from "@tauri-apps/api/core";
import type { PreviewUrl } from "./types.ts";

export const MISC_COPY = {
  icon: { title: "Icon", description: "Shown next to the repository name in the sidebar." },
  rootPath: { title: "Root path", description: "Do not move or delete this directory. Instead, remove the repository in OpenConductor." },
  workspacesPath: { title: "Workspaces path", description: "Do not move or delete the workspace subdirectories. Instead, archive workspaces in OpenConductor." },
  previewUrls: {
    title: "Preview URLs",
    description:
      "Set the terminal panel's Open URLs. The first URL is the default; additional URLs appear in its menu. Supports OpenConductor variables such as $CONDUCTOR_PORT. Use $((CONDUCTOR_PORT + 1)) through $((CONDUCTOR_PORT + 9)) for other allocated ports. Leave blank to detect a URL from output.",
    namePlaceholder: "Name",
    urlPlaceholder: "https://localhost:$CONDUCTOR_PORT",
    add: "Add preview URL",
  },
  filesToCopy: {
    title: "Files to copy",
    description: "OpenConductor will automatically copy these file paths in each new workspace.",
    placeholder: ".env\n*.local\n!.keep.local",
    noCheckout: "Files to copy is unavailable until this repository has a linked local checkout.",
    worktreeinclude: "Using .worktreeinclude from this repository. Remove that file to edit these patterns here.",
    saveError: "Failed to save files to copy",
  },
  remove: {
    title: "Remove repository",
    description: "Remove this repository and its workspaces from OpenConductor.",
    button: "Remove repository",
    removed: "Repository removed successfully",
  },
} as const;

/** Conductor's default "Files to copy" when nothing is set (`xBt`). */
export const DEFAULT_FILE_INCLUDE_GLOBS = ".env*";

export interface PreviewRow {
  id: string;
  name: string;
  url: string;
}

let nextRow = 0;
const row = (name = "", url = ""): PreviewRow => ({ id: `row-${nextRow++}`, name, url });

/** Editor rows for the saved URLs; always at least one (empty) row, as Conductor's `c`. */
export function previewRows(urls: readonly PreviewUrl[] | null | undefined): PreviewRow[] {
  const rows = (urls ?? []).filter((u) => u.url.trim() !== "").map((u) => row(u.name ?? "", u.url));
  return rows.length > 0 ? rows : [row()];
}

export const emptyPreviewRow = (): PreviewRow => row();

/** What to save (`wJs`): trimmed, rows without a URL dropped; `null` clears the setting. */
export function previewValue(rows: readonly PreviewRow[]): PreviewUrl[] | null {
  const urls = rows.map((r) => ({ name: r.name.trim(), url: r.url.trim() })).filter((r) => r.url !== "");
  return urls.length === 0 ? null : urls.map((u) => (u.name ? u : { url: u.url }));
}

/** Swap row `index` with its neighbour `delta` away; out of range leaves them alone. */
export function movePreviewRow(rows: readonly PreviewRow[], index: number, delta: -1 | 1): PreviewRow[] {
  const to = index + delta;
  if (to < 0 || to >= rows.length) return [...rows];
  const next = [...rows];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** `bj`: the directory part (muted) and the last segment, e.g. `/Users/demo/code/` + `tide-web`. */
export function splitPath(path: string): { directory: string; fileName: string } {
  const at = path.replace(/\/+$/, "").lastIndexOf("/");
  if (at < 0) return { directory: "", fileName: path };
  return { directory: path.slice(0, at + 1), fileName: path.slice(at + 1) };
}

export interface FilesToCopyPreview {
  source: "worktreeinclude" | "settings" | "default";
  contents: string;
  files: string[];
}

/** The files a new workspace would get with `globs` (`null`: no setting, so `.env*`). */
export function filesToCopyPreview(repoPath: string, globs: string | null): Promise<FilesToCopyPreview> {
  return invoke<FilesToCopyPreview>("repo_files_to_copy_preview", { repoPath, globs });
}

/** Remove the repository and its workspaces; its checkout, branches and remotes stay. */
export function removeRepository(repoId: string): Promise<void> {
  return invoke<void>("db_remove_repo", { repoId });
}
