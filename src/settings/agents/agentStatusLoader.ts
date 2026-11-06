// The Settings › Agents status loader behind useAgentStatus, free of React so its ordering rules are testable.
import type { ProviderStatus } from "../types";
import type { CliLoginStatus } from "./api";

export interface AgentStatusState {
  provider: ProviderStatus | null;
  login: CliLoginStatus | null;
  loading: boolean;
  /** The last refresh's failure, unformatted. */
  error: unknown;
}

export interface AgentStatusLoader {
  /** Refetch the provider status and the CLI login together. */
  refresh(): void;
  /** Apply a provider status the caller just got back from a save (connect or disconnect). */
  setProvider(provider: ProviderStatus): void;
}

export function createAgentStatusLoader(
  fetchStatus: () => Promise<[ProviderStatus, CliLoginStatus]>,
  onChange: (patch: Partial<AgentStatusState>) => void,
): AgentStatusLoader {
  // Only the newest refresh answers. A save bumps `saves`, so a refresh that started before it keeps its CLI login
  // but not its provider status, which predates the save (issue 646: the saved key flashed, then "No ... key configured").
  let refreshes = 0;
  let saves = 0;
  return {
    refresh() {
      const refresh = ++refreshes;
      const savesAtStart = saves;
      onChange({ loading: true });
      fetchStatus().then(
        ([provider, login]) => {
          if (refresh !== refreshes) return;
          onChange(saves === savesAtStart ? { provider, login, error: undefined, loading: false } : { login, error: undefined, loading: false });
        },
        (error: unknown) => {
          if (refresh === refreshes) onChange({ error, loading: false });
        },
      );
    },
    setProvider(provider) {
      saves++;
      onChange({ provider });
    },
  };
}
