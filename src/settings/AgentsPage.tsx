import { useCallback, useEffect, useState } from "react";
import { connectProvider, disconnectProvider, errorText, providerStatus } from "./api";
import { KIND_LABEL } from "./providers";
import { visibleModels } from "./agentSettings";
import type { ProviderConfig, ProviderStatus, Settings } from "./types";
import {
  AGENT_TABS,
  AUTH_MODES,
  apiKeyName,
  authModeOf,
  claudeAuthState,
  codexAuthState,
  configForMode,
  otherProvider,
  providerOf,
  providerTabFrom,
  normalizeSetupToken,
  SETUP_TOKEN_KEY,
  type AuthMode,
} from "./agents/agentAuth";
import { authSources, cliLoginStatus, importAuthSource, openExternal, type AuthSource, type CliAgent, type CliLoginStatus } from "./agents/api";
import { AgentMark, ExternalIcon, OpenCodeMark, type AgentTabId } from "./agents/icons";
import { ApiKeyField, AuthModePicker, AuthStatus, LoginButton, RefreshButton, SignInSources } from "./agents/parts";
import "./agents/agents.css";
import { AcpAgentOptions, ClaudeAgentOptions, CodexAgentOptions } from "./rows/AgentOptionRows";

interface Props {
  settings: Settings;
  /** Saves settings.toml (for the per-agent option rows). */
  save: (next: Settings) => Promise<boolean> | void;
  /** Re-reads settings after connect/disconnect, which write the file themselves. */
  reload: () => void;
}

/**
 * Settings › Agents (Conductor's `/settings/user/providers`, `Upa`/`$pa`):
 * Claude Code, Codex, Cursor and OpenCode tabs. Each CLI tab has the
 * Authentication cards (CLI / API key), the status line with Refresh, and
 * either "Run <cli> login" or the API key field; the per-agent options
 * below them come from src/settings/rows/AgentOptionRows.tsx. The open tab
 * follows `?providerTab=`. Keys go through `connect_provider` and are never
 * read back (evidence/settings/NOTES.md, "Agents").
 */
