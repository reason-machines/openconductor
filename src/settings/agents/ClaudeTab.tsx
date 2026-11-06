// Settings › Agents › Claude Code: Authentication (CLI = the user's Claude
// subscription through `claude /login`, API key = ANTHROPIC_API_KEY in the
// Keychain), the status line and table, the key or the login button, then
// "Use Claude Code with Chrome", the executable path override (empty uses
// the bundled Claude Code) and the ~/.claude/settings.json card. Laid out as
// Conductor 0.87.6's `jpa` and Sven's native screenshots.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../../backend";
import { connectProvider, disconnectProvider, errorText, revealProviderSecret } from "../api";
import type { ProviderConfig, Settings } from "../types";
import { apiKeyName, authModeOf, claudeAuthState, configForMode, providerOf, type AuthMode } from "./agentAuth";
import { KeyIcon, TerminalIcon } from "./icons";
import { AuthCards, ConfigFileCard, ExecutablePathRow, LoginButton, SecretRow, StatusLine, type AuthOption } from "./kit";
import { ChromeModeRow } from "../rows/AgentOptionRows";
import { storedSecret, useAgentStatus } from "./useAgentStatus";

export interface AgentTabProps {
  settings: Settings;
  save: (next: Settings) => Promise<boolean> | void;
  reload: () => void;
}

const CLAUDE_AUTH: readonly AuthOption<AuthMode>[] = [
  { id: "cli", label: "CLI", icon: <TerminalIcon size={24} /> },
  { id: "apikey", label: "API key", icon: <KeyIcon size={24} /> },
];

/** `~/.claude/settings.json` (or its folder before it exists) for "Open in". */
export function useAgentConfigPaths(agent: "claude" | "codex") {
  const [paths, setPaths] = useState<{ filePath: string; directoryPath: string } | null>(null);
  useEffect(() => {
    if (!inTauri()) return;
    invoke<{ filePath: string; directoryPath: string } | null>("agent_config_file", { agent }).then(setPaths, () => setPaths(null));
  }, [agent]);
  return paths;
}

export function ClaudeTab({ settings, save, reload }: AgentTabProps) {
  const stored = providerOf(settings, "claude");
  const { provider, login, loading, error, refresh, setProvider } = useAgentStatus("claude", JSON.stringify(stored));
  const [pending, setPending] = useState<AuthMode | null>(null);
  const [actionError, setActionError] = useState<string>();
  const storedMode = authModeOf("claude", stored);
  const mode = pending ?? storedMode;
  useEffect(() => {
    if (pending === storedMode) setPending(null);
  }, [pending, storedMode]);
  const config = useAgentConfigPaths("claude");

  const keyName = apiKeyName("claude", configForMode("claude", "apikey", stored));
  const key = storedSecret(mode === storedMode ? provider : null, keyName);
  const auth = claudeAuthState(mode, login, key.present);

  const connect = async (next: ProviderConfig, secrets: { key: string; value: string }[] = []) => {
    setProvider(await connectProvider("claude", next, secrets));
    reload();
  };
  const switchMode = (next: AuthMode) => {
    setPending(next);
    setActionError(undefined);
    connect(configForMode("claude", next, stored)).catch((e) => {
      setPending(null);
      setActionError(errorText(e));
    });
  };

  return (
    <div className="ag-stack-6">
      <AuthCards options={CLAUDE_AUTH} value={mode} onChange={switchMode} />
      <StatusLine
        connected={auth.authenticated}
        rows={auth.rows}
        checking={loading && !provider}
        refreshing={loading}
        onRefresh={refresh}
        notConnectedMessage={auth.notConnectedMessage}
        detail={actionError ?? error}
      />
      {mode === "apikey" ? (
        <SecretRow
          label="Anthropic API key"
          configured={key.present}
          hint={key.hint}
          getKeyUrl="https://console.anthropic.com/settings/keys"
          reveal={() => revealProviderSecret("claude", keyName)}
          onSave={(value) => connect(configForMode("claude", "apikey", stored), [{ key: keyName, value }])}
          onDelete={async () => {
            // Disconnect deletes the key and returns to the CLI login; keep the API key card selected.
            await disconnectProvider("claude");
            await connect(configForMode("claude", "apikey", null));
          }}
        />
      ) : (
        !auth.authenticated && <LoginButton command="claude /login" label="claude /login" onDone={refresh} />
      )}
      <div className="settings-rows agk-rows">
        <ChromeModeRow />
        <ExecutablePathRow agent="claude" settings={settings} save={(s) => void save(s)} />
      </div>
      <ConfigFileCard title="Claude settings" displayPath="~/.claude/settings.json" path={config?.filePath ?? null} fallbackPath={config?.directoryPath} />
    </div>
  );
}
