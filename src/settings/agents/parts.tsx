// Building blocks of Settings › Agents, one per Conductor component
// (renderApp-D_fmY7hW.js): the Authentication cards (`wzi`), the status line
// (`t$i` with `e$i`, `Qla`, `Kla`, `EZn`), the API key field (`YWt`, `n$i`,
// `Zla`) and the login button with its embedded terminal (`Met`, `ONi`).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { onPtyEvent, ptyKill, ptyResize, ptySpawn, ptyWrite } from "../../features/terminal/pty";
import { AUTH_MODE_LABEL, type AuthMode, type InfoRow } from "./agentAuth";
import { homeDir, openExternal, type AuthSource } from "./api";
import { CheckIcon, CloseIcon, CodexMark, ExternalIcon, GearIcon, KeyIcon, PencilIcon, PlayIcon, RefreshIcon, TerminalIcon, TrashIcon } from "./icons";

const MODE_ICON: Record<AuthMode, ReactNode> = {
  cli: <TerminalIcon size={24} />,
  apikey: <KeyIcon size={24} />,
  chatgpt: <CodexMark size={24} />,
};

/**
 * A settings row's "Setting actions" menu (Conductor's `mho`): a gear shown
 * on hover while the row's setting is set, with one item, Reset.
 */
export function SettingActions({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className={`ag-row-action${open ? " open" : ""}`} ref={ref}>
      <button type="button" className="ag-gear" aria-label="Setting actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <GearIcon size={16} />
      </button>
      {open && (
        <div className="ag-menu ag-menu-end" role="menu">
          <button
            type="button"
            role="menuitem"
            className="ag-menu-item"
            onClick={() => {
              setOpen(false);
              onReset();
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

/** "Authentication" and its cards; clicking another card switches at once. */
export function AuthModePicker({
  value,
  modes,
  onChange,
  onReset,
}: {
  value: AuthMode;
  modes: readonly AuthMode[];
  onChange: (m: AuthMode) => void;
  /** Set when the provider is configured: shows the row's Reset action. */
  onReset?: () => void;
}) {
  return (
    <div className="ag-stack-2 ag-settings-row">
      {onReset && (
        <div className="ag-row-action-slot">
          <SettingActions onReset={onReset} />
        </div>
      )}
      <p className="ag-label">Authentication</p>
      <div className={`ag-mode-grid cols-${modes.length}${onReset ? " ag-pr-8" : ""}`}>
        {modes.map((m) => {
          const on = value === m;
          return (
            <button key={m} type="button" aria-pressed={on} className={`ag-mode${on ? " on" : ""}`} onClick={() => !on && onChange(m)}>
              {on && (
                <span className="ag-mode-check">
                  <CheckIcon size={16} />
                </span>
              )}
              {MODE_ICON[m]}
              <span className="ag-mode-label">{AUTH_MODE_LABEL[m]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RefreshButton({ onRefresh, refreshing }: { onRefresh: () => void; refreshing?: boolean }) {
  return (
    <button type="button" className="ag-btn ag-ghost ag-sm ag-h7" onClick={onRefresh} disabled={refreshing}>
      <RefreshIcon size={12} spinning={refreshing} />
      Refresh
    </button>
  );
}

/** Status line: "Checking login status...", a green "Connected" with its info table, or a red dot and the reason. */
export function AuthStatus(props: {
  authenticated: boolean;
  rows: InfoRow[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  notConnectedMessage: string;
  detail?: string;
}) {
  const { authenticated, rows, loading, refreshing, onRefresh, notConnectedMessage, detail } = props;
  if (loading && !authenticated) {
    return (
      <div className="ag-stack-3">
        <div className="ag-between">
          <p className="ag-muted ag-text-sm">Checking login status...</p>
          <RefreshButton onRefresh={onRefresh} refreshing={refreshing} />
        </div>
      </div>
    );
  }
  return (
    <div className="ag-stack-3" data-testid="agent-auth-status">
      <div className="ag-between">
        {authenticated ? (
          <div className="ag-status">
            <span className="ag-dot ok" />
            Connected
          </div>
        ) : (
          <div className="ag-status ag-muted">
            <span className="ag-dot bad" />
            {notConnectedMessage}
          </div>
        )}
        <RefreshButton onRefresh={onRefresh} refreshing={refreshing} />
      </div>
      {detail && <p className="ag-detail">{detail}</p>}
      {authenticated && rows.length > 0 && (
        <div className="ag-info">
          <table>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th>{r.label}</th>
                  <td title={r.value}>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A password field with Save (Conductor's `n$i`). */
function KeyInput({ label, pending, onSubmit }: { label: string; pending: boolean; onSubmit: (v: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (v && !pending) onSubmit(v);
  };
  return (
    <form className="ag-key-form" onSubmit={submit}>
      <div className="ag-grow">
        <input
          type="password"
          className="ag-input"
          placeholder={label}
          aria-label={label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
      <button type="submit" className="ag-btn ag-primary" disabled={pending || value.trim() === ""}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

/**
 * The API key field (Conductor's `YWt`). With a key stored it shows the
 * masked key with Edit and Remove; keys are write-only here, so the mask
 * carries no characters of the key and there is no reveal or copy.
 */
export function ApiKeyField(props: {
  label: string;
  configured: boolean;
  getKeyUrl?: string;
  onSave: (value: string) => Promise<boolean>;
  onRemove: () => Promise<void>;
}) {
  const { label, configured, getKeyUrl, onSave, onRemove } = props;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = (v: string) => {
    setSaving(true);
    setError(null);
    onSave(v)
      .then((ok) => ok && setEditing(false))
      .catch((e) => setError(`Failed to save ${label}: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setSaving(false));
  };
  const remove = () => {
    setRemoving(true);
    setError(null);
    onRemove()
      .catch((e) => setError(`Failed to remove ${label}: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setRemoving(false));
  };

  if (configured && !editing) {
    return (
      <div className="ag-stack-2">
        <div className="ag-key-row">
          <span className="ag-key-mask" aria-label={`${label} stored`}>
            ••••••••
          </span>
          <div className="ag-key-actions">
            <button type="button" className="ag-btn ag-ghost ag-icon" aria-label={`Edit ${label}`} onClick={() => setEditing(true)}>
              <PencilIcon size={16} />
            </button>
            <button type="button" className="ag-btn ag-ghost ag-icon" aria-label={`Remove ${label}`} disabled={removing} onClick={remove}>
              <TrashIcon size={16} />
            </button>
          </div>
        </div>
        {error && <p className="ag-error">{error}</p>}
      </div>
    );
  }
  return (
    <div className="ag-stack-2">
      <KeyInput label={label} pending={saving} onSubmit={save} />
      {(configured || getKeyUrl) && (
        <div className="ag-row-4">
          {configured && (
            <button type="button" className="ag-btn ag-ghost ag-sm" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
          {getKeyUrl && (
            <button type="button" className="ag-link-underline" onClick={() => void openExternal(getKeyUrl)}>
              Get key
              <ExternalIcon size={12} />
            </button>
          )}
        </div>
      )}
      {error && <p className="ag-error">{error}</p>}
    </div>
  );
}

/** "Run claude /login": opens a terminal in the home folder running the login command (Conductor's `Met`). */
export function LoginButton({ command, label, onDone }: { command: string; label: string; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  if (running)
    return (
      <LoginTerminal
        command={command}
        label={label}
        onDismiss={() => setRunning(false)}
        onDone={() => {
          setRunning(false);
          onDone();
        }}
      />
    );
  return (
    <button type="button" className="ag-btn ag-outline ag-sm" onClick={() => setRunning(true)}>
      <PlayIcon size={12} />
      Run {label}
    </button>
  );
}

type TermState = "starting" | "running" | "exited" | "spawn_error";

/** Conductor's `rTo` header text. */
export function terminalHeader(label: string, state: TermState, error?: string): string {
  if (state === "spawn_error") return error ?? "Failed to start terminal.";
  if (state === "exited") return `Finished ${label}. You can keep using this shell or click done.`;
  if (state === "running") return `Running ${label}.`;
  return `Starting ${label}...`;
}

function LoginTerminal({ command, label, onDismiss, onDone }: { command: string; label: string; onDismiss: () => void; onDone: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TermState>("starting");
  const [error, setError] = useState<string>();

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const term = new Terminal({ fontSize: 12, cursorBlink: true, convertEol: false, theme: { background: getComputedStyle(document.documentElement).getPropertyValue("--terminal-transparent").trim() }, allowTransparency: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    let id: string | undefined;
    let gone = false;
    const unlisten = onPtyEvent((e) => {
      if (e.id !== id) return;
      if (e.kind === "data") term.write(e.data);
      else if (e.kind === "ready") setState("running");
      else if (e.kind === "exit") setState("exited");
    });
    const input = term.onData((d) => id && void ptyWrite(id, d));
    const resize = term.onResize(({ cols, rows }) => id && void ptyResize(id, cols, rows));
    (async () => {
      try {
        const cwd = await homeDir();
        // The shell runs the command, then exits, so "exit" means the command finished.
        const spawned = await ptySpawn({ cwd, cols: term.cols, rows: term.rows, initialCommand: `${command}; exit` });
        if (gone) return void ptyKill(spawned).catch(() => {});
        id = spawned;
        setState("running");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState("spawn_error");
      }
    })();
    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(el);
    return () => {
      gone = true;
      ro.disconnect();
      input.dispose();
      resize.dispose();
      void unlisten.then((u) => u());
      if (id) void ptyKill(id).catch(() => {});
      term.dispose();
    };
  }, [command]);

  const done = state === "exited";
  return (
    <div className="ag-term">
      <div className="ag-term-head">
        {done ? <CheckIcon size={14} /> : <span className="ag-spinner" />}
        <span className="ag-grow ag-truncate">{terminalHeader(label, state, error)}</span>
        {done && (
          <button type="button" className="ag-btn ag-primary ag-xs" onClick={onDone}>
            Done
          </button>
        )}
        <button type="button" className="ag-btn ag-ghost ag-icon-xs" aria-label="Close terminal" onClick={onDismiss}>
          <CloseIcon size={12} />
        </button>
      </div>
      <div className="ag-term-body" data-terminal ref={mount} />
    </div>
  );
}

/**
 * Every sign-in found for the agent (`agent_auth_sources`), the one a chat
 * uses marked "In use". Login-shell keys are never used directly (chats clear
 * agent keys from the shell environment, as Conductor does); "Import" copies
 * one into OpenConductor's Keychain. Shows nothing until something is found.
 */
export function SignInSources({ sources, onImport }: { sources: AuthSource[]; onImport: (s: AuthSource) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  if (sources.length === 0) return null;
  return (
    <div className="ag-stack-2" data-testid="agent-auth-sources">
      <p className="ag-label">Sign-ins found</p>
      <div className="ag-info">
        <table>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} data-source={s.id} data-active={s.active ? "true" : "false"}>
                <th title={s.label}>{s.label}</th>
                <td title={[s.location, s.detail].filter(Boolean).join(" · ")}>
                  <span className="ag-src-row">
                    <span className="ag-grow ag-truncate">
                      {s.plan === "subscription" ? "Subscription" : "API key"} · {s.location}
                      {s.detail ? ` · ${s.detail}` : ""}
                    </span>
                    {s.active && <span className="ag-src-badge">In use</span>}
                    {s.importable && (
                      <button
                        type="button"
                        className="ag-btn ag-outline ag-sm ag-h7"
                        disabled={busy !== null}
                        onClick={() => {
                          setBusy(s.id);
                          setError(undefined);
                          onImport(s)
                            .catch((e) => setError(`Failed to import ${s.label}: ${e instanceof Error ? e.message : String(e)}`))
                            .finally(() => setBusy(null));
                        }}
                      >
                        {busy === s.id ? "Importing…" : "Import"}
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="ag-detail">{error}</p>}
    </div>
  );
}
