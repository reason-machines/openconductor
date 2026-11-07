// Settings › Agents › Reason, the first tab: Authentication ("Reason account"
// signs in from the app with `reason login`'s link and code, "CLI" is
// `reason login` in a terminal, "API key" is REASON_API_KEY from the
// Keychain), the status line and table (Version, Account, Workspace, This
// Mac with Connect), then the workspace, model and effort new Reason chats
// start with, the `reason` executable path and the ~/.config/reason card.
// Laid out like the Claude Code and Codex tabs (Conductor has no Reason tab);
// the CLI facts are in evidence/reason-acp/account.md. Rules: reasonModes.ts.
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { inTauri, openUrl } from "../../backend";
import { FolderIcon } from "../../components/Icons";
import { reasonModels } from "../../features/chat/reasonChat";
import type { ReasonModelOption } from "../../features/chat/reasonModels";
import { Row } from "../GeneralPage";
import { connectProvider, disconnectProvider, errorText, revealProviderSecret } from "../api";
import type { Settings } from "../types";
import type { AgentTabProps } from "./ClaudeTab";
import { CloseIcon, ExternalIcon, KeyIcon, ReasonMark, TerminalIcon } from "./icons";
import { AuthCards, ConfigFileCard, LoginButton, SecretRow, StatusLine, type AuthOption } from "./kit";
import {
  REASON_EFFORT_OPTIONS,
  REASON_KEY,
  REASON_KEYS_URL,
  REASON_MODES,
  activeWorkspace,
  reasonModeOf,
  reasonProviderFor,
  reasonStatus,
  signedIn,
  withReason,
  type LoginPrompt,
  type ReasonAccount,
  type ReasonMode,
} from "./reasonModes";
import { storedSecret } from "./useAgentStatus";
import { providerStatus } from "../api";
import type { ProviderStatus } from "../types";

const ICONS: Record<ReasonMode, JSX.Element> = { account: <ReasonMark size={24} />, cli: <TerminalIcon size={24} />, apikey: <KeyIcon size={24} /> };
const REASON_AUTH: readonly AuthOption<ReasonMode>[] = REASON_MODES.map((m) => ({ ...m, icon: ICONS[m.id] }));
/** How often the "Reason account" card asks `reason status` while the browser sign-in is open. */
const POLL_MS = 2000;
const open = (url: string) => void openUrl(url).catch(() => undefined);

interface ReasonPaths {
  systemCli: string | null;
  configDir: string | null;
}

/** `reason status --json` (with the stored key) and the provider status, refetched together. */
function useReasonStatus(storedKey: string) {
  const [account, setAccount] = useState<ReasonAccount | null>(null);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requests = useRef(0);
  const refresh = useCallback(() => {
    const request = ++requests.current;
    setLoading(true);
    const status = inTauri() ? invoke<ReasonAccount>("reason_account_status") : Promise.reject(new Error("Reason runs in the desktop app."));
    Promise.allSettled([status, providerStatus("reason")])
      .then(([a, p]) => {
        if (request !== requests.current) return;
        setAccount(a.status === "fulfilled" ? a.value : null);
        setError(a.status === "rejected" ? errorText(a.reason) : undefined);
        if (p.status === "fulfilled") setProvider(p.value);
      })
      .finally(() => {
        if (request === requests.current) setLoading(false);
      });
  }, []);
  useEffect(() => {
    refresh();
    return () => { requests.current++; };
  }, [refresh, storedKey]);
  return { account, setAccount, provider, setProvider, loading, error, refresh };
}

