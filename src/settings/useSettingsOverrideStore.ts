// One override store per settings page, writing through the page's own
// settings state and save so pages never overwrite each other with a stale
// copy, and publishing each stored write to the live keybindings.
import { useMemo, useRef } from "react";
import { useKeybindingOverrides } from "../keybindings/KeybindingsProvider";
import { createOverrideStore, parseOverrides } from "../keybindings/overrides.ts";
import { overridesRaw, settingsOverrideStorage } from "./keybindingOverrides.ts";
import type { Settings } from "./types";

export function useSettingsOverrideStore(settings: Settings, save: (next: Settings) => void | Promise<boolean>) {
  const { setOverrides } = useKeybindingOverrides();
  const latest = useRef(settings);
  latest.current = settings;
  const saveRef = useRef(save);
  saveRef.current = save;
  return useMemo(
    () =>
      createOverrideStore(
        settingsOverrideStorage(
          () => latest.current,
          async (next) => {
            const ok = (await saveRef.current(next)) !== false;
            if (ok) {
              latest.current = next;
              setOverrides(parseOverrides(overridesRaw(next)));
            }
            return ok;
          },
        ),
      ),
    [setOverrides],
  );
}
