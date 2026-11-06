// Shared building blocks of the redesigned Settings › Agents page (tabs
// Reason, Claude Code, Codex). Each tab is laid out top to bottom as
// Conductor 0.87.6 lays out its providers page (`Upa`/`$pa`, `wzi`, `t$i`,
// `Kla`, `YWt`, `mGt`, `Nzi`/`P9` in renderApp-D_fmY7hW.js; Sven's native
// screenshots): Authentication cards, the status line with Refresh and its
// key/value table, the masked secret row, option rows, the executable path
// and the config-file card. The Codex and Reason tabs import from here.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AppIcon } from "../../features/openIn/OpenInButton";
import { defaultAppId, loadOpenInApps, openInApp, type OpenInApp } from "../../features/openIn/apps";
import { recordOpenIn, useAppPrefs } from "../appPrefs";
import type { InfoRow } from "./agentAuth";
import { CheckIcon, ChevronDownIcon, EyeIcon, PencilIcon, TrashIcon } from "./icons";
import { AuthStatus } from "./parts";
import { maskedSecret } from "./kitModel";
import "./kit.css";

export type { InfoRow };
export { RefreshButton, LoginButton } from "./parts";
export { ExecutablePathRow } from "../rows/AgentOptionRows";

export { AGENTS_TABS, AGENTS_TAB_LABEL, agentsTabFrom, maskedSecret, type AgentsTab } from "./kitModel";

export interface TabSpec<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

/** The page title with "Open settings.toml" at the right (Sven's reference). */
export function AgentsHeader({ settingsPath }: { settingsPath: string | null }) {
  return (
    <header className="agk-header">
      <h1>Agents</h1>
      <OpenInSplit label="Open settings.toml" path={settingsPath} />
    </header>
  );
}

