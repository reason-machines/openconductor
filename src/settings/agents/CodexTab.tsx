// Settings › Agents › Codex. Placeholder from the page-shell PR: the Codex
// tab as it was before the redesign (CLI / API key, status, key or login,
// Codex options). The Codex slice owns this file and rebuilds it on kit.tsx.
import { useEffect, useState } from "react";
import { connectProvider, disconnectProvider, errorText } from "../api";
import type { ProviderConfig } from "../types";
import { AUTH_MODES, apiKeyName, authModeOf, codexAuthState, configForMode, providerOf, type AuthMode } from "./agentAuth";
import { ApiKeyField, AuthModePicker, AuthStatus, LoginButton } from "./parts";
import { CodexAgentOptions } from "../rows/AgentOptionRows";
import type { AgentTabProps } from "./ClaudeTab";
import { storedSecret, useAgentStatus } from "./useAgentStatus";

export function CodexTab({ settings, save, reload }: AgentTabProps) {
  const stored = providerOf(settings, "codex");
  const { provider, login, loading, error, refresh, setProvider } = useAgentStatus("codex", JSON.stringify(stored));
  const [pending, setPending] = useState<AuthMode | null>(null);
  const [actionError, setActionError] = useState<string>();
  const storedMode = authModeOf("codex", stored);
  const mode = pending ?? storedMode;
  useEffect(() => {
    if (pending === storedMode) setPending(null);
  }, [pending, storedMode]);
  const keyName = apiKeyName("codex", mode === "apikey" ? configForMode("codex", "apikey", stored) : null);
  const keyStored = storedSecret(mode === storedMode ? provider : null, keyName).present;
  const auth = codexAuthState(mode, login, keyStored);
  const connect = async (config: ProviderConfig, secrets: { key: string; value: string }[] = []) => {
    setProvider(await connectProvider("codex", config, secrets));
    reload();
  };
  return (
    <div className="ag-stack-6">
      <AuthModePicker
        value={mode}
        modes={AUTH_MODES}
        onChange={(next) => {
          setPending(next);
          setActionError(undefined);
          connect(configForMode("codex", next, stored)).catch((e) => {
            setPending(null);
            setActionError(errorText(e));
          });
        }}
      />
      <AuthStatus
        authenticated={auth.authenticated}
        rows={auth.rows}
        loading={loading && !provider}
        refreshing={loading}
        onRefresh={refresh}
        notConnectedMessage={auth.notConnectedMessage}
        detail={actionError ?? error}
      />
      <div className="ag-min-h-10">
        {mode === "apikey" ? (
          <ApiKeyField
            label="OpenAI API key"
            configured={keyStored}
            getKeyUrl="https://platform.openai.com/api-keys"
            onSave={async (value) => {
              await connect(configForMode("codex", "apikey", stored), [{ key: keyName, value }]);
              return true;
            }}
            onRemove={async () => {
              await disconnectProvider("codex");
              await connect(configForMode("codex", "apikey", stored));
            }}
          />
        ) : (
          <LoginButton command="codex login" label="codex login" onDone={refresh} />
        )}
      </div>
      <div className="settings-rows">
        <CodexAgentOptions settings={settings} save={(s) => void save(s)} />
      </div>
    </div>
  );
}
