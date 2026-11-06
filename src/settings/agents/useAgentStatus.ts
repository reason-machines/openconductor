// The stored provider's status and the agent CLI's own login, refetched together by Refresh.
import { useCallback, useEffect, useState } from "react";
import { errorText, providerStatus } from "../api";
import type { ProviderStatus } from "../types";
import { cliLoginStatus, type CliLoginStatus } from "./api";

export function useAgentStatus(agent: "claude" | "codex", storedKey: string) {
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [login, setLogin] = useState<CliLoginStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([providerStatus(agent), cliLoginStatus(agent)])
      .then(([p, l]) => {
        setProvider(p);
        setLogin(l);
        setError(undefined);
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [agent]);
  useEffect(refresh, [refresh, storedKey]);
  return { provider, login, loading, error, refresh, setProvider };
}

/** The stored secret `key` of `status`, if any: present and its last-four hint. */
export function storedSecret(status: ProviderStatus | null, key: string): { present: boolean; hint: string | null } {
  const s = status?.secrets.find((x) => x.key === key);
  return { present: s?.present === true, hint: s?.hint ?? null };
}
