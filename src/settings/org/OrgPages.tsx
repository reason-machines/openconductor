// Settings › Organization: Conductor 0.87.6's organization pages for the
// active Reason workspace (src/org/organization.ts). Layout and copy follow
// Conductor's components (renderApp-D_fmY7hW.js, REA-captured in the
// tools/screens harness with ?oc_org=cloud); what each page shows comes from
// Reason through `reason call` (src/org/api.ts), or says plainly what Reason
// keeps for itself. evidence/org/NOTES.md maps each page to its Reason source.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { openUrl } from "../../backend";
import { ConductorIcon } from "../../components/ConductorIcon";
import { errorText, loadMcpServers, loadMcpServices, loadMembers, loadRepositories, type ReasonRepository } from "../../org/api";
import { installedMcp, memberRow, type McpService, type Member } from "../../org/organization";
import { REASON_GITHUB_URL } from "../cloud/cloudSetup";
import { Row } from "../GeneralPage";
import { Toggle } from "../controls";
import { envVarStore, parsePastedVars, type StoredVar } from "../EnvironmentPage";
import { PROMPT_PLACEHOLDER } from "../rows/rowModel";
import type { OrgPage, SettingsLocation } from "../routes";
import type { PromptKind, Settings } from "../types";
import "./org.css";

/** Reason pages a button opens in the browser (docs.reasonmachines.com, "Customize"). */
export const REASON_MCP_URL = "https://reasonmachines.com/customize?tab=plugins";
export const REASON_COMPUTERS_DOCS_URL = "https://docs.reasonmachines.com/docs/build/computers";
export const REASON_SECRETS_URL = "https://reasonmachines.com/customize?tab=secrets";

/** Conductor's `Z3` headers of the organization pages: title, then a description where it has one. */
export const ORG_HEADERS: Record<OrgPage, { title: string; description?: string }> = {
  computer: { title: "Cloud computer", description: "Cloud workspaces in this organization run on Reason cloud computers." },
  members: { title: "Members", description: "People in your organization." },
  preferences: { title: "Preferences" },
  environment: { title: "Environment" },
  mcp: { title: "MCP" },
  prompts: { title: "Prompts" },
};

type Load<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; value: T };

