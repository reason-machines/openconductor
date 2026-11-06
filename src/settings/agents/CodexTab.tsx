// Settings › Agents › Codex: Authentication (ChatGPT = Codex's own sign-in
// started in the app, CLI = `codex login`, API key = OPENAI_API_KEY in the
// Keychain), the status line and table, the card's action, then "Codex
// personality for new chats", the executable path override and the
// ~/.codex/config.toml card. Laid out as Conductor 0.87.6's `Fpa` and Sven's
// native screenshots (evidence/settings/agents-screens/conductor/
// settings--agents-codex*); the ChatGPT card is Sven's addition. Rules:
// codexTab.ts.
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { inTauri, openUrl } from "../../backend";
import { connectProvider, disconnectProvider, errorText, revealProviderSecret } from "../api";
import { CODEX_PERSONALITIES, withAgentModel } from "../agentSettings";
import { codexPersonality } from "../agentOptions";
import { Row } from "../GeneralPage";
import type { CodexPersonality } from "../types";
import { codexAuthState, providerOf } from "./agentAuth";
import { useAgentConfigPaths, type AgentTabProps } from "./ClaudeTab";
import { CODEX_MODES, MANAGE_USAGE_URL, OPENAI_KEY, chatgptStatus, codexModeOf, loginResult, switchSteps, type CodexAccount, type CodexLoginEvent, type CodexMode } from "./codexTab";
import { CheckIcon, ExternalIcon, KeyIcon, TerminalIcon } from "./icons";
import { AuthCards, ConfigFileCard, ExecutablePathRow, LoginButton, SecretRow, StatusLine, type AuthOption } from "./kit";
import { storedSecret, useAgentStatus } from "./useAgentStatus";
import "./codexTab.css";

const ICONS = { chatgpt: <ChatGptIcon />, cli: <TerminalIcon size={24} />, apikey: <KeyIcon size={24} /> };
const CODEX_AUTH: readonly AuthOption<CodexMode>[] = CODEX_MODES.map((m) => ({ ...m, icon: ICONS[m.id] }));
const open = (url: string) => void openUrl(url).catch(() => undefined);

