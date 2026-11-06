// Settings › Organization pages on the Reason workspace, laid out like
// Conductor 0.87.6's (renderApp-D_fmY7hW.js, read by byte offset and
// captured with REA in the tools/screens "team" scenario):
//  - Members `m0a` (@10,558,237): header with "Manage ↗", rows `h0a`
//    (initials avatar, name over email, role);
//  - Preferences: one switch, "Include link to workspace in PR description";
//  - Prompts `S0a` (@10,570,953): Personal / Shared tabs (`#shared`), rows
//    `cei` for General preferences and the four action buttons;
//  - Environment `o0a`: Personal / Shared variables, "Add environment
//    variable", "Import .env";
//  - MCP `W1a`: Installed / Recommended, "Search installed MCPs", "Add MCP
//    server" (recommended list `V$i`);
//  - Cloud computer `Tha`.
// Data comes from Reason through `reason call` (api.ts); strings from
// Conductor are matched as data, never followed.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { openUrl } from "../../backend";
import { ArrowUpRightIcon } from "../cloud/CloudSetupPage";
import { useCloudSetup } from "../cloud/useCloudSetup";
import { Row } from "../GeneralPage";
import { Toggle } from "../controls";
import { PROMPT_PLACEHOLDER } from "../rows/rowModel";
import type { PromptKind, Settings } from "../types";
import {
  addMcpServer,
  callErrorText,
  deleteVariable,
  loadMcpServers,
  loadMembers,
  loadVariables,
  needsReasonSignIn,
  removeMcpServer,
  setVariable,
} from "./api";
import {
  filterMcpServers,
  isServerUrl,
  isVariableName,
  memberInitials,
  parseDotenv,
  prWorkspaceLinkEnabled,
  roleLabel,
  withPrWorkspaceLink,
  type EnvScope,
  type OrgMcpServer,
  type OrgMember,
  type OrgVariable,
} from "./orgModel";
import { RECOMMENDED_MCPS } from "./recommendedMcps";
import "./org.css";

/** Where the Reason workspace's members, plan and catalog are managed. */
export const REASON_WORKSPACE_URL = "https://reasonmachines.com/customize";
export const REASON_PLUGINS_URL = "https://reasonmachines.com/customize?tab=plugins";

const open = (url: string) => void openUrl(url).catch(() => undefined);

type Load<T> = { state: "loading" } | { state: "signed-out" } | { state: "error"; message: string } | { state: "ready"; data: T };

