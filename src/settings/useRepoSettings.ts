// Effective repository settings of a workspace for components that act on
// them (Review button, ...). Reloads when the paths change and whenever the
// settings rows save (`notifyRepoSettingsChanged`). Null until loaded, and in
// the browser preview, which has no backend.
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { repoSettingsEffective, type EffectiveSettings } from "./repoSettings.ts";

const CHANGED = "openconductor:repo-settings-changed";

/** Tell open views that a repository's settings changed. */
export function notifyRepoSettingsChanged(): void {
  window.dispatchEvent(new Event(CHANGED));
}

export function useRepoSettings(repoPath: string | undefined, workspacePath?: string): EffectiveSettings | null {
  const [settings, setSettings] = useState<EffectiveSettings | null>(null);
  useEffect(() => {
    if (!repoPath || !isTauri()) return;
    let live = true;
    const load = () =>
      repoSettingsEffective(repoPath, workspacePath)
        .then((s) => live && setSettings(s))
        .catch((e) => console.warn("repo settings not loaded", e));
    void load();
    window.addEventListener(CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(CHANGED, load);
    };
  }, [repoPath, workspacePath]);
  return settings;
}
