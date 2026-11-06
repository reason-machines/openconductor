// Settings › Repository › Actions: custom instructions per action (`[prompts]`),
// row for row with Conductor 0.87.6 (renderApp-D_fmY7hW.js registry `Q3a`, each
// row `yzi` → `xzi` → the collapsible row `vho`, read with REA as untrusted data):
//  - a full-width trigger with the title (font-medium), a "Customized" badge when
//    the setting has a value, the description, and a chevron that turns 180° over
//    150 ms;
//  - open: `pt-3`, a 120 px mono textarea (text-xs, px-3 py-2, `!border-input`)
//    with Conductor's placeholder, saved 2 s after typing and on blur, trimmed
//    (`fGt`; a blank value removes the key).
// Saving writes the repository's `.conductor/settings.local.toml`.
import { useCallback, useEffect, useRef, useState } from "react";
import "./rows.css";
import { layerLabel, repoSettingsSetLocal, type EffectiveSettings } from "../repoSettings.ts";
import { notifyRepoSettingsChanged, useRepoSettings } from "../useRepoSettings.ts";
import { PROMPT_PLACEHOLDER, PROMPT_ROWS, promptWrite, type PromptRowSpec } from "./rowModel.ts";

/** Conductor's `x0a`: edits save 2 s after the last keystroke. */
const SAVE_DEBOUNCE_MS = 2000;

/** The prompt rows of the repository Actions page (`/settings/repos/$repoId/actions`). */
export function RepoActionsRows({ repoPath }: { repoPath: string }) {
  const effective = useRepoSettings(repoPath);
  return (
    <>
      {PROMPT_ROWS.map((spec) => (
        <PromptRow key={spec.kind} spec={spec} repoPath={repoPath} effective={effective} />
      ))}
    </>
  );
}

function PromptRow({ spec, repoPath, effective }: { spec: PromptRowSpec; repoPath: string; effective: EffectiveSettings | null }) {
  const current = effective?.prompts[spec.kind] ?? null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current?.value ?? "");
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(current?.value);
  const focused = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    saved.current = current?.value;
    if (!focused.current) setDraft(current?.value ?? "");
  }, [current?.value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = useCallback(
    (text: string) => {
      window.clearTimeout(timer.current);
      const write = promptWrite(spec.kind, saved.current, text);
      if (!write) return;
      saved.current = write.value ?? undefined;
      setError(null);
      repoSettingsSetLocal(repoPath, write.key, write.value).then(notifyRepoSettingsChanged, () => setError("Failed to save custom prompt"));
    },
    [repoPath, spec.kind],
  );

  const id = `prompt-${spec.kind}`;
  return (
    <div className="settings-row oc-prompt-row" data-settings-row data-open={open || undefined}>
      <button type="button" className="oc-prompt-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="oc-prompt-text">
          <span className="oc-prompt-title">
            <span>{spec.title}</span>
            {current && <span className="oc-prompt-badge">Customized</span>}
          </span>
          <span className="oc-prompt-description">{spec.description}</span>
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
            disabled={effective === null}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            onFocus={() => (focused.current = true)}
            onChange={(e) => {
              const text = e.target.value;
              setDraft(text);
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => commit(text), SAVE_DEBOUNCE_MS);
            }}
            onBlur={() => {
              focused.current = false;
              commit(draft);
            }}
          />
          {current && current.layer !== "repo_local" && <p className="oc-prompt-source">Set in {layerLabel(current.layer)}; saving here overrides it for this repository.</p>}
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
