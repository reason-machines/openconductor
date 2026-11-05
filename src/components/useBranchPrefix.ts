// The branch prefix the sidebar label strips (Conductor's `DQt`): the custom
// prefix, `<github user>/`, or none, re-read when settings change.
import { useEffect, useState } from "react";
import { SETTINGS_CHANGED } from "../settings/appearance";
import { loadBranchPrefix } from "../workspace/api";
import { prefixSettingsFromInfo, resolveBranchPrefix } from "../workspace/naming";

export function useBranchPrefix(): string | undefined {
  const [prefix, setPrefix] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const load = () =>
      void loadBranchPrefix().then(
        (info) => {
          const { settings, githubUsername } = prefixSettingsFromInfo(info);
          if (live) setPrefix(resolveBranchPrefix(settings, githubUsername) || undefined);
        },
        () => live && setPrefix(undefined),
      );
    load();
    window.addEventListener(SETTINGS_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(SETTINGS_CHANGED, load);
    };
  }, []);
  return prefix;
}
