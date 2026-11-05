// Copy and rules for the root directory row and the Workspaces path row
// (Conductor's `advanced:conductor-root` and `misc:workspaces-path`, renderApp
// chunk). Pure, so node --test reaches it without the Tauri bridge.
export const ROOT_TITLE = "OpenConductor root directory";
export const ROOT_DESCRIPTION =
  "Where OpenConductor stores repositories and workspaces. This should be an empty directory that you don't modify directly.";
export const ROOT_WARNING =
  "Changing this removes all existing repos and workspaces from OpenConductor, but leaves their files on disk.";
export const CHANGE_TITLE = "Change root path?";
export const CHANGE_BODY =
  "This will remove all repos, workspaces, and chats from OpenConductor. Files in the old root path won't be deleted; you can delete them manually. The new path should be an empty directory that you don't modify directly.";
export const WORKSPACES_PATH_TITLE = "Workspaces path";
export const WORKSPACES_PATH_DESCRIPTION =
  "Do not move or delete the workspace subdirectories. Instead, archive workspaces in OpenConductor.";

/** The picked folder opens the confirm dialog only when it is a new root (Conductor's `E && E !== r && r`). */
export function isRootChange(current: string | null, picked: string | null): picked is string {
  return Boolean(picked && current && picked !== current);
}
