// The PR badge's right-click menu (Conductor's `RFt` badge > `w_i`, renderApp-D_fmY7hW.js
// @2,246,672, read with REA on sven m5 max as data): a ContextMenu (`kS` > `gy`
// "min-w-[180px]") with [arrow-up-right] Open in <setting's site>  ⌘⇧G, the other sites for a
// github.com PR, [copy] Copy link and [hash] Copy number. Items and URLs: prLinks.ts.
import { useEffect, useState } from "react";
import { ContextMenu, MenuItem } from "../../components/menu/ContextMenu";
import { ArrowUpRightIcon, CopyIcon, HashIcon } from "../../components/menu/menuIcons";
import { COMMANDS } from "../../keybindings/registry";
import { glyphs } from "../../keybindings/shortcut";
import { getSettings } from "../../settings/api";
import { enumPref } from "../../settings/prefs";
import { openUrl } from "../../backend";
import { copyText } from "../openIn/apps";
import { copiedPrToast, prOpenItems, type PrOpenTarget } from "./prLinks";

interface Props {
  url: string;
  number: number;
  at: { x: number; y: number };
  onClose: () => void;
  notify?: (kind: "info" | "error", message: string) => void;
}

const openShortcut = (() => {
  const c = COMMANDS.find((cmd) => cmd.id === "git.openInGitHub");
  return c ? glyphs(c.key) : undefined;
})();

/** Settings › Git › "Open pull requests in" (`pull_request_open_target`), GitHub until read. */
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

export function PrBadgeMenu({ url, number, at, onClose, notify }: Props) {
  const target = useOpenTarget();
  const copy = (text: string, what: "link" | "number") =>
    copyText(text).then(
      () => notify?.("info", copiedPrToast(what)),
      () => notify?.("error", "Failed to copy to clipboard"),
    );
  return (
    <ContextMenu at={at} onClose={onClose} label={`PR #${number} actions`} className="cm-min-w-180">
      {prOpenItems(url, target).map((item) => (
        <MenuItem key={item.label} icon={<ArrowUpRightIcon />} shortcut={item.primary ? openShortcut : undefined} onSelect={() => void openUrl(item.url)}>
          {item.label}
        </MenuItem>
      ))}
      <MenuItem icon={<CopyIcon />} onSelect={() => void copy(url, "link")}>
        Copy link
      </MenuItem>
      <MenuItem icon={<HashIcon />} onSelect={() => void copy(String(number), "number")}>
        Copy number
      </MenuItem>
    </ContextMenu>
  );
}