/** One Reason read with Conductor's loading, error ("Couldn't load …" + Retry) and ready states. */
function useReasonRead<T>(read: () => Promise<T>): [Load<T>, () => void] {
  const [load, setLoad] = useState<Load<T>>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoad({ state: "loading" });
    read().then(
      (value) => live && setLoad({ state: "ready", value }),
      (e) => live && setLoad({ state: "error", message: errorText(e) }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return [load, useCallback(() => setAttempt((n) => n + 1), [])];
}

function Working() {
  return <div className="org-working" role="status" aria-label="Loading" />;
}

function LoadError({ what, onRetry, message }: { what: string; onRetry: () => void; message: string }) {
  return (
    <div className="org-error">
      <p className="org-muted" title={message}>
        Couldn't load {what}.
      </p>
      <button type="button" className="btn settings-outline org-sm" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly { id: T; label: string }[]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div className="org-tabs-bar">
      <div role="tablist" aria-label={label} className="org-tabs">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={`org-tab${value === t.id ? " on" : ""}`} onClick={() => onChange(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Members (Conductor's `m0a`, rows `h0a`) ----------------------------------

export function OrgMembersPage() {
  const [load, retry] = useReasonRead<Member[]>(loadMembers);
  if (load.state === "loading") return <Working />;
  if (load.state === "error") return <LoadError what="members" message={load.message} onRetry={retry} />;
  if (load.value.length === 0) return <p className="org-muted">No members yet.</p>;
  return (
    <div className="org-list" role="list" aria-label="Members">
      {load.value.map(memberRow).map((m) => (
        <div key={m.id} className="org-member" role="listitem">
          <span className="org-avatar" aria-hidden>
            {m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : m.initials}
          </span>
          <div className="org-member-text">
            <span className="org-member-name">{m.primary}</span>
            {m.secondary && <span className="org-member-email">{m.secondary}</span>}
          </div>
          {m.role && <span className="org-member-role">{m.role}</span>}
        </div>
      ))}
    </div>
  );
}

// ---- MCP (Conductor's Installed / Recommended tabs) ----------------------------

/** A tab panel kept mounted while inactive: `hidden` and `inert` (React 18's types lack `inert`). */
const hiddenPanel = (hidden: boolean): Record<string, unknown> => (hidden ? { hidden: true, inert: "" } : {});

/**
 * Installed: the workspace's MCP servers and the services Reason has connected.
 * Recommended: Reason's catalog of services it connects through MCP that are
 * not connected yet, as Conductor's grid of tiles; a tile opens Reason to
 * connect it. Both panels stay mounted, the inactive one hidden and inert, as
 * Conductor's Base UI tabs keep them.
 */
export function OrgMcpPage() {
  const [tab, setTab] = useState<"installed" | "recommended">("installed");
  const [query, setQuery] = useState("");
  const [recommendedQuery, setRecommendedQuery] = useState("");
  const [load, retry] = useReasonRead(async () => {
    const [servers, services] = await Promise.all([loadMcpServers(), loadMcpServices().catch(() => [] as McpService[])]);
    return { installed: installedMcp(servers, services), catalog: services.filter((s) => s.status === "not_connected") };
  });
  const match = (q: string) => (s: { name: string; description: string }) => !q.trim() || `${s.name} ${s.description}`.toLowerCase().includes(q.trim().toLowerCase());
  const installed = load.state === "ready" ? load.value.installed.filter(match(query)) : [];
  const catalog = load.state === "ready" ? load.value.catalog.filter(match(recommendedQuery)) : [];
  const connect = () => void openUrl(REASON_MCP_URL);
  return (
    <div className="org-mcp">
      <Tabs label="MCP" value={tab} onChange={setTab} tabs={[{ id: "installed", label: "Installed" }, { id: "recommended", label: "Recommended" }]} />
      <div role="tabpanel" className="org-tabpanel" {...hiddenPanel(tab !== "installed")}>
        <div className="org-search-row">
          <label className="org-search">
            <ConductorIcon name="search" size={16} />
            <input type="text" placeholder="Search installed MCPs" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button type="button" className="btn org-primary org-sm" onClick={connect}>
            <ConductorIcon name="plus" size={14} />
            Add MCP server
          </button>
        </div>
        {load.state === "loading" ? (
          <Working />
        ) : load.state === "error" ? (
          <LoadError what="MCP servers" message={load.message} onRetry={retry} />
        ) : installed.length === 0 ? (
          <div className="org-empty">{load.value.installed.length === 0 ? "No MCP servers installed" : "No matching MCP servers"}</div>
        ) : (
          <div className="org-list" role="list" aria-label="Installed MCP servers">
            {installed.map((s) => (
              <div key={s.id} className="org-mcp-row" role="listitem">
                <span className="org-mcp-icon" aria-hidden>
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="org-member-text">
                  <span className="org-member-name">{s.name}</span>
                  {(s.description || s.url) && <span className="org-member-email">{s.description || s.url}</span>}
                </div>
                <span className="org-member-role">{!s.enabled ? "Disabled" : s.connectionState === "needs_attention" || s.connectionState === "needs_reauth" ? "Needs attention" : "Installed"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div role="tabpanel" className="org-tabpanel org-recommended" {...hiddenPanel(tab !== "recommended")}>
        <label className="org-search">
          <ConductorIcon name="search" size={16} />
          <input type="text" placeholder="Search recommended MCPs" value={recommendedQuery} onChange={(e) => setRecommendedQuery(e.target.value)} />
        </label>
        {load.state === "ready" && catalog.length === 0 ? (
          <div className="org-empty">{load.value.catalog.length === 0 ? "Every MCP server Reason offers is installed" : "No matching MCPs"}</div>
        ) : (
          <div className="org-tiles">
            {catalog.map((s) => (
              <button key={s.id} type="button" className="org-tile" aria-label={s.name} title={s.description || undefined} onClick={connect}>
                <span className="org-mcp-icon" aria-hidden>
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="org-tile-name">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Cloud computer (Conductor's `ofa` card and Repositories section) ---------

export function OrgComputerPage() {
  const [load, retry] = useReasonRead<ReasonRepository[]>(loadRepositories);
  const enabled = load.state === "ready" ? load.value.filter((r) => r.enabled) : [];
  return (
    <div className="org-computer">
      <div>
        <button type="button" className="btn org-primary org-sm" onClick={() => void openUrl(REASON_COMPUTERS_DOCS_URL)}>
          About Reason cloud computers
        </button>
      </div>
      <div className="org-card">
        <div className="org-card-row">
          <span className="org-muted">Each cloud workspace gets its own Reason cloud computer when it starts.</span>
        </div>
      </div>
      <div className="org-sep" />
      <section className="org-section">
        <h3>Repositories</h3>
        {load.state === "loading" ? (
          <Working />
        ) : load.state === "error" ? (
          <LoadError what="repositories" message={load.message} onRetry={retry} />
        ) : (
          <>
            <div className="org-select-row">
              <button type="button" className="org-select" onClick={() => void openUrl(REASON_GITHUB_URL)} title="Choose repositories in Reason">
                <span>
                  {enabled.length} {enabled.length === 1 ? "repository" : "repositories"} selected ({load.value.length} available)
                </span>
                <ConductorIcon name="chevron-down" size={16} />
              </button>
              <button type="button" className="org-icon-btn" aria-label="Refresh repositories" onClick={retry}>
                <ConductorIcon name="refresh-cw" size={14} />
              </button>
              {/* Conductor's gear: "Manage GitHub organizations". Reason's GitHub connection decides which repositories it reaches. */}
              <button type="button" className="org-icon-btn" aria-label="Manage GitHub organizations" title="Manage GitHub organizations" onClick={() => void openUrl(REASON_GITHUB_URL)}>
                <ConductorIcon name="settings" size={14} />
              </button>
            </div>
            {enabled.length > 0 && (
              <div className="org-chips">
                {enabled.map((r) => (
                  <span key={r.fullName} className="org-chip">
                    <span className="org-chip-initial" aria-hidden>
                      {r.fullName.split("/")[1]?.slice(0, 1).toUpperCase()}
                    </span>
                    {r.fullName}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ---- Preferences (Conductor's org `prWorkspaceLinkEnabled`) --------------------

export function OrgPreferencesPage() {
  return (
    <div className="settings-rows">
      <Row
        label="Include link to workspace in PR description"
        help="Reason writes the pull requests of cloud workspaces, so this stays off until Reason offers it."
      >
        <Toggle label="Include link to workspace in PR description" checked={false} disabled onChange={() => {}} />
      </Row>
    </div>
  );
}

// ---- Environment (Personal / Shared) -------------------------------------------

/**
 * Personal: this Mac's variables (the `env_vars` table Settings › Environment
 * edits), which reach the agents, terminals and scripts of local workspaces.
 * Add opens that page; Import .env adds a file's `KEY=VALUE` lines.
 */
export function OrgEnvironmentPage({ onNavigate }: { onNavigate: (to: SettingsLocation) => void }) {
  const [tab, setTab] = useState<"personal" | "shared">("personal");
  const [vars, setVars] = useState<StoredVar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    envVarStore.list().then(setVars, (e) => setError(errorText(e)));
  }, []);
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parsePastedVars(await file.text());
    if (!parsed) return setError(`No KEY=VALUE lines in ${file.name}`);
    envVarStore.set(parsed).then(setVars, (e) => setError(errorText(e)));
  };
  return (
    <div>
      <Tabs label="Environment" value={tab} onChange={setTab} tabs={[{ id: "personal", label: "Personal" }, { id: "shared", label: "Shared" }]} />
      <div role="tabpanel" className="org-tabpanel org-env">
        {tab === "personal" ? (
          <>
            <p className="org-muted">Applied to workspaces you create on this Mac, and to their agents, terminals and scripts.</p>
            <div className="org-env-actions">
              <button type="button" className="btn org-primary org-sm" onClick={() => onNavigate({ scope: "user", page: "environment" })}>
                <ConductorIcon name="plus" size={14} />
                Add environment variable
              </button>
              <label className="btn settings-outline org-sm org-file">
                <ConductorIcon name="upload" size={14} />
                Import .env
                <input type="file" className="org-hidden" onChange={(e) => void importFile(e.target.files?.[0])} />
              </label>
            </div>
            {error && (
              <p className="error small" role="alert">
                {error}
              </p>
            )}
            {vars !== null && vars.length === 0 ? (
              <div className="org-env-empty">No variables yet</div>
            ) : (
              vars && (
                <div className="org-list" role="list" aria-label="Environment variables">
                  {vars.map((v) => (
                    <div key={v.key} className="org-env-var" role="listitem">
                      <code>{v.key}</code>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        ) : (
          <>
            <p className="org-muted">Cloud workspaces run on Reason, which keeps your organization's shared variables as Reason secrets.</p>
            <div>
              <button type="button" className="btn settings-outline org-sm" onClick={() => void openUrl(REASON_SECRETS_URL)}>
                Manage secrets in Reason
                <ConductorIcon name="arrow-up-right" size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Prompts (Personal / Shared; Conductor's `b0a` rows) -----------------------

/** Conductor's organization prompt rows, in its order, on OpenConductor's `[prompts]` keys. */
export const ORG_PROMPT_ROWS: { kind: PromptKind; title: string }[] = [
  { kind: "general", title: "General preferences" },
  { kind: "code_review", title: '"Review" button' },
  { kind: "create_pr", title: '"Create PR" button' },
  { kind: "fix_errors", title: '"Fix errors" button' },
  { kind: "resolve_merge_conflicts", title: '"Resolve conflicts" button' },
];

export function OrgPromptsPage({ settings, save }: { settings: Settings; save: (next: Settings) => void }) {
  const [tab, setTab] = useState<"personal" | "shared">("personal");
  return (
    <div>
      <Tabs label="Prompts" value={tab} onChange={setTab} tabs={[{ id: "personal", label: "Personal" }, { id: "shared", label: "Shared" }]} />
      <div role="tabpanel" className="org-tabpanel org-prompts">
        {tab === "personal" ? (
          <>
            <p className="org-muted">Applied to your chats, on this Mac and in the cloud.</p>
            <div className="settings-rows">
              {ORG_PROMPT_ROWS.map((r) => (
                <PromptRow key={r.kind} title={r.title} value={settings.prompts?.[r.kind] ?? ""} onSave={(v) => save({ ...settings, prompts: { ...settings.prompts, [r.kind]: v === "" ? null : v } })} />
              ))}
            </div>
          </>
        ) : (
          <p className="org-muted">Shared prompts would apply to everyone's chats in this organization. Reason has none to offer OpenConductor yet; your personal prompts still apply.</p>
        )}
      </div>
    </div>
  );
}

function PromptRow({ title, value, onSave }: { title: string; value: string; onSave: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="settings-row org-prompt-row" data-settings-row data-open={open || undefined}>
      <button type="button" className="org-prompt-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="settings-row-label">{title}</span>
        <ConductorIcon name={open ? "chevron-up" : "chevron-down"} size={16} />
      </button>
      {open && (
        <textarea
          className="org-prompt-input"
          aria-label={title}
          placeholder={PROMPT_PLACEHOLDER}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onSave(draft)}
        />
      )}
    </div>
  );
}

/** The page for an organization location. */
export function OrgPage({ page, settings, save, onNavigate }: { page: OrgPage; settings: Settings; save: (next: Settings) => void; onNavigate: (to: SettingsLocation) => void }): ReactNode {
  switch (page) {
    case "members":
      return <OrgMembersPage />;
    case "mcp":
      return <OrgMcpPage />;
    case "computer":
      return <OrgComputerPage />;
    case "preferences":
      return <OrgPreferencesPage />;
    case "environment":
      return <OrgEnvironmentPage onNavigate={onNavigate} />;
    case "prompts":
      return <OrgPromptsPage settings={settings} save={save} />;
  }
}
