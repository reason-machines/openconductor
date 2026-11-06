// parity:diff.discard:ui parity:diff.changes-list:ui
// Right-click menu on a changed file in the changes list.
//
// Conductor's file context menu (renderApp `Svs`, mounted for Changes rows by
// `syi` and for the file tree by `Bvs`; read with REA as data), in order:
//   View (eye)                       - not for directories
//   Attach in chat (plus)            - only where the caller can attach; the
//                                      Changes row passes no attach handler
//   Open in ▸ (arrow-up-right)       - installed apps that open files, with
//                                      number keys 1-9 (`X7t`, `J7t` = 9)
//   Copy path (copy)
//   Copy relative path (copy)        - only with a workspace path
//   ── Discard changes (undo-2)      - only for a file with changes
// Copy toasts are "Copied path to clipboard" / "Copied relative path to clipboard" (`n5`).
import { useEffect, useState } from "react";
import { ContextMenu, MenuItem, MenuSeparator, SubMenu } from "../../components/menu/ContextMenu";
import { ArrowUpRightIcon, CopyIcon, EyeIcon, Undo2Icon } from "../../components/menu/menuIcons";
import { AppIcon } from "../openIn/OpenInButton";
import { NUMBERED_ROWS, loadOpenInApps, type OpenInApp } from "../openIn/apps";

/**
 * Apps Conductor's catalog marks `supportsFileOpen` (its `pLr` filter for a
 * file's "Open in"); terminals and apps without the flag are left out.
 */
export const FILE_OPEN_APP_IDS: ReadonlySet<string> = new Set([
  "finder", "cursor", "vscode", "vscode-short", "zed", "zed-preview", "zed-nightly", "vscodium", "devin", "sublime",
  "pycharm", "pycharm-ce", "intellij", "intellij-ce", "intellij-ultimate", "intellij-community", "android-studio", "xcode",
  "rider", "rubymine", "webstorm", "phpstorm", "goland", "datagrip", "trae", "antigravity",
]);

export interface FileMenuActions {
  view: () => void;
  /** Absolute path; absent while the workspace has no worktree on disk. */
  copyPath?: () => void;
  copyRelativePath: () => void;
  discard: () => void;
  /** Opens the file in an app; absent without a worktree (no "Open in"). */
  openIn?: (appId: string) => void;
}

interface Props {
  path: string;
  at: { x: number; y: number };
  actions: FileMenuActions;
  onClose: () => void;
}

/** The installed apps that can open a file, in catalog order. */
function useFileApps(enabled: boolean): OpenInApp[] {
  const [apps, setApps] = useState<OpenInApp[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadOpenInApps()
      .then((all) => live && setApps(all.filter((a) => FILE_OPEN_APP_IDS.has(a.id))))
      .catch(() => live && setApps([]));
    return () => {
      live = false;
    };
  }, [enabled]);
  return apps;
}

export function FileContextMenu({ path, at, actions, onClose }: Props) {
  const apps = useFileApps(actions.openIn !== undefined);
  return (
    <ContextMenu at={at} label={`Actions for ${path}`} onClose={onClose}>
      <MenuItem icon={<EyeIcon />} onSelect={actions.view}>
        View
      </MenuItem>
      {actions.openIn && apps.length > 0 && (
        <SubMenu icon={<ArrowUpRightIcon />} label="Open in">
          {apps.map((app, i) => (
            <MenuItem key={app.id} icon={<AppIcon app={app} size={14} />} numberKey={i < NUMBERED_ROWS ? i + 1 : undefined} onSelect={() => actions.openIn?.(app.id)}>
              {app.name}
            </MenuItem>
          ))}
        </SubMenu>
      )}
      {actions.copyPath && (
        <MenuItem icon={<CopyIcon />} onSelect={actions.copyPath}>
          Copy path
        </MenuItem>
      )}
      <MenuItem icon={<CopyIcon />} onSelect={actions.copyRelativePath}>
        Copy relative path
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Undo2Icon />} onSelect={actions.discard}>
        Discard changes
      </MenuItem>
    </ContextMenu>
  );
}