/** One Reason read: reloads on `reload()`, and tells a signed-out CLI from a failure. */
function useReasonLoad<T>(read: () => Promise<T>, deps: unknown[]): [Load<T>, () => void] {
  const [load, setLoad] = useState<Load<T>>({ state: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    read().then(
      (data) => live && setLoad({ state: "ready", data }),
      (e) => live && setLoad(needsReasonSignIn(e) ? { state: "signed-out" } : { state: "error", message: callErrorText(e) }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return [load, useCallback(() => setTick((t) => t + 1), [])];
}

/** Conductor's `Z3`: the page title, its description and an action at the right. */
function OrgHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="settings-header org-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}

function SignedOut({ what, onOpenReasonSettings }: { what: string; onOpenReasonSettings: () => void }) {
  return (
    <div className="org-note">
      <p className="muted small">Sign in to Reason to see {what}. Your organization is the Reason workspace the Reason CLI is signed in to.</p>
      <button type="button" className="btn settings-outline settings-sm" onClick={onOpenReasonSettings}>
        Open Reason settings
      </button>
    </div>
  );
}

function Failed({ what, message, onRetry }: { what: string; message: string; onRetry: () => void }) {
  return (
    <div className="org-note">
      <p className="muted small" title={message}>
        Couldn't load {what}.
      </p>
      <button type="button" className="btn settings-outline settings-sm" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

/** Conductor's `ri type="working"` loader line. */
const Working = ({ label }: { label: string }) => <p className="muted small org-working">{label}</p>;

/** Conductor's underlined tab row (`yy` / `Q1`, `justify-start gap-6`, in a `border-b`). */
function OrgTabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly { id: T; label: string }[]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div className="org-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={`org-tab${value === t.id ? " on" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** A tab kept in the URL hash, as Conductor's Prompts page does (`#shared`). */
function useHashTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const read = () => {
    const h = window.location.hash.slice(1) as T;
    return tabs.includes(h) ? h : fallback;
  };
  const [tab, setTab] = useState<T>(read);
  const select = (t: T) => {
    setTab(t);
    const url = `${window.location.pathname}${window.location.search}${t === fallback ? "" : `#${t}`}`;
    window.history.replaceState(window.history.state, "", url);
  };
  return [tab, select];
}

// ---------------------------------------------------------------- Members

export function OrgMembersPage({ onOpenReasonSettings }: { onOpenReasonSettings: () => void }) {
  const [load, reload] = useReasonLoad(loadMembers, []);
  return (
    <div className="org-page">
      <OrgHeader
        title="Members"
        description="People in your organization."
        action={
          <button type="button" className="btn settings-primary settings-sm" onClick={() => open(REASON_WORKSPACE_URL)}>
            Manage
            <ArrowUpRightIcon size={16} />
          </button>
        }
      />
      {load.state === "loading" ? (
        <Working label="Loading members" />
      ) : load.state === "signed-out" ? (
        <SignedOut what="your workspace's members" onOpenReasonSettings={onOpenReasonSettings} />
      ) : load.state === "error" ? (
        <Failed what="members" message={load.message} onRetry={reload} />
      ) : load.data.members.length === 0 ? (
        <p className="muted small">No members yet.</p>
      ) : (
        <div className="org-list" role="list" aria-label="Members">
          {load.data.members.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
          {load.data.invites.map((email) => (
            <MemberRow key={`invite-${email}`} member={{ id: email, email, role: "invited" }} />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberRow({ member }: { member: OrgMember }) {
  const role = roleLabel(member.role);
  return (
    <div className="org-member" role="listitem">
      <span className="org-avatar" aria-hidden>
        {memberInitials(member)}
      </span>
      <span className="org-member-text">
        <span className="org-member-name">{member.name ?? member.email}</span>
        {member.name && <span className="org-member-email">{member.email}</span>}
      </span>
      {role && <span className="org-member-role">{role}</span>}
    </div>
  );
}

// ------------------------------------------------------------ Preferences

export function OrgPreferencesPage({ settings, save }: { settings: Settings; save: (next: Settings) => Promise<boolean> }) {
  const label = "Include link to workspace in PR description";
  return (
    <div className="org-page">
      <OrgHeader title="Preferences" />
      <Row label={label}>
        <Toggle label={label} checked={prWorkspaceLinkEnabled(settings)} onChange={(on) => void save(withPrWorkspaceLink(settings, on))} />
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------- Prompts

/** Conductor's `cei` rows, in its order: General preferences, then the four buttons. */
const ORG_PROMPTS: { kind: PromptKind; title: string; placeholder?: string }[] = [
  { kind: "general", title: "General preferences", placeholder: "Add custom instructions for all agents in this organization." },
  { kind: "code_review", title: '"Review" button' },
  { kind: "create_pr", title: '"Create PR" button' },
  { kind: "fix_errors", title: '"Fix errors" button' },
  { kind: "resolve_merge_conflicts", title: '"Resolve conflicts" button' },
];

const PROMPT_TABS = [
  { id: "personal", label: "Personal" },
  { id: "shared", label: "Shared" },
] as const;

export function OrgPromptsPage({ settings, save }: { settings: Settings; save: (next: Settings) => Promise<boolean> }) {
  const [tab, setTab] = useHashTab(["personal", "shared"] as const, "personal");
  return (
    <div className="org-page">
      <OrgHeader title="Prompts" />
      <OrgTabs tabs={PROMPT_TABS} value={tab} onChange={setTab} label="Prompts" />
      {tab === "personal" ? (
        <>
          <p className="muted small">Applied to your chats in this organization, alongside shared prompts.</p>
          <div className="org-prompts">
            {ORG_PROMPTS.map((p) => (
              <OrgPromptRow key={p.kind} spec={p} settings={settings} save={save} />
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="muted small">Applied to everyone's chats in this organization, alongside their personal prompts.</p>
          <div className="org-note">
            <p className="muted small">Shared prompts are your Reason workspace's instructions, which every Session in it follows. Change them in Reason.</p>
            <button type="button" className="btn settings-outline settings-sm" onClick={() => open(REASON_WORKSPACE_URL)}>
              Open Reason
              <ArrowUpRightIcon size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Edits wait 2 s after the last keystroke, then save; blur saves at once (Conductor's `y0a`). */
const SAVE_DEBOUNCE_MS = 2000;

function OrgPromptRow({ spec, settings, save }: { spec: (typeof ORG_PROMPTS)[number]; settings: Settings; save: (next: Settings) => Promise<boolean> }) {
  const current = settings.prompts?.[spec.kind] ?? null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current ?? "");
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(settings);
  latest.current = settings;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const commit = (text: string) => {
    window.clearTimeout(timer.current);
    const value = text.trim() === "" ? null : text.trim();
    const s = latest.current;
    if ((s.prompts?.[spec.kind] ?? null) === value) return;
    void save({ ...s, prompts: { ...(s.prompts ?? {}), [spec.kind]: value } });
  };
  const id = `org-prompt-${spec.kind}`;
  return (
    <div className="settings-row oc-prompt-row org-prompt-row" data-settings-row data-open={open || undefined}>
      <button type="button" className="oc-prompt-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="oc-prompt-text">
          <span className="oc-prompt-title">
            <span>{spec.title}</span>
            {current && <span className="oc-prompt-badge">Customized</span>}
          </span>
        </span>
        <svg className="oc-prompt-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="oc-prompt-panel" id={id}>
          <textarea
            aria-label={`${spec.title} prompt`}
            placeholder={spec.placeholder ?? PROMPT_PLACEHOLDER}
            value={draft}
            spellCheck={false}
            onChange={(e) => {
              const text = e.target.value;
              setDraft(text);
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => commit(text), SAVE_DEBOUNCE_MS);
            }}
            onBlur={() => commit(draft)}
          />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Environment

const ENV_TABS = [
  { id: "personal", label: "Personal" },
  { id: "shared", label: "Shared" },
] as const;

/** Conductor's `o0a` tab descriptions. */
const ENV_HELP: Record<EnvScope, string> = {
  personal: "Applied to workspaces you create, and refreshed when those workspaces restart. May be visible to your teammates.",
  shared: "Applied to workspaces when they are created, and refreshed when those workspaces restart.",
};

const PlusIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M12 5v14" />
  </svg>
);
const UploadIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12M17 8l-5-5-5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  </svg>
);
const TrashIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const SearchIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export function OrgEnvironmentPage({ onOpenReasonSettings }: { onOpenReasonSettings: () => void }) {
  const [tab, setTab] = useHashTab(["personal", "shared"] as const, "personal");
  const [load, reload] = useReasonLoad(() => loadVariables(tab), [tab]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      reload();
    } catch (e) {
      setError(`${failure}: ${callErrorText(e)}`);
    } finally {
      setBusy(false);
    }
  };
  const importDotenv = async (f: File) => {
    const vars = parseDotenv(await f.text()).filter((v) => v.value.trim() !== "");
    await run(async () => {
      for (const v of vars) await setVariable(tab, v.name, v.value);
    }, "Couldn't import .env");
  };

  return (
    <div className="org-page">
      <OrgHeader title="Environment" />
      <OrgTabs tabs={ENV_TABS} value={tab} onChange={(t) => (setTab(t), setAdding(false), setError(null))} label="Environment" />
      <p className="muted small">{ENV_HELP[tab]}</p>
      {load.state === "signed-out" ? (
        <SignedOut what="your workspace's environment variables" onOpenReasonSettings={onOpenReasonSettings} />
      ) : (
        <>
          <div className="org-actions">
            <button type="button" className="btn settings-primary" disabled={busy || load.state !== "ready"} onClick={() => setAdding(true)}>
              <PlusIcon />
              Add environment variable
            </button>
            <button type="button" className="btn settings-outline" disabled={busy || load.state !== "ready"} onClick={() => file.current?.click()}>
              <UploadIcon />
              Import .env
            </button>
            <input
              ref={file}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importDotenv(f);
              }}
            />
          </div>
          {adding && (
            <AddVariable
              busy={busy}
              onCancel={() => setAdding(false)}
              onSave={(name, value) => void run(async () => (await setVariable(tab, name, value), setAdding(false)), "Couldn't save environment variable")}
            />
          )}
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
          {load.state === "loading" ? (
            <Working label="Loading environment variables" />
          ) : load.state === "error" ? (
            <Failed what="environment variables" message={load.message} onRetry={reload} />
          ) : (
            <VariableList vars={load.data} busy={busy} onDelete={(v) => void run(() => deleteVariable(tab, v.name), "Couldn't delete environment variable")} />
          )}
        </>
      )}
    </div>
  );
}

function VariableList({ vars, busy, onDelete }: { vars: OrgVariable[]; busy: boolean; onDelete: (v: OrgVariable) => void }) {
  if (vars.length === 0) return <div className="org-box org-empty-box">No variables yet</div>;
  return (
    <div className="org-list" role="list" aria-label="Environment variables">
      {vars.map((v) => (
        <div key={v.name} className="org-var" role="listitem">
          <code className="org-var-name">{v.name}</code>
          <span className="org-var-value" aria-label="Value hidden">
            ••••••••
          </span>
          <button type="button" className="btn settings-test org-icon-btn" aria-label={`Delete ${v.name}`} disabled={busy} onClick={() => onDelete(v)}>
            <TrashIcon />
          </button>
        </div>
      ))}
    </div>
  );
}

function AddVariable({ busy, onSave, onCancel }: { busy: boolean; onSave: (name: string, value: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const nameOk = isVariableName(name.trim());
  const ok = nameOk && value.trim() !== "";
  return (
    <form
      className="org-box org-add-var"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok && !busy) onSave(name.trim(), value);
      }}
    >
      <input className="settings-input" aria-label="Name" placeholder="NAME" value={name} autoFocus spellCheck={false} onChange={(e) => setName(e.target.value)} />
      <input className="settings-input" aria-label="Value" placeholder="Value" type="password" value={value} spellCheck={false} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" className="btn settings-primary settings-sm" disabled={!ok || busy}>
        Save
      </button>
      <button type="button" className="btn settings-ghost settings-sm" onClick={onCancel}>
        Cancel
      </button>
      {name.trim() !== "" && !nameOk && <p className="error small org-add-hint">Use letters, digits and underscores, starting with a letter or underscore.</p>}
    </form>
  );
}

// -------------------------------------------------------------------- MCP

const MCP_TABS = [
  { id: "installed", label: "Installed" },
  { id: "recommended", label: "Recommended" },
] as const;

export function OrgMcpPage({ onOpenReasonSettings }: { onOpenReasonSettings: () => void }) {
  const [tab, setTab] = useState<"installed" | "recommended">("installed");
  const [load, reload] = useReasonLoad(loadMcpServers, []);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      reload();
    } catch (e) {
      setError(`${failure}: ${callErrorText(e)}`);
    } finally {
      setBusy(false);
    }
  };
  const installed = load.state === "ready" ? load.data : [];
  const recommended = RECOMMENDED_MCPS.filter(
    (r) => !installed.some((s) => s.url === r.url || s.name.toLowerCase() === r.name.toLowerCase()) && (query.trim() === "" || r.label.toLowerCase().includes(query.trim().toLowerCase())),
  );
  return (
    <div className="org-page">
      <OrgHeader title="MCP" />
      <OrgTabs tabs={MCP_TABS} value={tab} onChange={(t) => (setTab(t), setQuery(""))} label="MCP" />
      {load.state === "signed-out" ? (
        <SignedOut what="your workspace's MCP servers" onOpenReasonSettings={onOpenReasonSettings} />
      ) : (
        <>
          <div className="org-actions">
            <label className="org-search">
              <SearchIcon />
              <input
                aria-label={tab === "installed" ? "Search installed MCPs" : "Search recommended MCPs"}
                placeholder={tab === "installed" ? "Search installed MCPs" : "Search recommended MCPs"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {tab === "installed" && (
              <button type="button" className="btn settings-primary settings-sm" disabled={busy || load.state !== "ready"} onClick={() => setAdding(true)}>
                <PlusIcon />
                Add MCP server
              </button>
            )}
          </div>
          {adding && tab === "installed" && (
            <AddMcpServer busy={busy} onCancel={() => setAdding(false)} onSave={(name, url) => void run(async () => (await addMcpServer(name, url), setAdding(false)), "Couldn't add MCP server")} />
          )}
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
          {tab === "installed" ? (
            load.state === "loading" ? (
              <Working label="Loading MCP servers" />
            ) : load.state === "error" ? (
              <Failed what="MCP servers" message={load.message} onRetry={reload} />
            ) : (
              <McpList servers={filterMcpServers(installed, query)} total={installed.length} busy={busy} onRemove={(s) => void run(() => removeMcpServer(s.id), "Couldn't remove MCP server")} />
            )
          ) : recommended.length === 0 ? (
            <p className="muted small org-center">{query.trim() === "" ? "All recommended MCPs are configured" : "No recommended MCPs match your search"}</p>
          ) : (
            <div className="org-list" role="list" aria-label="Recommended MCPs">
              {recommended.map((r) => (
                <div key={r.name} className="org-var" role="listitem">
                  <span className="org-mcp-name">{r.label}</span>
                  <span className="org-var-value">{r.url}</span>
                  <button type="button" className="btn settings-outline settings-sm" disabled={busy || load.state !== "ready"} onClick={() => void run(() => addMcpServer(r.label, r.url), "Couldn't add MCP server")}>
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function McpList({ servers, total, busy, onRemove }: { servers: OrgMcpServer[]; total: number; busy: boolean; onRemove: (s: OrgMcpServer) => void }) {
  if (total === 0) return <p className="muted small org-center">No MCP servers installed</p>;
  if (servers.length === 0) return <p className="muted small org-center">No installed MCPs match your search</p>;
  return (
    <div className="org-list" role="list" aria-label="Installed MCPs">
      {servers.map((s) => (
        <div key={s.id} className="org-var" role="listitem">
          <span className="org-mcp-name">{s.name}</span>
          <span className="org-var-value">{s.state === "needs_auth" ? "Needs sign-in in Reason" : s.tools > 0 ? `${s.tools} tools` : s.url ?? s.transport ?? ""}</span>
          <button type="button" className="btn settings-test org-icon-btn" aria-label={`Remove ${s.name}`} disabled={busy} onClick={() => onRemove(s)}>
            <TrashIcon />
          </button>
        </div>
      ))}
    </div>
  );
}

function AddMcpServer({ busy, onSave, onCancel }: { busy: boolean; onSave: (name: string, url: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const ok = name.trim() !== "" && isServerUrl(url);
  return (
    <form
      className="org-box org-add-var"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok && !busy) onSave(name, url);
      }}
    >
      <input className="settings-input" aria-label="Name" placeholder="Name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <input className="settings-input" aria-label="URL" placeholder="https://example.com/mcp" value={url} spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
      <button type="submit" className="btn settings-primary settings-sm" disabled={!ok || busy}>
        Add
      </button>
      <button type="button" className="btn settings-ghost settings-sm" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

// --------------------------------------------------------- Cloud computer

/**
 * Conductor's `Tha` configures one shared machine (repositories, install
 * script, "Build computer"). Reason gives every Session its own cloud
 * computer on demand, so there is nothing to build: the page says so and
 * lists the repositories that computer can clone (`listRepositories`).
 */
const SHOWN_REPOS = 20;

export function OrgComputerPage({ onOpenCloudSetup }: { onOpenCloudSetup: () => void }) {
  const { setup, loading, refresh } = useCloudSetup();
  const repos = setup?.repositories ?? null;
  return (
    <div className="org-page">
      <OrgHeader title="Cloud computer" description="Configure your organization's shared cloud computer." />
      <div className="org-box org-computer-status">
        <span>{setup?.signedIn ? "Managed by Reason" : loading && !setup ? "Checking…" : "Not signed in to Reason"}</span>
        <button type="button" className="btn settings-outline settings-sm" onClick={onOpenCloudSetup}>
          Cloud setup
        </button>
      </div>
      <p className="muted small">Each cloud workspace runs as a Reason Session on its own Reason cloud computer, created when the workspace starts. Claude Code and Codex stay on this Mac.</p>
      <section className="org-section" aria-label="Repositories">
        <h2>Repositories</h2>
        <div className="org-box org-computer-status">
          <span>{repos === null ? "Repositories unavailable" : `${repos.length} ${repos.length === 1 ? "repository" : "repositories"} available`}</span>
          <button type="button" className="btn settings-test" aria-label="Refresh" onClick={refresh}>
            Refresh
          </button>
        </div>
        {repos !== null && repos.length > 0 && (
          <div className="org-list" role="list" aria-label="Available repositories">
            {repos.slice(0, SHOWN_REPOS).map((r) => (
              <div key={r} className="org-var" role="listitem">
                <code className="org-var-name">{r}</code>
              </div>
            ))}
            {repos.length > SHOWN_REPOS && <div className="org-var muted small">and {repos.length - SHOWN_REPOS} more</div>}
          </div>
        )}
      </section>
    </div>
  );
}