export function ReasonTab({ settings, save, reload }: AgentTabProps) {
  const latestSettings = useRef(settings);
  latestSettings.current = settings;
  const setDefault: SetReasonDefault = (key, value) => {
    const next = withReason(latestSettings.current, key, value);
    latestSettings.current = next;
    void save(next);
  };
  const storedMode = reasonModeOf(settings);
  const { account, setAccount, provider, setProvider, loading, error, refresh } = useReasonStatus(JSON.stringify([settings.providers.reason ?? null, settings.reason_executable_path ?? null]));
  const [pending, setPending] = useState<ReasonMode | null>(null);
  const [actionError, setActionError] = useState<string>();
  const mode = pending ?? storedMode;
  useEffect(() => {
    if (pending === storedMode) setPending(null);
  }, [pending, storedMode]);
  const [paths, setPaths] = useState<ReasonPaths | null>(null);
  useEffect(() => {
    if (inTauri()) invoke<ReasonPaths>("reason_paths").then(setPaths, () => setPaths(null));
  }, []);

  const key = storedSecret(mode === storedMode ? provider : null, REASON_KEY);
  const status = reasonStatus(mode, account, settings, key.present);

  const switchMode = (to: ReasonMode) => {
    setPending(to);
    setActionError(undefined);
    connectProvider("reason", reasonProviderFor(to), [])
      .then((s) => {
        setProvider(s);
        reload();
      })
      .catch((e) => {
        setPending(null);
        setActionError(errorText(e));
      });
  };

  return (
    <div className="ag-stack-6" data-testid="reason-tab">
      <AuthCards options={REASON_AUTH} value={mode} onChange={switchMode} />
      <StatusLine
        connected={status.connected}
        rows={status.rows}
        checking={loading && !account}
        refreshing={loading}
        onRefresh={refresh}
        notConnectedMessage={status.notConnectedMessage}
        detail={actionError ?? error}
      />
      {mode === "account" && !status.connected && <AccountSignIn onAccount={setAccount} onError={setActionError} />}
      {mode === "cli" && !status.connected && <LoginButton command="reason login" label="reason login" onDone={refresh} />}
      {mode === "apikey" && (
        <SecretRow
          label="Reason API key"
          configured={key.present}
          hint={key.hint}
          getKeyUrl={REASON_KEYS_URL}
          reveal={() => revealProviderSecret("reason", REASON_KEY)}
          onSave={async (value) => {
            setProvider(await connectProvider("reason", reasonProviderFor("apikey"), [{ key: REASON_KEY, value }]));
            reload();
            // The key lives in the Keychain, not settings.toml: ask `reason status` again with it.
            refresh();
          }}
          onDelete={async () => {
            // Disconnect deletes the key and returns to the login; keep the API key card selected.
            await disconnectProvider("reason");
            setProvider(await connectProvider("reason", reasonProviderFor("apikey"), []));
            reload();
            refresh();
          }}
        />
      )}
      {status.connected && account?.computerConnected === false && <ConnectComputer onDone={refresh} />}
      <div className="settings-rows agk-rows">
        <WorkspaceRow settings={settings} account={account} setDefault={setDefault} />
        <DefaultModelRows settings={settings} setDefault={setDefault} />
        <ReasonExecutableRow settings={settings} save={async (next) => {
          const saved = await save(next);
          if (saved !== false) refresh();
          return saved !== false;
        }} systemCli={paths?.systemCli ?? null} />
      </div>
      <ConfigFileCard title="Reason config" displayPath="~/.config/reason" path={paths?.configDir ?? null} />
    </div>
  );
}

/**
 * "Reason account": `reason login` without a terminal prints a link and a
 * code and finishes on its own once the link is used; the code is shown to
 * compare with the page, the link opens in the browser, and `reason status`
 * is polled until an account appears.
 */
