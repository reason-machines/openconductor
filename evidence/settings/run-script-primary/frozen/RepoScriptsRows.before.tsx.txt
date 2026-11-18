// Settings › Repository › Scripts, row for row with Conductor 0.87.6
// (renderApp-D_fmY7hW.js `vma` → `hma`, read with REA as untrusted data):
//  - "Setup script" / "Runs when a new workspace is created" and "Archive script" /
//    "Runs before a workspace is archived": a shell editor (`FCe`, setup.sh / archive.sh)
//    saved 2 s after typing and on blur (`fGt`), written to the repository local layer;
//  - "Run scripts" / "Shortcuts for quick actions, like running your dev server or test
//    suite" with an outline "Add" button, one bordered row per script (`cma`: icon, name,
//    command line, Edit) and "No run scripts yet. Add one to get started." when empty;
//  - the Add / Edit dialog (`uma`): icon, name ("My script"), command editor (<name>.run.sh),
//    Delete (repository-local scripts), Cancel, Save ⌘↵;
//  - "Want to share scripts with your team? Create a .conductor/settings.toml file" while
//    no shared settings set any script.
import { usePendingEdit } from "../../lib/persistence/producer.ts";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { openUrl } from "../../backend";
import { scriptsConfig } from "../../scripts/api";
import type { RunScript, ScriptsConfig } from "../../scripts/model";
import type { Repo } from "../../state/types";
import { errorText } from "../api";
import { Row } from "../GeneralPage";
import { repoSettingsSetLocal, type RepoLocalKey } from "../repoSettings.ts";
import { canSave, commandLine, editorHeight, nextScriptName, runEntry, sanitizeName, scriptId, scriptKey, type ScriptForm } from "../repoScripts.ts";
import { notifyRepoSettingsChanged } from "../useRepoSettings.ts";
import { RUN_ICON_NAMES, RunIcon, iconLabel } from "./runIcons";
import "./scripts.css";

/** Conductor's `l3.shareScripts`. */
const SHARE_SCRIPTS_DOCS = "https://www.conductor.build/docs/reference/scripts/share-with-teammates";
/** Conductor's `x0a`: edits save 2 s after the last keystroke. */
const SAVE_DEBOUNCE_MS = 2000;
/** Conductor's settings service (`Sz`) on a failed settings file write. */
export const SAVE_SETTING_FAILED = "Failed to save setting";

type Notify = (kind: "info" | "error", message: string) => void;

/**
 * A settings write that fails is one "Failed to save setting" toast, as Conductor's settings
 * service raises it for every file-backed write (index-BGEQ8YjU.js `Sz` ~344,829: it toasts and
 * returns false, so `ama` and `fGt` add nothing; their own "Failed to save run script" /
 * "Failed to delete run script" / "Failed to save script" fire only when something throws past
 * the service, which a local settings file write here never does). "Run script names can't be
 * empty" and "Run script names must be unique" stay as Conductor's guards. Without a `notify`
 * the message shows under the rows.
 */
