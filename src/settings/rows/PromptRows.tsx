// Repository Settings › Actions: custom instructions per action (`[prompts]`).
// Conductor edits them per repository; saving writes the trimmed text to the
// repository's `.conductor/settings.local.toml` (blank removes it).
import { useEffect, useState } from "react";
import "./rows.css";
import { layerLabel, repoSettingsSetLocal, type EffectiveSettings } from "../repoSettings.ts";
import { notifyRepoSettingsChanged, useRepoSettings } from "../useRepoSettings.ts";
import { PROMPT_PLACEHOLDER, PROMPT_ROWS, promptWrite, type PromptRowSpec } from "./rowModel.ts";

/** Mount on the repository Actions page (`/settings/repos/$repoId/actions`). */
export function RepoActionsRows({ repoPath }: { repoPath: string }) {
  const effective = useRepoSettings(repoPath);
  return (
    <div className="settings-rows" aria-label="Action preferences">
      {PROMPT_ROWS.map((spec) => (
        <PromptRow key={spec.kind} spec={spec} repoPath={repoPath} effective={effective} />
      ))}
    </div>
  );
}

function PromptRow({ spec, repoPath, effective }: { spec: PromptRowSpec; repoPath: string; effective: EffectiveSettings | null }) {
  const current = effective?.prompts[spec.kind] ?? null;
  const [draft, setDraft] = useState(current?.value ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(current?.value ?? ""), [current?.value]);

  const commit = () => {
    const write = promptWrite(spec.kind, current?.value, draft);
    if (!write) return;
    setError(null);
    repoSettingsSetLocal(repoPath, write.key, write.value).then(notifyRepoSettingsChanged, () => setError("Failed to save custom prompt"));
  };

  const id = `prompt-${spec.kind}`;
  return (
    <div className="settings-row settings-row-stacked">
      <div>
        <label className="settings-row-label" htmlFor={id}>
          {spec.title}
          {current && <span className="settings-badge">Customized</span>}
        </label>
        <div className="muted small">{spec.description}</div>
        {current && current.layer !== "repo_local" && <div className="muted small">From {layerLabel(current.layer)}; saving here overrides it for this repository.</div>}
      </div>
      <textarea
        id={id}
        aria-label={`${spec.title} prompt`}
        placeholder={spec.placeholder ?? PROMPT_PLACEHOLDER}
        value={draft}
        disabled={effective === null}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
      {error && <p className="error small" role="alert">{error}</p>}
    </div>
  );
}
