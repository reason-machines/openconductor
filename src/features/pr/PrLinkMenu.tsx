// Right-click menu on a PR number (Conductor's `w_i` inside `gy` min-w-[180px],
// items in prLinkMenuItems.ts): the header PR pill (`RFt`) and the "#N" in the
// PR tab's title (`sKo`). Copies toast like Conductor's `n5`: "Copied PR link
// to clipboard" / "Copied PR number to clipboard", "Failed to copy to clipboard".
// `usePrLinkMenu` gives the trigger's onContextMenu and the menu to render beside it.
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { ContextMenu, MenuItem } from "../../components/menu/ContextMenu";
import { ArrowUpRightIcon, CopyIcon, HashIcon } from "../../components/menu/menuIcons";
import { openUrl } from "../../backend.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import { useKeybindingOverrides } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { getSettings } from "../../settings/api.ts";
import { enumPref } from "../../settings/prefs.ts";
import { copyText } from "../openIn/apps.ts";
import { prLinkMenu, type PrOpenTarget } from "./prLinkMenuItems.ts";

type Notify = (kind: "info" | "error", message: string) => void;
type Point = { x: number; y: number };

/** Settings › Git › "Open pull requests in" (`pull_request_open_target`), read when the menu opens. */
function useOpenTarget(): PrOpenTarget {
  const [target, setTarget] = useState<PrOpenTarget>("github");
  useEffect(() => {
    let live = true;
    getSettings().then(
      (s) => live && setTarget(enumPref(s, "pull_request_open_target")),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return target;
}

function PrLinkMenu({ url, number, at, onClose, notify }: { url: string; number: number; at: Point; onClose: () => void; notify?: Notify }) {
  const target = useOpenTarget();
  const { overrides } = useKeybindingOverrides();
  const key = effectiveShortcuts("git.openInGitHub", overrides)[0];
  const copy = (text: string, toast: string) =>
    copyText(text).then(
      () => notify?.("info", toast),
      () => notify?.("error", "Failed to copy to clipboard"),
    );
  return (
    <ContextMenu at={at} label={`PR #${number}`} onClose={onClose} className="cm-min-w-180">
      {prLinkMenu(url, number, target).map((item) => {
        switch (item.kind) {
          case "open":
            return (
              <MenuItem key={item.label} icon={<ArrowUpRightIcon />} shortcut={item.primary && key ? glyphs(key) : undefined} onSelect={() => void openUrl(item.url)}>
                {item.label}
              </MenuItem>
            );
          case "copy-link":
            return (
              <MenuItem key="link" icon={<CopyIcon />} onSelect={() => void copy(item.text, item.toast)}>
                Copy link
              </MenuItem>
            );
          case "copy-number":
            return (
              <MenuItem key="number" icon={<HashIcon />} onSelect={() => void copy(item.text, item.toast)}>
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
