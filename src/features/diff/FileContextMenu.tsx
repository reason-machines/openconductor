// parity:diff.discard:ui parity:diff.changes-list:ui
// Right-click menu on a changed file in the changes list.
//
// Conductor's file context menu (renderApp-D_fmY7hW.js `Svs` @2,702,409, read with REA on
// sven m5 max as data) is a Base UI ContextMenu (`kS` > `gy`, the shared `cm` popup) with,
// in order: [eye] View, [paperclip] Attach in chat (only where a row passes `onAttach`, the
// All files tree; a Changes row (`syi`) does not), [arrow-up-right] Open in ▸ (the installed
// apps that open a single file, `pLr`, each with its 1-9 number key while the submenu is
// open, `X7t`/`cJe`), [copy] Copy path (absolute), [copy] Copy relative path (only with a
// workspace path), then a separator and [undo-2] Discard changes (only for a file with
// changes; it opens the same confirmation, in the "All changes" view).
import { useEffect, useState, type KeyboardEvent } from "react";
import { ContextMenu, MenuItem, MenuSeparator, SubMenu } from "../../components/menu/ContextMenu";
import { ArrowUpRightIcon, CopyIcon, EyeIcon, Undo2Icon } from "../../components/menu/menuIcons";
import { AppIcon } from "../openIn/OpenInButton";
import { NUMBERED_ROWS, loadOpenInApps, supportsFileOpen, type OpenInApp } from "../openIn/apps";

export interface FileMenuActions {
  view: () => void;
  copyPath: () => void;
  copyRelativePath?: () => void;
  discard: () => void;
  /** Opens the file in an installed app; absent without a worktree on disk. */
  openIn?: (app: OpenInApp) => void;
}

interface Props {
  path: string;
  at: { x: number; y: number };
  actions: FileMenuActions;
  onClose: () => void;
}

const OPEN_IN = "Open in";

/** The installed apps a single file opens in, once loaded (empty until then, or on error). */
function useFileApps(enabled: boolean): OpenInApp[] {
  const [apps, setApps] = useState<OpenInApp[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadOpenInApps().then(
      (all) => live && setApps(all.filter((a) => supportsFileOpen(a.id))),
      () => live && setApps([]),
    );
    return () => {
      live = false;
    };
  }, [enabled]);
  return apps;
}

export function FileContextMenu({ path, at, actions, onClose }: Props) {
  const { openIn } = actions;
  const apps = useFileApps(openIn !== undefined);
  // Number keys pick an app while the Open in submenu has focus (Conductor's `cJe` while `G`).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!openIn || e.metaKey || e.ctrlKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
    if (!(document.activeElement instanceof Element) || !document.activeElement.closest(`[role=menu][aria-label="${OPEN_IN}"]`)) return;
    const app = apps[Number(e.key) - 1];
    if (!app) return;
    e.preventDefault();
    onClose();
    openIn(app);
  };
  return (
    <ContextMenu at={at} onClose={onClose} label={`Actions for ${path}`} onKeyDown={onKeyDown}>
      <MenuItem icon={<EyeIcon />} onSelect={actions.view}>
        View
      </MenuItem>
      {openIn && apps.length > 0 && (
        <SubMenu icon={<ArrowUpRightIcon />} label={OPEN_IN}>
          {apps.map((app, i) => (
            <MenuItem key={app.id} className="cm-app-row" onSelect={() => openIn(app)} trailing={i < NUMBERED_ROWS ? <span className="cm-app-key">{i + 1}</span> : undefined}>
              <span className="cm-app-name">
                <AppIcon app={app} size={14} />
                <span>{app.name}</span>
              </span>
            </MenuItem>
          ))}
        </SubMenu>
      )}
      <MenuItem icon={<CopyIcon />} onSelect={actions.copyPath}>
        Copy path
      </MenuItem>
      {actions.copyRelativePath && (
        <MenuItem icon={<CopyIcon />} onSelect={actions.copyRelativePath}>
          Copy relative path
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon={<Undo2Icon />} onSelect={actions.discard}>
        Discard changes
      </MenuItem>
    </ContextMenu>
  );
}
