// `reason_cloud_setup` for Settings › Cloud setup and the settings nav's
// Cloud group. One read is shared by every caller and kept for a minute, so
// opening Settings does not run the four `reason call`s again each time.
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { inTauri } from "../../backend";
import { errorText } from "../api";
import type { CloudSetupDto } from "./cloudSetup";

const FRESH_MS = 60_000;
let cached: { at: number; value: CloudSetupDto } | null = null;
let inFlight: Promise<CloudSetupDto> | null = null;
const listeners = new Set<(v: CloudSetupDto) => void>();

/**
 * The setup a browser preview (no Tauri) shows: no CLI to ask. A capture or
 * preview sets `window.__OC_PREVIEW_CLOUD_SETUP__` to show another one
 * (tools/side-by-side/cloud-setup.mjs).
 */
const NO_DESKTOP: CloudSetupDto = {
  signedIn: false,
  identity: null,
  funding: null,
  agentsAvailable: null,
  repositories: null,
  error: { code: "unavailable", message: "Reason cloud setup runs in the desktop app." },
};

function load(force: boolean): Promise<CloudSetupDto> {
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.value);
  if (inFlight) return inFlight;
  const preview = (globalThis as { __OC_PREVIEW_CLOUD_SETUP__?: CloudSetupDto }).__OC_PREVIEW_CLOUD_SETUP__;
  const read = inTauri() ? invoke<CloudSetupDto>("reason_cloud_setup") : Promise.resolve(preview ?? NO_DESKTOP);
  inFlight = read
    .catch((e): CloudSetupDto => ({ ...NO_DESKTOP, error: { code: "unavailable", message: errorText(e) } }))
    .then((value) => {
      cached = { at: Date.now(), value };
      for (const l of listeners) l(value);
      return value;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** The cached read without waiting (null until the first one lands). */
export const cachedCloudSetup = (): CloudSetupDto | null => cached?.value ?? null;

export function useCloudSetup(): { setup: CloudSetupDto | null; loading: boolean; refresh: () => void } {
  const [setup, setSetup] = useState<CloudSetupDto | null>(cachedCloudSetup);
  const [loading, setLoading] = useState(false);
  const run = useCallback((force: boolean) => {
    setLoading(true);
    void load(force).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    listeners.add(setSetup);
    run(false);
    return () => {
      listeners.delete(setSetup);
    };
  }, [run]);
  return { setup, loading, refresh: useCallback(() => run(true), [run]) };
}
