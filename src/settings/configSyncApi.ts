import { invoke, isTauri } from "@tauri-apps/api/core";
import { parseConfigSyncDiff, parseConfigSyncResult, type ConfigSyncSelection } from "./configSync";

function requireDesktop() {
  if (!isTauri()) throw new Error("Local config sync needs the OpenConductor desktop app.");
}

export const configSyncApi = {
  async diff() {
    requireDesktop();
    return parseConfigSyncDiff(await invoke<unknown>("config_sync_diff"));
  },
  async sync(selections: ConfigSyncSelection[]) {
    requireDesktop();
    return parseConfigSyncResult(await invoke<unknown>("config_sync_apply", { selections }));
  },
};
