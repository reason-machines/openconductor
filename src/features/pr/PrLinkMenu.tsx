// Right-click menu on a PR number (Conductor's `w_i`, items in prLinkMenu.ts):
// the header PR pill and the "#N" on the PR tab. `usePrLinkMenu` gives the
// trigger's onContextMenu and the menu element to render beside it.
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { ArrowUpRightMenuIcon, ContextMenu, CopyMenuIcon, HashMenuIcon, MenuItem, type Point } from "../../components/ContextMenu";
import { openUrl } from "../../backend.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import { useKeybindingOverrides } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { getSettings } from "../../settings/api.ts";
import { enumPref } from "../../settings/prefs.ts";
import { copyText } from "../openIn/apps.ts";
import { prLinkMenu, type PrOpenTarget } from "./prLinkMenu.ts";

type Notify = (kind: "info" | "error", message: string) => void;

function useOpenTarget(active: boolean): PrOpenTarget {
  const [target, setTarget] = useState<PrOpenTarget>("github");
  useEffect(() => {
    if (!active) return;
    let live = true;
    getSettings().then(
      (s) => live && setTarget(enumPref(s, "pull_request_open_target")),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [active]);
  return target;
}

function PrLinkMenu({ url, number, at, onClose, notify }: { url: string; number: number; at: Point; onClose: () => void; notify?: Notify }) {
  const target = useOpenTarget(true);
  const { overrides } = useKeybindingOverrides();
  const key = effectiveShortcuts("git.openInGitHub", overrides)[0];
  const copy = (text: string, toast: string) =>
    copyText(text).then(
      () => notify?.("info", toast),
      () => notify?.("error", "Failed to copy to clipboard"),
    );
  return (
    <ContextMenu at={at} label={`PR #${number}`} onClose={onClose} minWidth={180}>
      {prLinkMenu(url, number, target).map((item) => {
        switch (item.kind) {
          case "open":
            return (
              <MenuItem key={item.label} icon={<ArrowUpRightMenuIcon />} shortcut={item.primary && key ? glyphs(key) : undefined} onSelect={() => void openUrl(item.url)}>
                {item.label}
              </MenuItem>
            );
          case "copy-link":
            return (
              <MenuItem key="link" icon={<CopyMenuIcon />} onSelect={() => void copy(item.text, item.toast)}>
                Copy link
              </MenuItem>
            );
          case "copy-number":
            return (
              <MenuItem key="number" icon={<HashMenuIcon />} onSelect={() => void copy(item.text, item.toast)}>
                Copy number
              </MenuItem>
            );
        }
      })}
    </ContextMenu>
  );
}

/** Right-click handling for an element showing a PR number. */
export function usePrLinkMenu(pr: { url?: string | null; number: number } | null | undefined, notify?: Notify) {
  const [at, setAt] = useState<Point | null>(null);
  const close = useCallback(() => setAt(null), []);
  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      if (!pr?.url) return;
      e.preventDefault();
      setAt({ x: e.clientX, y: e.clientY });
    },
    [pr?.url],
  );
  const menu = at && pr?.url ? <PrLinkMenu url={pr.url} number={pr.number} at={at} onClose={close} notify={notify} /> : null;
  return { onContextMenu, menu };
}