/** Icon + name tabs with an underline on the open one (`yy`/`Q1`). */
export function AgentTabRow<T extends string>({ tabs, value, onChange }: { tabs: readonly TabSpec<T>[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" aria-label="Agents" className="ag-tabs">
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} className={`ag-tab${value === t.id ? " on" : ""}`} onClick={() => onChange(t.id)}>
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export interface AuthOption<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
  /** Shows the "Recommended" pill after the label. */
  recommended?: boolean;
}

/** "Authentication" over equal-width cards; the active one is filled and checked. */
export function AuthCards<T extends string>({ options, value, onChange }: { options: readonly AuthOption<T>[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="ag-stack-2">
      <p className="ag-label">Authentication</p>
      <div className="agk-cards" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button key={o.id} type="button" aria-pressed={on} className={`ag-mode${on ? " on" : ""}`} onClick={() => !on && onChange(o.id)}>
              {on && (
                <span className="ag-mode-check">
                  <CheckIcon size={16} />
                </span>
              )}
              {o.icon}
              <span className="ag-mode-label">
                {o.label}
                {o.recommended && <span className="agk-pill">Recommended</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "● Connected" (or a red dot and why not) with Refresh at the right, then
 * the key/value table while connected.
 */
export function StatusLine(props: {
  connected: boolean;
  rows: InfoRow[];
  checking: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  notConnectedMessage: string;
  detail?: string;
}) {
  const { connected, checking, ...rest } = props;
  return <AuthStatus authenticated={connected} loading={checking} {...rest} />;
}

/** The bordered key/value table on its own. */
export function StatusTable({ rows }: { rows: InfoRow[] }) {
  if (rows.length === 0) return null;
  return (
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
  );
}

/**
 * A stored secret: masked with show, edit and delete, or a key field when
 * none is stored. The value only enters the page when the eye is pressed
 * (`reveal`), and is dropped again when it is hidden or the row unmounts.
 */
export function SecretRow(props: {
  label: string;
  configured: boolean;
  hint?: string | null;
  reveal?: () => Promise<string>;
  onSave: (value: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { label, configured, hint, reveal, onSave, onDelete } = props;
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!configured) setShown(null);
  }, [configured]);

  const run = (what: string, f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    f()
      .catch((e) => setError(`Failed to ${what} ${label}: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setBusy(false));
  };

  if (!configured || editing) {
    return (
      <div className="ag-stack-2">
        <SecretInput
          label={label}
          pending={busy}
          onCancel={configured ? () => setEditing(false) : undefined}
          onSubmit={(v) =>
            run("save", async () => {
              await onSave(v);
              setShown(null);
              setEditing(false);
            })
          }
        />
        {error && <p className="ag-error">{error}</p>}
      </div>
    );
  }
  return (
    <div className="ag-stack-2">
      <div className="ag-key-row">
        <span className={`ag-key-mask${shown ? " agk-shown" : ""}`} data-testid="secret-value" aria-label={shown ? label : `${label} stored`}>
          {shown ?? maskedSecret(hint)}
        </span>
        <div className="ag-key-actions">
          {reveal && (
            <button
              type="button"
              className="ag-btn ag-ghost ag-icon"
              aria-label={shown ? `Hide ${label}` : `Show ${label}`}
              aria-pressed={shown !== null}
              disabled={busy}
              onClick={() => (shown ? setShown(null) : run("show", async () => setShown(await reveal())))}
            >
              {shown ? <EyeOffIcon /> : <EyeIcon size={16} />}
            </button>
          )}
          <button type="button" className="ag-btn ag-ghost ag-icon" aria-label={`Edit ${label}`} disabled={busy} onClick={() => (setShown(null), setEditing(true))}>
            <PencilIcon size={16} />
          </button>
          <button type="button" className="ag-btn ag-ghost ag-icon" aria-label={`Remove ${label}`} disabled={busy} onClick={() => run("remove", onDelete)}>
            <TrashIcon size={16} />
          </button>
        </div>
      </div>
      {error && <p className="ag-error">{error}</p>}
    </div>
  );
}

function SecretInput({ label, pending, onSubmit, onCancel }: { label: string; pending: boolean; onSubmit: (v: string) => void; onCancel?: () => void }) {
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
      {onCancel && (
        <button type="button" className="ag-btn ag-ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      )}
      <button type="submit" className="ag-btn ag-primary" disabled={pending || value.trim() === ""}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

/** One option row between hairlines: title and help at the left, the control at the right. */
export function OptionRow({ title, help, control, stacked }: { title: ReactNode; help?: ReactNode; control: ReactNode; stacked?: boolean }) {
  return (
    <div className={`agk-option${stacked ? " stacked" : ""}`}>
      <div className="agk-option-text">
        <div className="ag-label">{title}</div>
        {help && <div className="ag-muted ag-text-sm">{help}</div>}
      </div>
      <div className="agk-option-control">{control}</div>
    </div>
  );
}

/** A file's card: title, path in mono, and "Open in" at the right (`Nzi`). */
export function ConfigFileCard({ title, displayPath, path }: { title: string; displayPath: string; path: string | null }) {
  return (
    <section className="agk-config" aria-label={title}>
      <div className="agk-config-text">
        <h3>{title}</h3>
        <p className="agk-mono">{displayPath}</p>
      </div>
      <OpenInSplit label="Open in" path={path} />
    </section>
  );
}

/**
 * Conductor's `P9` split button beside settings paths: the left half opens
 * `path` in the last-used app (its icon first), the chevron lists the
 * installed apps. Disabled until `path` is known.
 */
export function OpenInSplit({ label, path }: { label: string; path: string | null }) {
  const [apps, setApps] = useState<OpenInApp[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const saved = useAppPrefs().default_open_in;
  useEffect(() => {
    let live = true;
    loadOpenInApps().then(
      (a) => live && setApps(a),
      () => live && setApps([]),
    );
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close, true);
    return () => document.removeEventListener("mousedown", close, true);
  }, [open]);
  const list = apps ?? [];
  const def = list.find((a) => a.id === defaultAppId(list, saved));
  const openWith = (id: string) => {
    setOpen(false);
    if (!path) return;
    void recordOpenIn(id, false).catch(() => undefined);
    openInApp(id, path).then(
      () => setError(null),
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  };
  return (
    <div className="agk-split" ref={wrap}>
      <button type="button" className="agk-split-main" disabled={!path || !def} title={def ? `${label} ${def.name}` : label} onClick={() => def && openWith(def.id)}>
        {def && <AppIcon app={def} size={12} />}
        {label}
      </button>
      <button type="button" className="agk-split-chevron" disabled={!path || list.length === 0} aria-label={`${label}...`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div className="ag-menu ag-menu-end agk-split-menu" role="menu" aria-label={label}>
          {list.map((a) => (
            <button key={a.id} type="button" role="menuitem" className="ag-menu-item" onClick={() => openWith(a.id)}>
              <AppIcon app={a} size={14} />
              {a.name}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="ag-error agk-split-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const EyeOffIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.5 3.4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </svg>
);
