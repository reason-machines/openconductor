// Root directory (Settings › Advanced) and a repository's workspaces path
// (repo settings › Misc), over src-tauri/src/root_path_commands.rs. Conductor's
// row is "Conductor root directory" (`advanced:conductor-root`), its confirm
// dialog "Change root path?" (renderApp chunk, `changeRootPath`). Outside
// Tauri a stand-in keeps the root in memory so the row can be tried in vite.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";

export * from "./rootPathModel.ts";

const browser = { root: "/Users/you/Library/Application Support/com.openconductor.app" };

export async function conductorRoot(): Promise<string> {
  if (!inTauri()) return browser.root;
  return invoke<string>("get_conductor_root");
}

/** Forgets every repository, workspace and chat, saves the root and restarts the app. */
export async function changeConductorRoot(newPath: string): Promise<string> {
  if (!inTauri()) {
    browser.root = newPath;
    return newPath;
  }
  return invoke<string>("change_conductor_root", { newPath });
}

export async function repoWorkspacesPath(repoId: string, repoName: string): Promise<string> {
  if (!inTauri()) return `${browser.root}/workspaces/${repoName}`;
  return invoke<string>("repo_workspaces_path", { repoId });
}
