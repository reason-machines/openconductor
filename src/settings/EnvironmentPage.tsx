import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import { Modal } from "../components/Dialogs";
import { errorText } from "./api";
import { CloseIcon, FolderIcon, PlusIcon } from "./icons";
import type { Settings } from "./types";

/** Conductor's `R$i`: variables its environment panel documents. */
const DOCUMENTED: { name: string; description: string }[] = [
  { name: "HTTP_PROXY", description: "Routes HTTP requests through a proxy." },
  { name: "HTTPS_PROXY", description: "Routes HTTPS requests through a proxy." },
  { name: "NO_PROXY", description: "Skips the proxy for matching hosts and domains." },
  { name: "ANTHROPIC_API_KEY", description: "Authenticates Claude Code with the Anthropic API." },
  { name: "ANTHROPIC_BASE_URL", description: "Overrides the Anthropic API base URL." },
  { name: "ANTHROPIC_AUTH_TOKEN", description: "Sets the Anthropic auth token used by Claude Code." },
  { name: "CLAUDE_CODE_USE_BEDROCK", description: "Switches Claude Code to Amazon Bedrock credentials." },
  { name: "AWS_REGION", description: "Selects the AWS region for Bedrock requests." },
  { name: "AWS_PROFILE", description: "Uses a named AWS profile for Bedrock credentials." },
  { name: "CLAUDE_CODE_USE_VERTEX", description: "Switches Claude Code to Vertex AI credentials." },
  { name: "ANTHROPIC_VERTEX_PROJECT_ID", description: "Selects the GCP project for Vertex AI requests." },
  { name: "GOOGLE_APPLICATION_CREDENTIALS", description: "Points Claude Code at a Google service account file for Vertex AI." },
  { name: "CODEX_API_KEY", description: "Authenticates Codex with an API key instead of the local CLI login." },
  { name: "CURSOR_API_KEY", description: "Authenticates Cursor with a Cursor API key." },
  { name: "OPENAI_BASE_URL", description: "Overrides the base URL used for Codex API requests." },
  { name: "AI_GATEWAY_API_KEY", description: "Authenticates Codex with the Vercel AI Gateway." },
  { name: "OPENAI_ORG", description: "Associates Codex API requests with an OpenAI organization." },
  { name: "OPENAI_PROJECT", description: "Associates Codex API requests with an OpenAI project." },
];

export interface StoredVar {
  key: string;
  value: string;
}

const PREVIEW_KEY = "openconductor.envVars.preview";

/** The `env_vars` table (scope `shared`, context `local`); localStorage in the browser preview. */
const store = {
  list: async (): Promise<StoredVar[]> =>
    inTauri() ? invoke<StoredVar[]>("env_vars_list") : (JSON.parse(localStorage.getItem(PREVIEW_KEY) ?? "[]") as StoredVar[]),
  set: async (entries: StoredVar[]): Promise<StoredVar[]> => {
    if (inTauri()) return invoke<StoredVar[]>("env_vars_set", { entries });
    const next = [...(await store.list()).filter((v) => !entries.some((e) => e.key === v.key)), ...entries];
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(next));
    return next;
  },
  remove: async (key: string): Promise<StoredVar[]> => {
    if (inTauri()) return invoke<StoredVar[]>("env_vars_delete", { key });
    const next = (await store.list()).filter((v) => v.key !== key);
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(next));
    return next;
  },
};

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `KEY=VALUE` lines pasted into the name field (Conductor adds several at once); null when it is not such a block. */
export function parsePastedVars(text: string): StoredVar[] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
  if (lines.length === 0 || !lines.every((l) => /^(export\s+)?[A-Za-z_][A-Za-z0-9_]*=/.test(l))) return null;
  return lines.map((l) => {
    const body = l.replace(/^export\s+/, "");
    const i = body.indexOf("=");
    let value = body.slice(i + 1);
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
    return { key: body.slice(0, i), value };
  });
}

/**
 * Settings › Agents & environment › Environment (`/settings/user/environment`),
 * as Conductor 0.87.6's environment panel (`zda`, renderApp-D_fmY7hW.js) for a
 * local user: the "Environment" header with "Add environment variable", the
 * variables table ("No variables set" when empty, "Show documented variables
 * (18)"), then "Env files". Variables are stored in conductor.db's `env_vars`
 * and reach terminals and scripts through the backend's `local_env`.
 */
