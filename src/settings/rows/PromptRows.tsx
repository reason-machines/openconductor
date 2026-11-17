// Settings › Repository › Actions: custom instructions per action (`[prompts]`),
// row for row with Conductor 0.87.6 (renderApp-D_fmY7hW.js registry `Q3a`, each
// row `yzi` → `xzi` → the collapsible row `vho`, read with REA as untrusted data):
//  - a full-width trigger with the title (font-medium), a "Customized" badge when
//    the setting has a value, the description, and a chevron that turns 180° over
//    150 ms;
//  - open: `pt-3`, a 120 px mono textarea (text-xs, px-3 py-2, `!border-input`)
//    with Conductor's placeholder, saved 2 s after typing and on blur, trimmed
//    (`fGt`; a blank edit preserves an explicit empty override; Reset removes it).
// Saving writes the repository's `.conductor/settings.local.toml`.
import { Menu } from "@base-ui/react/menu";
import { EllipsisIcon } from "../../components/menu/menuIcons";
import "../../components/sidebarActionsMenu.css";
import { DialogFrame } from "../../components/DialogFrame";
import { Markdown } from "../../features/chat/markdown";
import { actionPromptPreview } from "../actionPromptPreview.ts";
import { usePendingEdit } from "../../lib/persistence/producer.ts";
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
  const [preview, setPreview] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [draft, setDraft] = useState(current?.value ?? "");
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(current?.value);
  const focused = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    saved.current = current?.value;
    if (!focused.current) setDraft(current?.value ?? "");
  }, [current?.value]);
  const persist = useCallback(
    async (text: string | null) => {
      window.clearTimeout(timer.current);
      const write = text === null ? { key: `prompts.${spec.kind}` as const, value: null } : promptWrite(spec.kind, saved.current, text);
      if (!write) return;
      saved.current = write.value ?? undefined;
      setError(null);
      await repoSettingsSetLocal(repoPath, write.key, write.value).then((updated) => {
        if (text === null) setDraft(updated.prompts[spec.kind]?.value ?? "");
        notifyRepoSettingsChanged();
      }, (error) => {
        setError(text === null ? "Failed to reset custom prompt" : "Failed to save custom prompt");
        throw error;
      });
    },
    [repoPath, spec.kind],
  );
  const pending = usePendingEdit(`${repoPath}:${spec.kind}`, persist, () => window.clearTimeout(timer.current));
  const commit = useCallback((text: string) => { pending.change(text); pending.flush(); }, [pending]);

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
      {current?.layer === "repo_local" && (
        <span className="oc-prompt-actions" data-open={actionsOpen || undefined}>
          <Menu.Root open={actionsOpen} onOpenChange={setActionsOpen}>
            <Menu.Trigger type="button" className="btn btn-ghost" aria-label="Setting actions">
              <EllipsisIcon />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="sb-actions-positioner" side="bottom" align="end" sideOffset={4}>
                <Menu.Popup className="sb-actions-popup" aria-label={`${spec.title} actions`}>
                  <Menu.Item className="sb-actions-item" onClick={() => {
                    setActionsOpen(false);
                    focused.current = false;
                    pending.change(null);
                    pending.flush();
                  }}>Reset</Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </span>
      )}
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
              pending.change(text);
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => commit(text), SAVE_DEBOUNCE_MS);
            }}
            onBlur={() => {
              focused.current = false;
              commit(draft);
            }}
          />
          {spec.kind !== "general" && (
            <button type="button" className="oc-prompt-preview" onClick={() => setPreview(true)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
              </svg>
              Preview
            </button>
          )}
          {preview && <PromptPreview spec={spec} draft={draft} onClose={() => setPreview(false)} />}
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

/** The dialog owns asynchronous preview results; closing/changing a draft discards stale responses. */
function PromptPreview({ spec, draft, onClose }: { spec: PromptRowSpec; draft: string; onClose: () => void }) {
  const [result, setResult] = useState<{ text: string } | { error: true } | null>(null);
  useEffect(() => {
    let active = true;
    setResult(null);
    void actionPromptPreview(spec.kind, draft).then(
      (text) => { if (active) setResult({ text }); },
      () => { if (active) setResult({ error: true }); },
    );
    return () => { active = false; };
  }, [spec.kind, draft]);
  const titleId = `prompt-preview-${spec.kind}`;
  return (
    <DialogFrame kind="dialog" titleId={titleId} className="oc-prompt-preview-dialog" onClose={onClose}>
      <div className="project-dialog-header">
        <h2 id={titleId}>{spec.title} prompt</h2>
        <button type="button" className="oc-prompt-preview-close" aria-label="Close preview" onClick={onClose}>×</button>
      </div>
      <div className="oc-prompt-preview-content">
        {result === null ? <p role="status">Loading preview…</p> : "error" in result ? (
          <p role="alert">Failed to load prompt preview.</p>
        ) : <Markdown text={result.text} />}
      </div>
    </DialogFrame>
  );
}
