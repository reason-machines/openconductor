// Settings › Environment rows: `environment_variable_files` (user and
// repository) and `environment_variables.local` / `.cloud` (repository).
// Scripts and terminals of a workspace get these variables
// (evidence/settings/NOTES.md, "Environment"). Repository edits go to
// `.conductor/settings.local.toml`; a shared settings.toml is read-only here,
// as in Conductor.
import { useEffect, useState } from "react";
import "./rows.css";
import { layerLabel, repoSettingsSetLocal, type EffectiveSettings } from "../repoSettings.ts";
import { notifyRepoSettingsChanged, useRepoSettings } from "../useRepoSettings.ts";
import { envFileStatus, envNameError, envRows, parseEnvFiles, type EnvContext } from "./rowModel.ts";

const FILES_TITLE = "Environment variable files";
const FILES_HELP =
  "dotenv files whose variables agents, terminals and scripts get, one path per line. Relative paths resolve against the settings file's folder, then the repository root; ~ is your home folder.";

function EnvFilesRow({ value, onSave, statuses }: { value: string[]; onSave: (files: string[]) => void; statuses?: EffectiveSettings["env"]["files"] }) {
  const [draft, setDraft] = useState(value.join("\n"));
  useEffect(() => setDraft(value.join("\n")), [value.join("\n")]);
  const commit = () => {
    const next = parseEnvFiles(draft);
    if (next.join("\n") !== value.join("\n")) onSave(next);
  };
  return (
    <div className="settings-row settings-row-stacked">
      <div>
        <label className="settings-row-label" htmlFor="env-files">{FILES_TITLE}</label>
        <div className="muted small">{FILES_HELP}</div>
      </div>
      <textarea
        id="env-files"
        className="settings-env-files"
        aria-label={FILES_TITLE}
        placeholder="~/.env"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
      {statuses && statuses.length > 0 && (
        <ul className="muted small" aria-label="Environment files loaded">
          {statuses.map((f) => (
            <li key={`${f.layer}:${f.path}`}>
              <code>{f.path}</code>: {envFileStatus(f.loaded)} ({layerLabel(f.layer)})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Mount on the repository Environment page (`/settings/repos/$repoId/environment`). */
export function RepoEnvironmentRows({ repoPath }: { repoPath: string }) {
  const effective = useRepoSettings(repoPath);
  const [error, setError] = useState<string | null>(null);
  const write = (key: Parameters<typeof repoSettingsSetLocal>[1], value: unknown) => {
    setError(null);
    repoSettingsSetLocal(repoPath, key, value).then(notifyRepoSettingsChanged, (e) => setError(String(e)));
  };
  if (!effective) return <p className="muted">Loading…</p>;
  const files = effective.environmentVariableFiles;
  const repoFiles = effective.env.files.filter((f) => f.layer !== "user" && f.layer !== "managed");
  return (
    <>
      <div className="settings-rows">
        <EnvFilesRow
          value={files && files.layer !== "user" ? files.value : []}
          statuses={repoFiles}
          onSave={(next) => write("environment_variable_files", next.length ? next : null)}
        />
        <EnvVariablesRow effective={effective} write={write} />
      </div>
      {effective.warnings.length > 0 && (
        <ul className="muted small" aria-label="Settings warnings">
          {effective.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {error && <p className="error small" role="alert">{error}</p>}
    </>
  );
}

function EnvVariablesRow({ effective, write }: { effective: EffectiveSettings; write: (key: `environment_variables.${string}`, value: unknown) => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [context, setContext] = useState<EnvContext>("local");
  const [shown, setShown] = useState<Set<string>>(new Set());
  const nameError = name ? envNameError(name) : null;
  const rows = envRows(effective);
  const add = () => {
    if (envNameError(name) !== null) return;
    write(`environment_variables.${context}.${name.trim()}`, value);
    setName("");
    setValue("");
  };
  const toggle = (id: string) => setShown((s) => new Set(s.has(id) ? [...s].filter((x) => x !== id) : [...s, id]));
  return (
    <div className="settings-row settings-row-stacked">
      <div>
        <div className="settings-row-label">Environment variables</div>
        <div className="muted small">
          Variables for local workspaces and for cloud workspaces of this repository. Use an empty value to set a variable to an empty string.
        </div>
      </div>
      {rows.length > 0 ? (
        <table className="settings-env-table" aria-label="Environment variables">
          <thead>
            <tr>
              <th>Name</th>
              <th>Context</th>
              <th>Value</th>
              <th>From</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = `${r.context}:${r.name}`;
              return (
                <tr key={id}>
                  <td><code>{r.name}</code></td>
                  <td>{r.context === "local" ? "Local" : "Cloud"}</td>
                  <td>
                    <button type="button" className="link small" onClick={() => toggle(id)} aria-label={`${shown.has(id) ? "Hide" : "Show"} ${r.name}`}>
                      {shown.has(id) ? <code>{r.value === "" ? '""' : r.value}</code> : "••••••"}
                    </button>
                  </td>
                  <td className="muted">{r.envFile ? <code>{r.envFile}</code> : layerLabel(r.layer)}</td>
                  <td>
                    {r.removable && (
                      <button type="button" className="link small" onClick={() => write(`environment_variables.${r.context}.${r.name}`, null)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="muted small">No variables yet.</p>
      )}
      <div className="settings-env-form">
        <input aria-label="Variable name" placeholder="MY_VARIABLE" value={name} aria-invalid={nameError !== null} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Variable value" placeholder="Value" type="password" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} />
        <select aria-label="Variable context" value={context} onChange={(e) => setContext(e.target.value as EnvContext)}>
          <option value="local">Local</option>
          <option value="cloud">Cloud</option>
        </select>
        <button type="button" onClick={add} disabled={name.trim() === "" || nameError !== null}>
          Add variable
        </button>
        {nameError && <span className="error small">{nameError}</span>}
      </div>
    </div>
  );
}
