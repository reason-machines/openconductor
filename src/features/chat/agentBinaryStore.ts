// The app's AgentBinaryStore (agentBinaries.ts) on Tauri: `agent_binary_progress`
// events and the agent_binaries commands (src-tauri/src/agent_binaries.rs).
// Outside the desktop app there are no bundled binaries, so it stays empty.
import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../../backend";
import { createAgentBinaryStore, statusKey, type AgentBinaryStatus, type BinaryAgent } from "./agentBinaries.ts";

export const agentBinaryStore = createAgentBinaryStore(
  {
    async listen(onStatus) {
      if (!inTauri()) return () => undefined;
      const { listen } = await import("@tauri-apps/api/event");
      return listen("agent_binary_progress", (e) => onStatus(e.payload));
    },
    getState: () => (inTauri() ? invoke<unknown[]>("get_agent_binary_state") : Promise.resolve([])),
    requestDownload: (agent) => (inTauri() ? invoke<void>("request_agent_binary_download", { agent }) : Promise.resolve()),
  },
  (msg, err) => console.error(`[AgentBinaryStore] ${msg}`, err),
);

/** The agent's current download status, live (undefined when there is none). */
export function useAgentBinaryStatus(agent: BinaryAgent | undefined): AgentBinaryStatus | undefined {
  return useSyncExternalStore(agentBinaryStore.subscribe, () => (agent ? agentBinaryStore.statuses()[statusKey(agent)] : undefined));
}