function AccountSignIn({ onAccount, onError }: { onAccount: (a: ReasonAccount) => void; onError: (e?: string) => void }) {
  const [prompt, setPrompt] = useState<LoginPrompt | null>(null);
  const [starting, setStarting] = useState(false);
  const stop = useRef(false);
  useEffect(() => {
    if (!prompt) return;
    stop.current = false;
    const id = window.setInterval(() => {
      invoke<ReasonAccount>("reason_account_status").then(
        (a) => {
          if (!stop.current && signedIn(a)) {
            stop.current = true;
            setPrompt(null);
            onAccount(a);
          }
        },
        () => undefined,
      );
    }, POLL_MS);
    return () => {
      stop.current = true;
      window.clearInterval(id);
    };
  }, [prompt, onAccount]);

  const start = () => {
    onError(undefined);
    setStarting(true);
    invoke<LoginPrompt>("reason_login_start")
      .then((p) => {
        if (!p.url) return onError(p.message || "reason login gave no sign-in link");
        setPrompt(p);
        open(p.url);
      }, (e) => onError(errorText(e)))
      .finally(() => setStarting(false));
  };

  if (prompt)
    return (
      <div className="ag-stack-2" data-testid="reason-login-waiting">
        <div className="ag-between">
          <p className="ag-row-2 ag-muted ag-text-sm">
            <span className="ag-spinner" />
            Finish signing in to Reason in your browser.
          </p>
          <button type="button" className="ag-btn ag-outline ag-sm" onClick={() => setPrompt(null)}>
            Cancel
          </button>
        </div>
        {prompt.code && (
          <p className="ag-text-sm">
            The page shows the code <span className="agk-mono ag-medium" data-testid="reason-login-code">{prompt.code}</span>
          </p>
        )}
        <button type="button" className="ag-link" onClick={() => prompt.url && open(prompt.url)}>
          Open the sign-in page again
          <ExternalIcon size={12} />
        </button>
      </div>
    );
  return (
    <button type="button" className="ag-btn ag-primary ag-sm" disabled={!inTauri() || starting} onClick={start}>
      Sign in with Reason
    </button>
  );
}