export function AgentsPage({ settings, save, reload }: Props) {
  const [tab, setTab] = useState<AgentTabId>(() => providerTabFrom(new URLSearchParams(window.location.search).get("providerTab")));
  const select = (next: AgentTabId) => {
    setTab(next);
    const q = new URLSearchParams(window.location.search);
    q.set("providerTab", next);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${q}`);
  };
  return (
    <div className="oc-ag ag-page">
      <div role="tablist" aria-label="Agents" className="ag-tabs">
        {AGENT_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            className={`ag-tab${tab === t.id ? " on" : ""}`}
            onClick={() => select(t.id)}
          >
            <AgentMark agent={t.id} size={14} />
            {t.label}
          </button>
        ))}
      </div>
      <section role="tabpanel" aria-label={AGENT_TABS.find((t) => t.id === tab)?.label}>
        {tab === "claude" && <CliAgentTab agent="claude" settings={settings} save={save} reload={reload} />}
        {tab === "codex" && <CliAgentTab agent="codex" settings={settings} save={save} reload={reload} />}
        {tab === "cursor" && <CursorTab settings={settings} reload={reload} />}
        {tab === "opencode" && <OpenCodeTab settings={settings} save={save} />}
      </section>
    </div>
  );
}

/** The stored provider's status and the CLI's login, refetched together by Refresh. */
function useAgentStatus(agent: "claude" | "codex" | "cursor", cli: CliAgent | null, storedKey: string) {
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [login, setLogin] = useState<CliLoginStatus | null>(null);
  const [sources, setSources] = useState<AuthSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const refresh = useCallback(() => {
    setLoading(true);
    const withSources = agent === "claude" || agent === "codex";
    Promise.all([
      providerStatus(agent),
      cli ? cliLoginStatus(cli) : Promise.resolve(null),
      withSources ? authSources(agent).catch(() => [] as AuthSource[]) : Promise.resolve([] as AuthSource[]),
    ])
      .then(([p, l, s]) => {
        setProvider(p);
        setLogin(l);
        setSources(s);
        setError(undefined);
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [agent, cli]);
  useEffect(refresh, [refresh, storedKey]);
  return { provider, login, sources, loading, error, refresh, setProvider };
}

const keyPresent = (status: ProviderStatus | null, key: string) => status?.secrets.some((s) => s.key === key && s.present) === true;

const CLI_COPY = {
  claude: { keyLabel: "Anthropic API key", getKeyUrl: "https://console.anthropic.com/settings/keys", command: "claude /login", label: "claude /login" },
  codex: { keyLabel: "OpenAI API key", getKeyUrl: "https://platform.openai.com/api-keys", command: "codex login", label: "codex login" },
} as const;

/** Claude Code (`jpa`) and Codex (`Fpa`): cards, status, login or key. */
function CliAgentTab({ agent, settings, save, reload }: { agent: "claude" | "codex" } & Props) {
  const stored = providerOf(settings, agent);
  const { provider, login, sources, loading, error, refresh, setProvider } = useAgentStatus(agent, agent, JSON.stringify(stored));
  const [pending, setPending] = useState<AuthMode | null>(null);
  const [actionError, setActionError] = useState<string>();
  const storedMode = authModeOf(agent, stored);
  const mode = pending ?? storedMode;
  useEffect(() => {
    if (pending === storedMode) setPending(null);
  }, [pending, storedMode]);

  const keyName = apiKeyName(agent, mode === "apikey" ? configForMode(agent, "apikey", stored) : null);
  const keyStored = mode === storedMode && keyPresent(provider, keyName);
  const setupToken = agent === "claude" && mode === "cli" && storedMode === "cli" && keyPresent(provider, SETUP_TOKEN_KEY);
  const auth = agent === "claude" ? claudeAuthState(mode, login, keyStored, setupToken) : codexAuthState(mode, login, keyStored);
  const other = otherProvider(agent, stored);
  const copy = CLI_COPY[agent];

  const connect = async (config: ProviderConfig, secrets: { key: string; value: string }[] = []) => {
    const status = await connectProvider(agent, config, secrets);
    setProvider(status);
    reload();
    return status;
  };
  const switchMode = (next: AuthMode) => {
    setPending(next);
    setActionError(undefined);
    connect(configForMode(agent, next, stored)).catch((e) => {
      setPending(null);
      setActionError(errorText(e));
    });
  };

  return (
    <div className="ag-stack-6">
      <AuthModePicker
        value={mode}
        modes={AUTH_MODES}
        onChange={switchMode}
        onReset={
          stored
            ? () => {
                setActionError(undefined);
                disconnectProvider(agent)
                  .then((s) => {
                    setProvider(s);
                    reload();
                  })
                  .catch((e) => setActionError(errorText(e)));
              }
            : undefined
        }
      />
      {other && (
        <p className="ag-detail">
          Using {KIND_LABEL[other]} from settings.toml. Choose a card to switch.
        </p>
      )}
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
            label={copy.keyLabel}
            configured={keyStored}
            getKeyUrl={copy.getKeyUrl}
            onSave={async (value) => {
              await connect(configForMode(agent, "apikey", stored), [{ key: keyName, value }]);
              return true;
            }}
            onRemove={async () => {
              // disconnect deletes the key and returns to the CLI login; Conductor keeps the API key card selected.
              await disconnectProvider(agent);
              await connect(configForMode(agent, "apikey", stored));
            }}
          />
        ) : (
          <div className="ag-stack-3">
            <LoginButton command={copy.command} label={copy.label} onDone={refresh} />
            {agent === "claude" && (
              <SetupTokenField
                configured={setupToken}
                onSave={async (value) => {
                  await connect({ kind: "claude_login" }, [{ key: SETUP_TOKEN_KEY, value: normalizeSetupToken(value) }]);
                  return true;
                }}
                onRemove={async () => {
                  // Deletes the token; the CLI's own login is used again.
                  await disconnectProvider(agent);
                  reload();
                  refresh();
                }}
              />
            )}
          </div>
        )}
      </div>
      <SignInSources
        sources={sources}
        onImport={async (source) => {
          await importAuthSource(agent, source.id);
          reload();
          refresh();
        }}
      />
      {/* Per-agent options; `.settings-rows` gives their switches and selects Conductor's styling. */}
      <div className="settings-rows">
        {agent === "claude" ? <ClaudeAgentOptions settings={settings} save={save} /> : <CodexAgentOptions settings={settings} save={save} />}
      </div>
    </div>
  );
}

/**
 * Conductor's "Paste a setup token instead" under the Claude subscription
 * sign-in: run `claude setup-token` in a terminal and paste the token. It is
 * stored in the Keychain and passed to chats as CLAUDE_CODE_OAUTH_TOKEN.
 */
function SetupTokenField({ configured, onSave, onRemove }: { configured: boolean; onSave: (v: string) => Promise<boolean>; onRemove: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  if (!configured && !open) {
    return (
      <button type="button" className="ag-btn ag-ghost ag-sm ag-self-start" onClick={() => setOpen(true)}>
        Paste a setup token instead
      </button>
    );
  }
  return (
    <div className="ag-stack-2">
      <p className="ag-label">Claude Code subscription</p>
      <p className="ag-muted ag-text-sm">
        Run <code className="ag-mono">claude setup-token</code> in a terminal and paste the token you get back here.
      </p>
      <ApiKeyField label="CLAUDE_CODE_OAUTH_TOKEN" configured={configured} onSave={onSave} onRemove={onRemove} />
    </div>
  );
}

/** Cursor (`Spa`): "API key" heading, its state, "Get key", and the key field. */
function CursorTab({ settings, reload }: { settings: Settings; reload: () => void }) {
  const stored = providerOf(settings, "cursor");
  const { provider, setProvider } = useAgentStatus("cursor", null, JSON.stringify(stored));
  const configured = keyPresent(provider, "cursor_api_key");
  return (
    <div className="ag-stack-4">
      <div className="ag-between ag-gap-3">
        <div className="ag-stack-1">
          <p className="ag-label">API key</p>
          <p className="ag-muted ag-text-sm">{configured ? "Cursor API key configured" : "No Cursor API key configured"}</p>
        </div>
        <button
          type="button"
          className="ag-btn ag-outline ag-sm"
          onClick={() => void openExternal("https://cursor.com/dashboard/api?section=user-keys#user-api-keys")}
        >
          Get key
          <ExternalIcon size={12} />
        </button>
      </div>
      <ApiKeyField
        label="Cursor API key"
        configured={configured}
        onSave={async (value) => {
          setProvider(await connectProvider("cursor", { kind: "cursor_api" }, [{ key: "cursor_api_key", value }]));
          reload();
          return true;
        }}
        onRemove={async () => {
          setProvider(await disconnectProvider("cursor"));
          reload();
        }}
      />
    </div>
  );
}

const OPENCODE_DOCS = "https://opencode.ai/v2/docs/";

/**
 * OpenCode (`ypa`): "Install OpenCode" until it is installed, then its
 * header (icon, name, tagline, Docs), Providers and Models. Its Advanced
 * section is <AcpAgentOptions agent="opencode"/> (AgentOptionRows.tsx).
 */
function OpenCodeTab({ settings, save }: Pick<Props, "settings" | "save">) {
  const [status, setStatus] = useState<CliLoginStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const refresh = useCallback(() => {
    setChecking(true);
    cliLoginStatus("opencode")
      .then(setStatus, () => setStatus({ installed: false, authenticated: false }))
      .finally(() => setChecking(false));
  }, []);
  useEffect(refresh, [refresh]);
  const selected = visibleModels(settings).opencode.length;

  if (!status?.installed) {
    return (
      <div className="ag-card-plain">
        {checking && !status ? (
          <div className="ag-install ag-muted ag-text-sm">
            <span className="ag-spinner" />
            Checking…
          </div>
        ) : (
          <div className="ag-install-empty">
            <OpenCodeMark size={64} />
            <p className="ag-text-lg">OpenCode</p>
            <div className="ag-row-2">
              {/* Conductor downloads OpenCode into its own prefix; OpenConductor points to the install docs. */}
              <button type="button" className="ag-btn ag-primary ag-sm" onClick={() => void openExternal(OPENCODE_DOCS)}>
                Install OpenCode
              </button>
              <RefreshButton onRefresh={refresh} refreshing={checking} />
            </div>
          </div>
        )}
        {/* Advanced opens itself on an alert ("Missing"), so it also shows before OpenCode is installed. */}
        {status && <AcpAgentOptions agent="opencode" settings={settings} save={save} />}
      </div>
    );
  }
  return (
    <div className="ag-card-plain ag-stack-6">
      <div className="ag-between ag-start">
        <div className="ag-row-3">
          <OpenCodeMark size={32} />
          <div className="ag-stack-05">
            <p className="ag-text-sm ag-medium">OpenCode</p>
            <p className="ag-muted ag-text-xs">The open source AI coding agent</p>
          </div>
        </div>
        <button type="button" className="ag-link" onClick={() => void openExternal(OPENCODE_DOCS)}>
          Docs
          <ExternalIcon size={12} />
        </button>
      </div>
      <div className="ag-setting">
        <div className="ag-setting-title">
          Providers <span className="ag-muted ag-normal">0 configured</span>
        </div>
        <button type="button" className="ag-btn ag-primary" disabled title="OpenCode provider keys are not available in OpenConductor yet">
          Add your first provider
        </button>
      </div>
      <div className="ag-setting">
        <div className="ag-setting-title">
          Models <span className="ag-muted ag-normal">{selected} selected</span>
        </div>
        <button
          type="button"
          className={`ag-btn ${selected === 0 ? "ag-primary" : "ag-outline"}`}
          disabled
          title="Choosing OpenCode models is not available in OpenConductor yet"
        >
          {selected === 0 ? "Add your first OpenCode model" : "Configure"}
        </button>
      </div>
      <AcpAgentOptions agent="opencode" settings={settings} save={save} />
    </div>
  );
}
