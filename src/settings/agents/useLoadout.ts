import { useEffect, useState } from "react";
import { getSettings } from "../api";
import type { Settings } from "../types";
import { FAVORITES_CHANGED_EVENT, listFavorites } from "./api";
import { loadoutSlots, parseFavorites, type LoadoutSlot } from "./loadout";

export function useLoadout(): { settings: Settings; slots: LoadoutSlot[] } | null {
  const [loadout, setLoadout] = useState<{ settings: Settings; slots: LoadoutSlot[] } | null>(null);
  useEffect(() => {
    let live = true;
    let version = 0;
    const refresh = async () => {
      const request = ++version;
      try {
        const [settings, rows] = await Promise.all([getSettings(), listFavorites()]);
        if (live && request === version) setLoadout({ settings, slots: loadoutSlots(settings, parseFavorites(rows)) });
      } catch (e) {
        console.warn("composer: loadout unavailable", e);
      }
    };
    void refresh();
    window.addEventListener(FAVORITES_CHANGED_EVENT, refresh);
    return () => {
      live = false;
      window.removeEventListener(FAVORITES_CHANGED_EVENT, refresh);
    };
  }, []);
  return loadout;
}
