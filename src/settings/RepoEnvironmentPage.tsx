// Settings › <repository> › Environment (`/settings/repos/$repoId/environment`),
// row for row with Conductor 0.87.6's environment panel for a repository
// (`zda` with settings target `{scope:"workspace-template", locality:"local"}`,
// renderApp-D_fmY7hW.js): the "Environment" header with "Add environment
// variable", this repository's variables (or "No variables set") with "Show
// documented variables (18)", "Inherited from Repo shared", "Inherited from
// User", then "Env files".
//
// Values are written where Conductor writes them: `environment_variables` and
// `environment_variable_files` in the repository's
// `.conductor/settings.local.toml` (`YBe` / `s$e`; deleting writes "<none>",
// `QBe`). Agents, terminals and scripts of the repository's workspaces get
// them through `local_env`. Shared settings stay read-only, as in Conductor.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import type { Repo } from "../state/types";
import { errorText } from "./api";
import { CloseIcon, FolderIcon, KeyIcon, PlusIcon } from "./icons";
import {
  addError,
  currentRows,
  editError,
  effectiveEntries,
  envFileCounts,
  inheritedRows,
  levelLabel,
  loadedLabel,
  managedNameWarning,
  parsePasted,
  repoEnvFilePath,
  repoEnvSections,
  repoVarKey,
  userScopeEntries,
  UNSET_VALUE,
  type EnvRow,
  type StoredVar,
} from "./repoEnvModel.ts";
import { repoSettingsSetLocal, type EffectiveSettings } from "./repoSettings.ts";
import { notifyRepoSettingsChanged, useRepoSettings } from "./useRepoSettings.ts";

const EMPTY_ENV: EffectiveSettings["env"] = { local: {}, cloud: {}, files: [] };

function useStoredVars(): StoredVar[] {
  const [vars, setVars] = useState<StoredVar[]>([]);
  useEffect(() => {
    if (inTauri()) invoke<StoredVar[]>("env_vars_list").then(setVars, () => setVars([]));
  }, []);
  return vars;
}

export function RepoEnvironmentPage({ repo }: { repo: Repo }) {
  const effective = useRepoSettings(repo.path || undefined);
  const stored = useStoredVars();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const env = effective?.env ?? EMPTY_ENV;
  const sections = repoEnvSections(effectiveEntries(env, stored), userScopeEntries(env, stored));
  const { setEntries, documentedEntries } = currentRows(sections.current);
  const editable = Boolean(repo.path) && inTauri();

  const write = async (key: Parameters<typeof repoSettingsSetLocal>[1], value: unknown) => {
    if (!repo.path) return;
    setError(null);
    try {
      await repoSettingsSetLocal(repo.path, key, value);
      notifyRepoSettingsChanged();
    } catch (e) {
      setError(errorText(e));
      throw e;
    }
  };
  const save = async ({ name, value, previousName }: { name: string; value: string; previousName?: string }) => {
    if (previousName && previousName !== name) await write(repoVarKey(previousName), UNSET_VALUE);
    await write(repoVarKey(name), value);
  };

  return (
    <>
      <header className="settings-header">
        <div>
          <h1>Environment</h1>
          <p>Configure environment variables used by OpenConductor and passed to agents.</p>
        </div>
        <button type="button" className="btn settings-primary" onClick={() => setAdding(true)} disabled={!editable}>
          <PlusIcon size={14} />
          Add environment variable
        </button>
      </header>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      <div className="settings-env-sections">
        <VariablesTable
          ariaLabel="Environment variables"
          scopeLabel="shared"
          setEntries={setEntries}
          documentedEntries={documentedEntries}
          onSave={save}
          onDelete={(name) => void write(repoVarKey(name), UNSET_VALUE).catch(() => undefined)}
        />
        {sections.repoShared.length > 0 && <VariablesTable title="Inherited from Repo shared" scopeLabel="inherited" setEntries={inheritedRows(sections.repoShared)} />}
        {sections.user.length > 0 && <VariablesTable title="Inherited from User" scopeLabel="inherited" setEntries={inheritedRows(sections.user, sections.dimmedUserKeys)} />}
      </div>
      <RepoEnvFiles repo={repo} effective={effective} disabled={!editable} write={write} />
      {adding && <AddVariablesSheet existing={new Set(sections.current.map((e) => e.key))} onClose={() => setAdding(false)} onAdd={(entries) => Promise.all(entries.map((e) => write(repoVarKey(e.key), e.value)))} />}
    </>
  );
}