export function EnvironmentPage({ settings, save }: { settings: Settings; save: (next: Settings) => void }) {
  const [vars, setVars] = useState<StoredVar[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [showDocumented, setShowDocumented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    store.list().then(setVars, (e) => setError(errorText(e)));
  }, []);
  const run = (p: Promise<StoredVar[]>) => p.then(setVars, (e) => setError(errorText(e)));
  const documented = DOCUMENTED.filter((d) => !vars?.some((v) => v.key === d.name));

  return (
    <>
      <header className="settings-header">
        <div>
          <h1>Environment</h1>
          <p>Configure environment variables used by OpenConductor and passed to agents.</p>
        </div>
        <button type="button" className="btn settings-primary" onClick={() => setAdding(true)}>
          <PlusIcon size={14} />
          Add environment variable
        </button>
      </header>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      <div className="settings-env-section">
        <div className="settings-env-table" role="table" aria-label="Environment variables">
          {vars !== null && vars.length === 0 && !showDocumented && (
            <div className="settings-env-empty">
              <div className="settings-env-empty-title">No variables set</div>
              <div className="settings-row-help">Add a variable to make it available in this environment.</div>
            </div>
          )}
          {vars?.map((v) => (
            <div className="settings-env-var" role="row" key={v.key}>
              <code role="cell">{v.key}</code>
              <code role="cell" className="settings-env-value">
                {v.value}
              </code>
              <button type="button" className="settings-field-icon settings-env-remove" aria-label={`Delete ${v.key}`} onClick={() => run(store.remove(v.key))}>
                <CloseIcon />
              </button>
            </div>
          ))}
          {showDocumented &&
            documented.map((d) => (
              <div className="settings-env-var documented" role="row" key={d.name}>
                <code role="cell">{d.name}</code>
                <span role="cell" className="settings-row-help">
                  {d.description}
                </span>
                <span />
              </div>
            ))}
        </div>
        {documented.length > 0 && (
          <button type="button" className="settings-link" onClick={() => setShowDocumented((s) => !s)}>
            {showDocumented ? "Hide documented variables" : `Show documented variables (${documented.length})`}
          </button>
        )}
      </div>
      <EnvFiles settings={settings} save={save} />
      {adding && (
        <AddVariableDialog
          existing={vars ?? []}
          onCancel={() => setAdding(false)}
          onAdd={(entries) =>
            store.set(entries).then(
              (next) => {
                setVars(next);
                setAdding(false);
              },
              (e) => setError(errorText(e)),
            )
          }
        />
      )}
    </>
  );
}

function CloseIconSmall() {
  return <CloseIcon size={14} />;
}

/** One file from the native picker (tauri-plugin-dialog); null outside the desktop app. */
async function pickFile(title: string): Promise<string | null> {
  if (!inTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: false, multiple: false, title });
  return typeof picked === "string" ? picked : null;
}

/** Variables in each env file, from the backend (`env_files_loaded`); nothing in the browser preview. */
function useEnvFileCounts(files: string[]): (Map<string, number | null>) {
  const [counts, setCounts] = useState(new Map<string, number | null>());
  const key = files.join("\n");
  useEffect(() => {
    if (!inTauri() || files.length === 0) return;
    let live = true;
    invoke<(number | null)[]>("env_files_loaded", { files }).then(
      (n) => live && setCounts(new Map(files.map((f, i) => [f, n[i] ?? null]))),
      () => undefined,
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return counts;
}

/** Conductor's "Env files" block (`gda`): each file with its variable count, remove, and "Add env file". */
function EnvFiles({ settings, save }: { settings: Settings; save: (next: Settings) => void }) {
  const files = settings.environment_variable_files ?? [];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const counts = useEnvFileCounts(files);
  const count = (f: string) => counts.get(f);
  const write = (next: string[]) => save({ ...settings, environment_variable_files: next });
  const commit = () => {
    const path = draft.trim();
    if (path === "") return;
    if (!files.includes(path)) write([...files, path]);
    setDraft("");
    setAdding(false);
  };
  const browse = async () => {
    const picked = await pickFile("Select env file");
    if (picked) {
      setDraft(picked);
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
          {files.map((f) => {
            const n = count(f);
            return (
              <div className="settings-env-file" key={f}>
                <code>{f}</code>
                <span className="settings-row-detail">{n === undefined ? "" : n === null ? "Not found" : `${n} variable${n === 1 ? "" : "s"}`}</span>
                <button type="button" className="settings-field-icon settings-env-remove" aria-label={`Remove ${f}`} onClick={() => write(files.filter((x) => x !== f))}>
                  <CloseIconSmall />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {adding ? (
        <div className="settings-field-wrap">
          <input
            className="settings-field mono"
            aria-label="Env file path"
            placeholder="~/.env"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
          />
          <button type="button" className="settings-field-icon" aria-label="Browse for an env file" onClick={() => void browse()}>
            <FolderIcon size={14} />
          </button>
        </div>
      ) : (
        <button type="button" className="btn settings-outline settings-env-add-file" onClick={() => setAdding(true)}>
          <PlusIcon size={14} />
          Add env file
        </button>
      )}
    </div>
  );
}

function AddVariableDialog({ existing, onCancel, onAdd }: { existing: StoredVar[]; onCancel: () => void; onAdd: (entries: StoredVar[]) => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pasted = parsePastedVars(name);
  const submit = () => {
    const entries = pasted ?? [{ key: name.trim(), value }];
    const bad = entries.find((e) => !NAME.test(e.key));
    if (bad) return setError(bad.key === "" ? "Enter a variable name" : `${bad.key} is not a valid variable name`);
    if (!pasted && existing.some((v) => v.key === entries[0].key)) return setError(`${entries[0].key} is already set`);
    onAdd(entries);
  };
  return (
    <Modal title={pasted ? "Add environment variables" : "Add environment variable"} onClose={onCancel}>
      <div className="modal-body settings-env-dialog">
        <p className="settings-row-help">{pasted ? `Detected ${pasted.length} variables from your pasted text.` : "Paste a block of KEY=VALUE lines into the name field to add several at once."}</p>
        <label className="settings-env-dialog-field">
          <span>Name</span>
          <textarea
            className="settings-field mono"
            rows={pasted ? Math.min(8, name.split("\n").length) : 1}
            aria-label="Name"
            placeholder="API_KEY"
            autoFocus
            spellCheck={false}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </label>
        {!pasted && (
          <label className="settings-env-dialog-field">
            <span>Value</span>
            <input className="settings-field mono" aria-label="Value" spellCheck={false} autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </label>
        )}
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} data-primary-action>
            Add
          </button>
        </div>
      </div>
    </Modal>
  );
}
