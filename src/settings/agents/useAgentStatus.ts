// The stored provider's status and the agent CLI's own login, refetched together by Refresh. The ordering rules
// (newest refresh wins, a save beats a refresh that started before it) live in agentStatusLoader.ts.
import { useEffect, useMemo, useState } from "react";
import { errorText, providerStatus } from "../api";
import type { ProviderStatus } from "../types";
import { cliLoginStatus } from "./api";
import { createAgentStatusLoader, type AgentStatusState } from "./agentStatusLoader";

export function useAgentStatus(agent: "claude" | "codex", storedKey: string) {
  const [state, setState] = useState<AgentStatusState>({ provider: null, login: null, loading: true, error: undefined });
  const loader = useMemo(
    () =>
      createAgentStatusLoader(
        () => Promise.all([providerStatus(agent), cliLoginStatus(agent)]),
        (patch) => setState((s) => ({ ...s, ...patch })),
      ),
    [agent],
  );
  useEffect(() => loader.refresh(), [loader, storedKey]);
  const { provider, login, loading, error } = state;
  return { provider, login, loading, error: error === undefined ? undefined : errorText(error), refresh: loader.refresh, setProvider: loader.setProvider };
}

/** The stored secret `key` of `status`, if any: present and its last-four hint. */
export function storedSecret(status: ProviderStatus | null, key: string): { present: boolean; hint: string | null } {
  const s = status?.secrets.find((x) => x.key === key);
  return { present: s?.present === true, hint: s?.hint ?? null };
}