/** "This Mac: Not connected" → Connect runs `reason connect`. */
function ConnectComputer({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const connect = () => {
    setBusy(true);
    setMessage(null);
    invoke<{ ok: boolean; message: string }>("reason_connect_computer")
      .then(
        (r) => {
          if (!r.ok) setMessage(r.message || "reason connect failed");
          onDone();
        },
        (e) => setMessage(errorText(e)),
      )
      .finally(() => setBusy(false));
  };
  return (
    <div className="ag-stack-1">
      <div className="ag-between">
        <p className="ag-muted ag-text-sm">Connect this Mac so Reason chats can run here.</p>
        <button type="button" className="ag-btn ag-outline ag-sm" disabled={busy} onClick={connect}>
          {busy && <span className="ag-spinner" />}
          Connect
        </button>
      </div>
      {message && <p className="ag-detail" role="alert">{message}</p>}
    </div>
  );
}

type SaveProps = { settings: Settings; save: AgentTabProps["save"] };
type SetReasonDefault = (key: Parameters<typeof withReason>[1], value: string) => void;
type ReasonDefaultProps = { settings: Settings; setDefault: SetReasonDefault };

/** The workspace `--workspace` pins new Reason chats to; the default follows the Reason app. */
function WorkspaceRow({ settings, account, setDefault }: ReasonDefaultProps & { account: ReasonAccount | null }) {
  const pinned = settings.reason?.workspace ?? "";
  const workspaces = account?.workspaces ?? [];
  const selected = workspaces.find((w) => w.selected);
  const known = pinned === "" || workspaces.some((w) => w.slug === pinned);
  return (
    <Row label="Workspace for new chats" help="New Reason chats open their Session in this workspace. Existing chats stay in theirs.">
      <select aria-label="Workspace for new chats" className="oc-agent-select-180" value={pinned} onChange={(e) => setDefault("workspace", e.target.value)}>
        <option value="">{selected ? `Reason app's (${selected.name})` : "Reason app's selection"}</option>
        {!known && <option value={pinned}>{pinned}</option>}
        {workspaces.map((w) => (
          <option key={w.slug} value={w.slug}>
            {w.name}
          </option>
        ))}
      </select>
      {activeWorkspace(settings, account) === null && pinned !== "" && workspaces.length > 0 && <span className="ag-detail">Not signed in to {pinned}</span>}
    </Row>
  );
}

/** Model and effort new Reason chats start with (`[reason] model`, `reasoning_effort`). */
function DefaultModelRows({ settings, setDefault }: ReasonDefaultProps) {
  const [models, setModels] = useState<ReasonModelOption[]>([]);
  // Asked again once the executable path settles (it saves per keystroke): the list comes from that `reason`.
  const exe = settings.reason_executable_path ?? null;
  const first = useRef(true);
  useEffect(() => {
    let live = true;
    const fresh = !first.current;
    first.current = false;
    const timer = setTimeout(() => void reasonModels(fresh).then((m) => live && setModels(m)), fresh ? 400 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [exe]);
  const model = settings.reason?.model ?? "";
  const effort = settings.reason?.reasoning_effort ?? "";
  const listed = model === "" || models.some((m) => m.value === model);
  return (
    <>
      <Row label="Default model" help="The model new Reason chats start on. You can change it per chat in the composer.">
        <select aria-label="Default Reason model" className="oc-agent-select-180" value={model} onChange={(e) => setDefault("model", e.target.value)}>
          <option value="">Default models setting</option>
          {!listed && <option value={model}>{model}</option>}
          {models.map((m) => (
            <option key={m.value} value={m.value} title={m.description}>
              {m.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Default effort" help="Reasoning effort for new Reason chats.">
        <select aria-label="Default Reason effort" className="oc-agent-select-180" value={effort} onChange={(e) => setDefault("reasoning_effort", e.target.value)}>
          {REASON_EFFORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
    </>
  );
}

/**
 * "Reason executable path", as the Claude Code and Codex rows, except that
 * Reason is not bundled: empty uses the `reason` the installer put on this
 * computer, and "Use system Reason" fills in where that is.
 */
function ReasonExecutableRow({ settings, save, systemCli }: SaveProps & { systemCli: string | null }) {
  const saved = settings.reason_executable_path ?? "";
  const [text, setText] = useState(saved);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(saved);
  }, [saved]);
  const set = (value: string) => {
    setText(value);
    void save({ ...settings, reason_executable_path: value.trim() === "" ? null : value });
  };
  const browse = async () => {
    if (!inTauri()) return;
    const { open: pick } = await import("@tauri-apps/plugin-dialog");
    const picked = await pick({ multiple: false, title: "Select Reason executable" });
    if (typeof picked === "string" && picked) set(picked);
  };
  return (
    <div className="settings-row settings-row-stacked oc-agent-exec" data-agent="reason">
      <div>
        <div className="settings-row-label">Reason executable path</div>
        <div className="muted small">Override the installed Reason executable with a custom one. Leave empty to use the installed version (recommended).</div>
      </div>
      <div className="oc-agent-exec-controls">
        <div className="oc-agent-exec-field">
          <input
            type="text"
            aria-label="Reason executable path"
            className="oc-agent-exec-input"
            placeholder={systemCli ?? "~/.local/bin/reason"}
            autoComplete="off"
            spellCheck={false}
            value={text}
            onFocus={() => (focused.current = true)}
            onBlur={() => {
              focused.current = false;
              setText(saved);
            }}
            onChange={(e) => set(e.target.value)}
          />
          <button type="button" className="oc-agent-icon-btn oc-agent-exec-browse" title="Browse for executable" aria-label="Browse for executable" onClick={() => browse().catch(() => undefined)}>
            <FolderIcon />
          </button>
        </div>
        {saved.trim() !== "" && (
          <button type="button" className="oc-agent-icon-btn" title="Reset to installed Reason" aria-label="Reset to installed Reason" onClick={() => set("")}>
            <CloseIcon size={14} />
          </button>
        )}
        {systemCli !== null && saved.trim() === "" && (
          <button type="button" className="btn btn-small oc-agent-outline" title={systemCli} onClick={() => set(systemCli)}>
            Use system Reason
          </button>
        )}
      </div>
    </div>
  );
}