export function CodexTab({ settings, save, reload }: AgentTabProps) {
  const storedMode = codexModeOf(settings);
  const { provider, login, loading, error, refresh, setProvider } = useAgentStatus("codex", JSON.stringify([providerOf(settings, "codex"), settings.codex_provider]));
  const [pending, setPending] = useState<CodexMode | null>(null);
  const [actionError, setActionError] = useState<string>();
  const mode = pending ?? storedMode;
  useEffect(() => {
    if (pending === storedMode) setPending(null);
  }, [pending, storedMode]);
  const config = useAgentConfigPaths("codex");

  // The ChatGPT card reads Codex's own account (`account/read`).
  const [account, setAccount] = useState<CodexAccount | null>(null);
  const [reading, setReading] = useState(false);
  const readAccount = useCallback(() => {
    if (!inTauri()) return;
    setReading(true);
    invoke<CodexAccount>("codex_account")
      .then(setAccount, (e) => setActionError(errorText(e)))
      .finally(() => setReading(false));
  }, []);
  useEffect(() => {
    if (mode === "chatgpt") readAccount();
  }, [mode, readAccount]);

  const key = storedSecret(mode === storedMode ? provider : null, OPENAI_KEY);
  const auth = mode === "chatgpt" ? chatgptStatus(account) : codexAuthState(mode, login, key.present);

  const switchMode = async (to: CodexMode) => {
    setPending(to);
    setActionError(undefined);
    try {
      for (const step of switchSteps(settings, to)) {
        if (step.op === "disconnect") setProvider(await disconnectProvider("codex"));
        else if (step.op === "connect") setProvider(await connectProvider("codex", step.config, []));
        else if ((await save(step.settings)) === false) throw new Error("Could not save settings.toml");
      }
      reload();
    } catch (e) {
      setPending(null);
      setActionError(errorText(e));
    }
  };
  const connectKey = async (secrets: { key: string; value: string }[]) => {
    const stored = providerOf(settings, "codex");
    setProvider(await connectProvider("codex", stored?.kind === "openai_api" ? stored : { kind: "openai_api" }, secrets));
    reload();
  };

  return (
    <div className="ag-stack-6">
      <AuthCards options={CODEX_AUTH} value={mode} onChange={(m) => void switchMode(m)} />
      <StatusLine
        connected={auth.authenticated}
        rows={auth.rows}
        checking={mode === "chatgpt" ? reading && !account : loading && !provider}
        refreshing={loading || reading}
        onRefresh={() => (mode === "chatgpt" ? readAccount() : refresh())}
        notConnectedMessage={auth.notConnectedMessage}
        detail={actionError ?? error}
      />
      {mode === "chatgpt" && <ChatGptSignIn account={auth.authenticated ? account : null} onAccount={setAccount} onError={setActionError} />}
      {mode === "cli" && !auth.authenticated && <LoginButton command="codex login" label="codex login" onDone={refresh} />}
      {mode === "apikey" && (
        <SecretRow
          label="OpenAI API key"
          configured={key.present}
          hint={key.hint}
          getKeyUrl="https://platform.openai.com/api-keys"
          reveal={() => revealProviderSecret("codex", OPENAI_KEY)}
          onSave={(value) => connectKey([{ key: OPENAI_KEY, value }])}
          onDelete={async () => {
            // Disconnect deletes the key and returns to the CLI login; keep the API key card selected.
            await disconnectProvider("codex");
            await connectKey([]);
          }}
        />
      )}
      <div className="settings-rows agk-rows">
        <Row label="Codex personality for new chats" help="Style to use when a new chat starts with a Codex model">
          <select
            aria-label="Codex personality for new chats"
            className="oc-agent-select-180"
            value={codexPersonality(settings)}
            onChange={(e) => void save(withAgentModel(settings, "codex", "personality", e.target.value as CodexPersonality))}
          >
            {CODEX_PERSONALITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Row>
        <ExecutablePathRow agent="codex" settings={settings} save={(s) => void save(s)} />
      </div>
      <ConfigFileCard title="Codex config" displayPath="~/.codex/config.toml" path={config?.filePath ?? null} fallbackPath={config?.directoryPath} />
    </div>
  );
}

/** The ChatGPT card's action: "Sign in with ChatGPT", the browser wait with Cancel, or the connected line. */
function ChatGptSignIn({ account, onAccount, onError }: { account: CodexAccount | null; onAccount: (a: CodexAccount) => void; onError: (e?: string) => void }) {
  const [loginId, setLoginId] = useState<string | null>(null);
  useEffect(() => {
    if (!loginId) return;
    let unlisten: (() => void) | undefined;
    let live = true;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<CodexLoginEvent>("codex-login-event", ({ payload }) => {
        if (payload.loginId !== loginId) return;
        setLoginId(null);
        const r = loginResult(payload);
        if ("account" in r) onAccount(r.account);
        else onError(r.error ?? undefined);
      }).then((u) => (live ? (unlisten = u) : u())),
    );
    return () => {
      live = false;
      unlisten?.();
    };
  }, [loginId, onAccount, onError]);

  const start = () => {
    onError(undefined);
    invoke<{ loginId: string; authUrl: string }>("codex_chatgpt_login_start").then(
      (r) => {
        setLoginId(r.loginId);
        open(r.authUrl);
      },
      (e) => onError(errorText(e)),
    );
  };

  if (loginId)
    return (
      <div className="ag-between" data-testid="codex-chatgpt-waiting">
        <p className="ag-row-2 ag-muted ag-text-sm">
          <span className="ag-spinner" />
          Finish signing in to ChatGPT in your browser.
        </p>
        <button type="button" className="ag-btn ag-outline ag-sm" onClick={() => void invoke("codex_chatgpt_login_cancel").finally(() => setLoginId(null))}>
          Cancel
        </button>
      </div>
    );
  if (!account)
    return (
      <button type="button" className="ag-btn ag-primary ag-sm" disabled={!inTauri()} onClick={start}>
        Sign in with ChatGPT
      </button>
    );
  return (
    <div className="ag-between" data-testid="codex-chatgpt-connected">
      <p className="agc-ok">
        <CheckIcon size={14} />
        Connected with ChatGPT as {account.email ?? "your account"}
      </p>
      <div className="ag-row-2">
        <button type="button" className="ag-link" onClick={() => open(MANAGE_USAGE_URL)}>
          Manage usage
          <ExternalIcon size={12} />
        </button>
        <button type="button" className="ag-btn ag-outline ag-sm" onClick={start}>
          Reconnect
        </button>
      </div>
    </div>
  );
}

/** ChatGPT: a speech bubble in the 24 px stroke grid (not OpenAI's mark). */
function ChatGptIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z" />
    </svg>
  );
}
