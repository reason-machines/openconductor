// Which icon a path gets, as in Conductor. Conductor 0.87.6 ships 910 SVGs at
// /material-icons/<name>.svg whose bytes are identical to the generated icons
// of the MIT package vscode-material-icons@0.1.1 (sha256 of all 910 checked
// against evidence/frontend/tauri-assets-manifest.json), so OpenConductor uses
// that package's name lookup and serves its icons at the same URL
// (vite.config.ts, materialIcons plugin). Pure module: no React, no DOM.
import { getIconForFilePath, type MaterialIcon } from "vscode-material-icons";

export type { MaterialIcon };

/** Where the build serves the material icons (Conductor's own path). */
export const MATERIAL_ICONS_URL = "/material-icons";

export const materialIconUrl = (name: MaterialIcon): string => `${MATERIAL_ICONS_URL}/${name}.svg`;

/** The file-type icon for a file path: "git" for .gitignore, "python" for .py, "markdown" for .md, "console" for .sh, "file" when nothing matches. */
export function fileIconName(path: string): MaterialIcon {
  return path && !path.endsWith("/") ? getIconForFilePath(path) : "file";
}

/** The folder icon: the generic material folder, open while the folder is expanded. */
export const folderIconName = (open: boolean): MaterialIcon => (open ? "folder-open" : "folder");