export function RepoScriptsRows({ repo, notify }: { repo: Repo; notify?: Notify }) {
  const [config, setConfig] = useState<ScriptsConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!repo.path) return;
    scriptsConfig({
      workspaceId: "",
      repositoryId: repo.id,
      repoRoot: repo.path,
      workspacePath: repo.path,
      workspaceName: repo.name,
      defaultBranch: repo.defaultBranch,
      targetBranch: null,
    }).then(setConfig, (e) => setError(errorText(e)));
  }, [repo.id, repo.path, repo.name, repo.defaultBranch]);
  useEffect(() => {
    setConfig(null);
    setError(null);
    load();
  }, [load]);

  const write = useCallback(
    async (key: RepoLocalKey, value: unknown) => {
      if (!repo.path) return false;
      setError(null);
      try {
        await repoSettingsSetLocal(repo.path, key, value);
        notifyRepoSettingsChanged();
        load();
        return true;
      } catch {
        if (notify) notify("error", SAVE_SETTING_FAILED);
        else setError(SAVE_SETTING_FAILED);
        return false;
      }
    },
    [repo.path, load, notify],
  );
  const fail = useCallback((message: string) => (notify ? notify("error", message) : setError(message)), [notify]);

  if (!repo.path) return <p className="muted">This repository has no local checkout yet.</p>;
  const shared = config && (config.setupLayer === "repo_shared" || config.archiveLayer === "repo_shared" || config.run.some((s) => s.layer === "repo_shared"));
  return (
    <div className="repo-scripts">
      <div className="settings-rows">
        <ScriptRow
          id="setup_script"
          scope={repo.path}
          title="Setup script"
          description="Runs when a new workspace is created"
          filePath="setup.sh"
          value={config?.setup ?? ""}
          disabled={!config}
          onSave={(v) => write("scripts.setup", v.trim() ? v : null)}
        />
        <ScriptRow
          id="archive_script"
          scope={repo.path}
          title="Archive script"
          description="Runs before a workspace is archived"
          filePath="archive.sh"
          value={config?.archive ?? ""}
          disabled={!config}
          onSave={(v) => write("scripts.archive", v.trim() ? v : null)}
        />
      </div>
      <div className="settings-rows">
        <RunScriptsRow scripts={config?.run ?? null} write={write} fail={fail} />
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {config && !shared && (
        <p className="repo-scripts-share">
          Want to share scripts with your team?{" "}
          <button type="button" onClick={() => void openUrl(SHARE_SCRIPTS_DOCS)}>
            Create a .conductor/settings.toml file
          </button>
        </p>
      )}
    </div>
  );
}

/** Conductor's `fei`: a titled shell editor that saves itself. */
function ScriptRow(props: { id: string; scope: string; title: string; description: string; filePath: string; value: string; disabled: boolean; onSave: (v: string) => Promise<boolean> }) {
  const { value, onSave, disabled } = props;
  const [local, setLocal] = useState(value);
  const saved = useRef(value);
  const focused = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Conductor's `y0a`: an outside change replaces the text unless it is being edited.
    if (!focused.current && value !== saved.current) setLocal(value);
    saved.current = value;
  }, [value]);
  const persist = useCallback(
    async (v: string) => {
      window.clearTimeout(timer.current);
      if (v === saved.current) return;
      saved.current = v;
      return onSave(v);
    },
    [onSave],
  );
  const pending = usePendingEdit(`${props.scope}:${props.id}`, persist, () => window.clearTimeout(timer.current));
  const save = useCallback((value: string) => { pending.change(value); pending.flush(); }, [pending]);
  return (
    <Row label={props.title} help={props.description} stacked>
      <ScriptEditor
        label={props.title}
        filePath={props.filePath}
        value={local}
        disabled={disabled}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          save(local);
        }}
        onChange={(v) => {
          setLocal(v);
          pending.change(v);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => save(v), SAVE_DEBOUNCE_MS);
        }}
      />
    </Row>
  );
}

/**
 * Conductor's `FCe`: a bordered shell editor with a line-number gutter, 20 px a line
 * plus 8 (48 px empty). A textarea stands in for its CodeMirror view.
 */
export function ScriptEditor(props: {
  label: string;
  filePath: string;
  value: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onModEnter?: () => void;
}) {
  const [line, setLine] = useState(0);
  const lines = Math.max(1, props.value.split(/\r\n|\r|\n/).length);
  const track = (el: HTMLTextAreaElement) => setLine(el.value.slice(0, el.selectionStart).split("\n").length - 1);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && props.onModEnter) {
      e.preventDefault();
      props.onModEnter();
    }
  };
  return (
    <div className={`repo-script-editor${props.disabled ? " is-disabled" : ""}`} style={{ height: editorHeight(props.value) }} data-file-path={props.filePath}>
      <div className="repo-script-gutter" aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="repo-script-code">
        <div className="repo-script-active" style={{ top: 4 + line * 19.5 }} aria-hidden />
        <textarea
          aria-label={props.label}
          value={props.value}
          disabled={props.disabled}
          autoFocus={props.autoFocus}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          onChange={(e) => {
            props.onChange(e.target.value);
            track(e.target);
          }}
          onSelect={(e) => track(e.currentTarget)}
          onFocus={props.onFocus}
          onBlur={props.onBlur}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}