/** Conductor's `T$i`: a variables table with its documented toggle and edit sheet. */
function VariablesTable({
  title,
  ariaLabel,
  scopeLabel,
  setEntries,
  documentedEntries = [],
  onSave,
  onDelete,
}: {
  title?: string;
  ariaLabel?: string;
  scopeLabel: string;
  setEntries: EnvRow[];
  documentedEntries?: EnvRow[];
  onSave?: (e: { name: string; value: string; previousName?: string }) => Promise<void>;
  onDelete?: (name: string) => void;
}) {
  const [showDocumented, setShowDocumented] = useState(false);
  const [editing, setEditing] = useState<EnvRow | null>(null);
  const empty = setEntries.length === 0 && (!showDocumented || documentedEntries.length === 0);
  const all = [...setEntries, ...documentedEntries];
  return (
    <section className="settings-env-section">
      {title && <h3 className="settings-env-section-title">{title}</h3>}
      <div className="settings-env-table" role="table" aria-label={ariaLabel ?? title}>
        {empty && (
          <div className="settings-env-empty">
            <div className="settings-env-empty-title">No variables set</div>
            <div className="settings-row-help">Add a variable to make it available in this environment.</div>
          </div>
        )}
        {setEntries.map((r) => (
          <VariableRow key={r.name} row={r} disabled={editing !== null} onEdit={() => setEditing(r)} onDelete={() => onDelete?.(r.name)} />
        ))}
        {showDocumented && documentedEntries.map((r) => <VariableRow key={r.name} row={r} unsetDocumented disabled={editing !== null} onEdit={() => setEditing(r)} />)}
      </div>
      {documentedEntries.length > 0 && (
        <button type="button" className="settings-link" onClick={() => setShowDocumented((s) => !s)}>
          {showDocumented ? "Hide documented variables" : `Show documented variables (${documentedEntries.length})`}
        </button>
      )}
      {editing && (
        <EditVariableSheet
          row={editing}
          isNew={!setEntries.some((r) => r.name === editing.name)}
          scopeLabel={scopeLabel}
          existing={all.map((r) => r.name)}
          onClose={() => setEditing(null)}
          onSave={async (e) => {
            await onSave?.(e);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

const MASK = "••••••••";

/** Conductor's `FZn`. */
function VariableRow({ row, unsetDocumented = false, disabled, onEdit, onDelete }: { row: EnvRow; unsetDocumented?: boolean; disabled: boolean; onEdit: () => void; onDelete?: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const hasValue = !unsetDocumented && row.value !== undefined;
  const fromOther = row.level !== undefined && row.level !== "repo-local" && row.level !== "managed" && !row.envFile;
  return (
    <div className={`settings-env-var${row.dimmed ? " dimmed" : ""}${unsetDocumented ? " documented" : ""}`} role="row">
      <div role="cell" className="settings-env-name-cell">
        <span className="settings-env-source-icon" title={row.envFile ? `Loaded from ${row.envFile}` : row.level === "managed" ? `Set in ${row.origin ?? "managed settings"}` : "Saved by OpenConductor"}>
          {row.envFile ? <FileIcon /> : <KeyIcon size={14} />}
        </span>
        <div className="settings-env-name-text">
          <code>{row.name}</code>
          {row.description && <div className="settings-env-detail">{row.description}</div>}
          {fromOther && row.level && <div className="settings-env-detail">From {levelLabel(row.level)}</div>}
        </div>
      </div>
      <div role="cell" className="settings-env-value-cell">
        {hasValue ? (
          <>
            <button type="button" className="settings-field-icon settings-env-icon" aria-label={revealed ? `Hide ${row.name}` : `Reveal ${row.name}`} onClick={() => setRevealed((r) => !r)}>
              <EyeIcon off={revealed} />
            </button>
            <button type="button" className="settings-env-value" title={revealed ? row.value : undefined} onClick={() => void navigator.clipboard?.writeText(row.value ?? "").catch(() => undefined)}>
              {revealed ? row.value : MASK}
            </button>
          </>
        ) : (
          <span className="settings-env-not-set">Not set</span>
        )}
      </div>
      <div role="cell" className="settings-env-actions">
        {unsetDocumented ? (
          <button type="button" className="settings-field-icon settings-env-icon" aria-label={`Set ${row.name}`} disabled={disabled} onClick={onEdit}>
            <PlusIcon size={16} />
          </button>
        ) : (
          row.canEdit && (
            <button type="button" className="settings-field-icon settings-env-icon" aria-label={`Edit ${row.name}`} disabled={disabled} onClick={onEdit}>
              <PencilIcon />
            </button>
          )
        )}
        {row.canDelete && !unsetDocumented && (
          <button type="button" className="settings-field-icon settings-env-icon" aria-label={`Delete ${row.name}`} disabled={disabled} onClick={onDelete}>
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  );
}

/** A right-hand sheet like Conductor's (`Bet side="right"`, 520px). */
function Sheet({ title, description, onClose, children, footer }: { title: string; description: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="settings-sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-sheet" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <button type="button" className="settings-field-icon settings-sheet-close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
        <div className="settings-sheet-body">
          <div className="settings-sheet-head">
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          {children}
        </div>
        <div className="settings-sheet-footer">{footer}</div>
      </div>
    </div>
  );
}

const primaryKey = (e: React.KeyboardEvent, run: () => void) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    run();
  }
};

/** Conductor's `vda`: New / Edit / View <scope> variable. */
function EditVariableSheet({
  row,
  isNew,
  scopeLabel,
  existing,
  onClose,
  onSave,
}: {
  row: EnvRow;
  isNew: boolean;
  scopeLabel: string;
  existing: string[];
  onClose: () => void;
  onSave: (e: { name: string; value: string; previousName?: string }) => Promise<void>;
}) {
  const readOnly = !isNew && !row.canEdit;
  const [name, setName] = useState(row.name);
  const [value, setValue] = useState(row.value ?? "");
  const [error, setError] = useState<string | null>(null);
  const title = row.name === "" ? `New ${scopeLabel} variable` : readOnly ? `View ${scopeLabel} variable` : `Edit ${scopeLabel} variable`;
  const submit = () => {
    if (readOnly) return;
    // Documented variables keep their name (`canRename: false` in `zZn` and `Oda`).
    const finalName = row.description === undefined ? name.trim() : row.name;
    const err = editError(finalName, row.name, existing);
    if (err) return setError(err);
    onSave({ name: finalName, value, previousName: isNew ? undefined : row.name }).catch((e) => setError(errorText(e)));
  };
  return (
    <Sheet
      title={title}
      description={row.description ?? "Variable names may only contain letters, numbers, and underscores."}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn settings-ghost" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button type="button" className="btn settings-primary" data-primary-action onClick={submit}>
              Save <span className="settings-kbd" aria-hidden="true">⌘↵</span>
            </button>
          )}
        </>
      }
    >
      <div className="settings-sheet-fields" onKeyDown={(e) => primaryKey(e, submit)}>
        <label className="settings-env-dialog-field">
          <span>Name</span>
          <input className="settings-field mono" value={name} placeholder="MY_VARIABLE" disabled={!readOnly && row.description !== undefined} readOnly={readOnly} autoFocus autoComplete="new-password" spellCheck={false} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="settings-env-dialog-field">
          <span>Value</span>
          <textarea
            className="settings-field mono settings-sheet-value"
            value={value}
            placeholder="Use an empty value to set this variable to an empty string."
            readOnly={readOnly}
            autoComplete="new-password"
            spellCheck={false}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {error && <p className="error small">{error}</p>}
      </div>
    </Sheet>
  );
}

/** Conductor's `Fda` for a repository (no cloud context): one name and value, or a pasted block. */
function AddVariablesSheet({ existing, onClose, onAdd }: { existing: Set<string>; onClose: () => void; onAdd: (entries: StoredVar[]) => Promise<unknown> }) {
  const [draft, setDraft] = useState({ name: "", value: "" });
  const [pasted, setPasted] = useState<StoredVar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entries = pasted ?? [{ key: draft.name.trim(), value: draft.value }];
  const warning = entries.map((e) => managedNameWarning(e.key)).find((w) => w !== null) ?? null;
  const submit = () => {
    if (warning) return;
    const err = addError(entries, existing);
    if (err) return setError(err);
    onAdd(entries).then(onClose, () => setError(entries.length === 1 ? "Failed to add environment variable" : "Failed to add environment variables"));
  };
  return (
    <Sheet
      title={pasted ? "Add environment variables" : "Add environment variable"}
      description={pasted ? `Detected ${pasted.length} variables from your pasted text.` : "Paste a block of KEY=VALUE lines into the name field to add several at once."}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn settings-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn settings-primary" data-primary-action disabled={warning !== null} onClick={submit}>
            Save <span className="settings-kbd" aria-hidden="true">⌘↵</span>
          </button>
        </>
      }
    >
      <div className="settings-sheet-fields" onKeyDown={(e) => primaryKey(e, submit)}>
        {pasted ? (
          <div className="settings-env-dialog-field">
            <div className="settings-sheet-row">
              <span>Variables</span>
              <button type="button" className="btn settings-ghost" onClick={() => (setPasted(null), setError(null))}>
                Clear
              </button>
            </div>
            <div className="settings-env-pasted">
              {pasted.map((e) => (
                <div key={e.key}>
                  <code>{e.key}</code>
                  <code className="muted">{e.value}</code>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <label className="settings-env-dialog-field">
              <span>Name</span>
              <input
                className="settings-field mono"
                value={draft.name}
                placeholder="MY_VARIABLE"
                autoFocus
                autoComplete="new-password"
                spellCheck={false}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onPaste={(e) => {
                  const found = parsePasted(e.clipboardData.getData("text"));
                  if (found.length === 0) return;
                  e.preventDefault();
                  setError(null);
                  if (found.length === 1) setDraft({ name: found[0].key, value: found[0].value });
                  else {
                    setDraft({ name: "", value: "" });
                    setPasted(found);
                  }
                }}
              />
            </label>
            <label className="settings-env-dialog-field">
              <span>Value</span>
              <textarea className="settings-field mono settings-sheet-value" value={draft.value} autoComplete="new-password" spellCheck={false} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
            </label>
          </>
        )}
        {warning ? <p className="settings-env-warning">{warning}</p> : error ? <p className="error small">{error}</p> : null}
      </div>
    </Sheet>
  );
}

/** Conductor's `gda` for a repository: `environment_variable_files` in settings.local.toml. */
function RepoEnvFiles({ repo, effective, disabled, write }: { repo: Repo; effective: EffectiveSettings | null; disabled: boolean; write: (key: "environment_variable_files", value: unknown) => Promise<void> }) {
  const files = effective?.environmentVariableFiles?.value ?? [];
  const counts = effective ? envFileCounts(effective.env) : new Map<string, number>();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const set = (next: string[]) => write("environment_variable_files", next.length ? next.join("\n") : null).catch(() => undefined);
  const resolve = async (raw: string) => {
    const { homeDir } = await import("@tauri-apps/api/path");
    return repoEnvFilePath(raw, repo.path, await homeDir().catch(() => ""));
  };
  const commit = async () => {
    const path = await resolve(draft);
    if (path.length === 0) return;
    if (!files.includes(path)) await set([...files, path]);
    setDraft("");
    setAdding(false);
  };
  const browse = async () => {
    if (disabled) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: false, multiple: false, title: "Select env file" });
    if (typeof picked === "string") {
      setDraft(await resolve(picked));
      setAdding(true);
    }
  };
  return (
    <div className="settings-env-files-section">
      <div className="settings-env-files-head">
        <div>
          <div className="settings-row-label">Env files</div>
          <div className="settings-row-help">
            Load environment variables from env files. In the native file picker, press <strong>Cmd+Shift+.</strong> to show hidden files.
          </div>
        </div>
      </div>
      {files.length > 0 && (
        <div className="settings-env-file-list">
          {files.map((f) => (
            <div className="settings-env-file" key={f}>
              <code title={f}>{f.split("/").filter(Boolean).pop() ?? f}</code>
              <span className="settings-row-detail">{loadedLabel(counts.get(f) ?? 0)}</span>
              <button type="button" className="settings-field-icon settings-env-remove" aria-label={`Remove ${f}`} disabled={disabled} onClick={() => void set(files.filter((x) => x !== f))}>
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
      {adding ? (
        <div className="settings-env-file-add">
          <div className="settings-field-wrap">
            <input
              className="settings-field mono"
              aria-label="Env file path"
              placeholder=".env"
              autoFocus
              spellCheck={false}
              autoComplete="off"
              disabled={disabled}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commit();
                }
                if (e.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
            />
            <button type="button" className="settings-field-icon" title="Browse for env file. Press Cmd+Shift+. to show hidden files." disabled={disabled} onClick={() => void browse()}>
              <FolderIcon size={14} />
            </button>
          </div>
          <button type="button" className="btn settings-primary" disabled={disabled || draft.trim() === ""} onClick={() => void commit()}>
            Add
          </button>
          <button type="button" className="settings-field-icon settings-env-remove" aria-label="Cancel adding env file" onClick={() => (setDraft(""), setAdding(false))}>
            <CloseIcon size={16} />
          </button>
        </div>
      ) : (
        <button type="button" className="btn settings-outline settings-env-add-file" disabled={disabled} onClick={() => setAdding(true)}>
          <PlusIcon size={14} />
          Add env file
        </button>
      )}
    </div>
  );
}

const svg = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const EyeIcon = ({ off }: { off: boolean }) => (
  <svg {...svg}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);
const PencilIcon = () => (
  <svg {...svg}>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const TrashIcon = () => (
  <svg {...svg}>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
);
const FileIcon = () => (
  <svg {...svg} width={14} height={14}>
    <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
    <path d="M14 3v5h5" />
  </svg>
);