type Write = (key: RepoLocalKey, value: unknown) => Promise<boolean>;
type DialogState = { mode: "new" } | { mode: "edit"; script: RunScript };

/** Conductor's `ama`: the Run scripts row, its list and the Add / Edit dialog. */
function RunScriptsRow({ scripts, write, fail }: { scripts: RunScript[] | null; write: Write; fail: (message: string) => void }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const list = scripts ?? [];
  const taken = (except?: string) => new Set(list.filter((s) => s.id !== except).map((s) => s.id.toLowerCase()));
  const save = async (form: ScriptForm, original?: RunScript) => {
    const id = scriptId(form.name);
    if (id === undefined) return fail("Run script names can't be empty");
    if (taken(original?.id).has(id.toLowerCase())) return fail("Run script names must be unique");
    setDialog(null);
    const ok = await write(`scripts.run.${id}`, runEntry(form, original));
    // A rename removes the old local entry (Conductor's `replaceId`).
    if (ok && original && original.layer === "repo_local" && scriptKey(original.id) !== scriptKey(id)) {
      await write(`scripts.run.${original.id}`, null);
    }
  };
  return (
    <Row
      label="Run scripts"
      help="Shortcuts for quick actions, like running your dev server or test suite"
      control={
        <button type="button" className="btn oc-btn-outline-sm" onClick={() => setDialog({ mode: "new" })}>
          <PlusGlyph />
          Add
        </button>
      }
    >
      {scripts === null ? (
        <span className="repo-scripts-loading" aria-label="Loading" />
      ) : list.length === 0 ? (
        <p className="repo-scripts-empty">No run scripts yet. Add one to get started.</p>
      ) : (
        <div className="repo-run-list">
          {list.map((s) => (
            <div key={s.id} className={`repo-run-row${s.hide ? " is-hidden" : ""}`} data-settings-row>
              <div className="repo-run-icon">
                <RunIcon name={s.icon} />
              </div>
              <div className="repo-run-text">
                <div className="repo-run-name">
                  <span>{s.id}</span>
                  {s.hide && <span className="repo-run-hidden">Hidden</span>}
                </div>
                {commandLine(s).trim() && <div className="repo-run-command">{commandLine(s)}</div>}
              </div>
              <button type="button" className="btn oc-btn-outline-sm" onClick={() => setDialog({ mode: "edit", script: s })}>
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
      {dialog && (
        <RunScriptDialog
          key={dialog.mode === "edit" ? dialog.script.id : "new"}
          mode={dialog.mode}
          initial={
            dialog.mode === "edit"
              ? { name: dialog.script.id, icon: dialog.script.icon, commandLine: commandLine(dialog.script) }
              : { name: nextScriptName(list.map((s) => s.id)), icon: "play", commandLine: "" }
          }
          taken={taken(dialog.mode === "edit" ? dialog.script.id : undefined)}
          canDelete={dialog.mode === "edit" && dialog.script.layer === "repo_local"}
          onCancel={() => setDialog(null)}
          onSave={(form) => void save(form, dialog.mode === "edit" ? dialog.script : undefined)}
          onDelete={() => {
            if (dialog.mode !== "edit") return;
            setDialog(null);
            void write(`scripts.run.${dialog.script.id}`, null);
          }}
        />
      )}
    </Row>
  );
}

/** Conductor's `uma` inside its `nd` dialog (max-w-lg, p-6, gap-4, 200 ms fade). */
function RunScriptDialog(props: {
  mode: "new" | "edit";
  initial: ScriptForm;
  taken: ReadonlySet<string>;
  canDelete: boolean;
  onCancel: () => void;
  onSave: (form: ScriptForm) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(props.initial);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const key = scriptKey(form.name);
  const duplicate = key !== undefined && props.taken.has(key);
  const ok = canSave(form, props.initial, props.mode === "new", props.taken);
  const submit = () => ok && props.onSave(form);
  const title = props.mode === "new" ? "Add" : "Edit";
  return (
    <div className="repo-dialog-root" data-open={shown || undefined}>
      <div className="repo-dialog-backdrop" onMouseDown={props.onCancel} />
      <div className="repo-dialog-positioner">
        <div
          className="repo-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onKeyDown={(e) => {
            if (e.key === "Escape") props.onCancel();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        >
          <h2 className="repo-dialog-title">{title}</h2>
          <div className="repo-dialog-body">
            <div className="repo-dialog-field">
              <div className="repo-dialog-name">
                <IconPicker value={form.icon} onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: sanitizeName(e.target.value) }))}
                  onBlur={(e) => setForm((f) => ({ ...f, name: sanitizeName(e.target.value.trim()) }))}
                  placeholder="My script"
                  aria-invalid={duplicate}
                  className={duplicate ? "is-invalid" : undefined}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
              {duplicate && <p className="repo-dialog-error">A run script named "{form.name.trim()}" already exists.</p>}
            </div>
            <ScriptEditor
              label="Command"
              filePath={`${scriptId(form.name) ?? "script"}.run.sh`}
              value={form.commandLine}
              autoFocus={props.mode === "edit"}
              onChange={(commandLine) => setForm((f) => ({ ...f, commandLine }))}
              onModEnter={submit}
            />
          </div>
          <div className="repo-dialog-footer">
            <div className="repo-dialog-footer-start">
              {props.canDelete && (
                <button type="button" className="btn oc-btn-ghost-icon" aria-label="Delete run script" onClick={props.onDelete}>
                  <TrashGlyph />
                </button>
              )}
            </div>
            <button type="button" className="btn oc-btn-outline" onClick={props.onCancel}>
              Cancel
            </button>
            <button type="button" className="btn oc-btn-primary" data-primary-action onClick={submit} disabled={!ok}>
              Save
              <span className="oc-btn-kbd" aria-hidden="true">
                ⌘<EnterGlyph />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Conductor's `Mzi`: a 24 px icon button with a searchable grid popover (288 px wide). */
function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = RUN_ICON_NAMES.includes(value) ? value : "play";
  const matches = RUN_ICON_NAMES.filter((n) => n.includes(query.trim().toLowerCase().replace(/\s+/g, "-")));
  return (
    <span className="repo-icon-picker">
      <button type="button" className="repo-icon-trigger" aria-label="Choose run script icon" title={iconLabel(current)} onClick={() => setOpen((o) => !o)}>
        <RunIcon name={current} />
      </button>
      {open && (
        <div className="repo-icon-popover" role="dialog" aria-label="Choose run script icon">
          <div className="repo-icon-search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search icons" autoFocus autoComplete="off" spellCheck={false} />
          </div>
          <div className="repo-icon-grid">
            {matches.length === 0 ? (
              <div className="repo-icon-none">No icons found</div>
            ) : (
              matches.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === current ? "is-current" : undefined}
                  aria-label={`Select ${iconLabel(n)} icon`}
                  title={iconLabel(n)}
                  onClick={() => {
                    onChange(n);
                    setOpen(false);
                  }}
                >
                  <RunIcon name={n} />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </span>
  );
}

const svg = (children: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
const PlusGlyph = () => svg(<path d="M5 12h14M12 5v14" />);
const TrashGlyph = () => svg(<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />);
const EnterGlyph = () => svg(<path d="M20 4v7a4 4 0 0 1-4 4H4M9 10l-5 5 5 5" />, 12);
