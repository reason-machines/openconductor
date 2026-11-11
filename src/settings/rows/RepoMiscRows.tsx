// Settings › repository › Misc, row for row with Conductor 0.87.6's `Sba`
// registry (renderApp-D_fmY7hW.js): Icon, Root path, Workspaces path, Preview
// URLs, Files to copy, Remove repository. Each row is Conductor's `Al` with
// its content stacked under the title and description.
import { useEffect, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import type { Repo } from "../../state/types";
import { RepoIcon } from "../../components/RepoIcon";
import { RepoIconPicker } from "../../components/RepoIconDialog";
import { RemoveRepositoryDialog } from "../../components/RemoveRepositoryDialog";
import { ArrowUpRightIcon, ChevronDownIcon, ChevronUpIcon, CircleAlertIcon, PlusIcon, RefreshCwIcon } from "../../components/Icons";
import { openUrl } from "../../backend";
import "./rows.css";
import "./repoIconPopover.css";
import { OpenInButton } from "../../features/openIn/OpenInButton";
import { Row } from "../GeneralPage";
import { TrashIcon } from "../icons";
import { repoWorkspacesPath } from "../rootPath";
import { repoSettingsSetLocal } from "../repoSettings";
import { notifyRepoSettingsChanged, useRepoSettings } from "../useRepoSettings";
import {
  DEFAULT_FILE_INCLUDE_GLOBS,
  MISC_COPY as COPY,
  emptyPreviewRow,
  filesToCopyPreview,
  movePreviewRow,
  previewRows,
  previewValue,
  splitPath,
  type FilesToCopyPreview,
  type PreviewRow,
} from "../repoMisc";

// The page Conductor's "Learn more" opens (`l3.filesToCopy`); it documents the same `.worktreeinclude` rules.
const FILES_TO_COPY_DOCS = "https://www.conductor.build/docs/reference/files-to-copy";

type Notify = (kind: "info" | "error", message: string) => void;

export interface RepoMiscActions {
  /** Set `repos.icon` (null clears it), as the sidebar's "Change icon". */
  onSetIcon: (repoId: string, icon: string | null) => void;
  /** Called after the repository was removed. */
  onRemoved: (repoId: string) => void;
  notify: Notify;
}

// Workspaces folder per repository, last read: the page opens with it in place.
const workspacesPaths = new Map<string, string>();

export function RepoMiscRows({ repo, actions }: { repo: Repo; actions: RepoMiscActions }) {
  const [workspaces, setWorkspaces] = useState<string | null>(() => workspacesPaths.get(repo.id) ?? null);
  useEffect(() => {
    setWorkspaces(workspacesPaths.get(repo.id) ?? null);
    repoWorkspacesPath(repo.id, repo.name).then(
      (path) => {
        workspacesPaths.set(repo.id, path);
        setWorkspaces(path);
      },
      () => setWorkspaces(null),
    );
  }, [repo.id, repo.name]);
  return (
    <div className="settings-rows settings-misc">
      <IconRow repo={repo} actions={actions} />
      <Row label={COPY.rootPath.title} help={<Warn text={COPY.rootPath.description} />} stacked>
        {repo.path ? <PathLine path={repo.path} notify={actions.notify} /> : <span className="muted small">No local checkout</span>}
      </Row>
      <Row label={COPY.workspacesPath.title} help={<Warn text={COPY.workspacesPath.description} />} stacked>
        {workspaces && <PathLine path={workspaces} notify={actions.notify} showShortcutHint={false} />}
      </Row>
      {repo.path && <PreviewUrlsRow repoPath={repo.path} />}
      <FilesToCopyRow repoPath={repo.path || null} />
      <RemoveRow repo={repo} actions={actions} />
    </div>
  );
}

function Warn({ text }: { text: string }) {
  return (
    <span className="settings-misc-warn">
      <CircleAlertIcon size={14} />
      {text}
    </span>
  );
}

/** `bj` + `P9` (icon size): the muted directory, the last segment, and the Open in menu. */
function PathLine({ path, notify, showShortcutHint }: { path: string; notify: Notify; showShortcutHint?: boolean }) {
  const { directory, fileName } = splitPath(path);
  return (
    <div className="settings-misc-path" title={path}>
      <span className="settings-misc-path-text">
        <span className="settings-misc-path-dir">{directory}</span>
        <span className="settings-misc-path-name">{fileName}</span>
      </span>
      <OpenInButton path={path} notify={notify} variant="icon" showShortcutHint={showShortcutHint} />
    </div>
  );
}

function IconRow({ repo, actions }: { repo: Repo; actions: RepoMiscActions }) {
  const [open, setOpen] = useState(false);
  return (
    <Row label={COPY.icon.title} help={COPY.icon.description} stacked>
      <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
        <Popover.Trigger type="button" className="settings-misc-icon" aria-label="Change repository icon">
          <RepoIcon repo={repo} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="settings-repo-icon-positioner" side="bottom" align="start" sideOffset={4}>
            <Popover.Popup className="settings-repo-icon-popover" aria-label="Change repository icon">
              <RepoIconPicker
                repo={repo}
                onChange={(icon) => actions.onSetIcon(repo.id, icon)}
                onClose={() => setOpen(false)}
                onError={(message) => actions.notify("error", message)}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </Row>
  );
}

/** Run `fn` `ms` after the last call; `flush` runs a pending call now. */
function useDebounced<T>(fn: (value: T) => void, ms: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const latest = useRef(fn);
  latest.current = fn;
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) latest.current(p.value);
  };
  useEffect(() => flush, []);
  return {
    call: (value: T) => {
      pending.current = { value };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, ms);
    },
    flush,
  };
}

/** `X3a`: name + URL rows, reorder arrows when there are several, saved 500 ms after typing. */
function PreviewUrlsRow({ repoPath }: { repoPath: string }) {
  const effective = useRepoSettings(repoPath);
  const saved = effective?.previewUrls?.value;
  const [rows, setRows] = useState<PreviewRow[]>(() => previewRows(saved));
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify(saved ?? null);
    if (key !== lastSaved.current) {
      lastSaved.current = key;
      setRows(previewRows(saved));
    }
  }, [saved]);
  const save = useDebounced((next: PreviewRow[]) => {
    const value = previewValue(next);
    lastSaved.current = JSON.stringify(value);
    repoSettingsSetLocal(repoPath, "preview_urls", value).then(notifyRepoSettingsChanged, () => setError("Failed to save preview URLs"));
  }, 500);
  const update = (next: PreviewRow[]) => {
    const list = next.length > 0 ? next : [emptyPreviewRow()];
    setError(null);
    setRows(list);
    save.call(list);
  };
  const edit = (id: string, field: "name" | "url", value: string) => update(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const several = rows.length > 1;
  return (
    <Row label={COPY.previewUrls.title} help={COPY.previewUrls.description} stacked>
      <div className="settings-misc-urls">
        {rows.map((r, i) => (
          <div key={r.id} className="settings-misc-url">
            <input
              className="settings-field settings-misc-url-name"
              value={r.name}
              placeholder={COPY.previewUrls.namePlaceholder}
              aria-label="Preview URL name"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => edit(r.id, "name", e.target.value)}
            />
            <input
              className="settings-field mono settings-misc-url-url"
              value={r.url}
              placeholder={COPY.previewUrls.urlPlaceholder}
              aria-label="Preview URL"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => edit(r.id, "url", e.target.value)}
            />
            {several && (
              <div className="settings-misc-url-move">
                <button type="button" aria-label="Move preview URL up" disabled={i === 0} onClick={() => update(movePreviewRow(rows, i, -1))}>
                  <ChevronUpIcon size={12} />
                </button>
                <button type="button" aria-label="Move preview URL down" disabled={i === rows.length - 1} onClick={() => update(movePreviewRow(rows, i, 1))}>
                  <ChevronDownIcon size={12} />
                </button>
              </div>
            )}
            <button
              type="button"
              className="settings-misc-url-remove"
              aria-label="Remove preview URL"
              disabled={rows.length === 1 && r.name === "" && r.url === ""}
              onClick={() => update(rows.filter((x) => x.id !== r.id))}
            >
              <TrashIcon size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="btn settings-outline settings-misc-add" onClick={() => update([...rows, emptyPreviewRow()])}>
          <PlusIcon size={12} />
          {COPY.previewUrls.add}
        </button>
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </Row>
  );
}

/** `Z3a`: the patterns textarea (locked while a `.worktreeinclude` exists) and the `Nei` preview. */
function FilesToCopyRow({ repoPath }: { repoPath: string | null }) {
  const effective = useRepoSettings(repoPath ?? undefined);
  const stored = effective?.fileIncludeGlobs?.value;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilesToCopyPreview | "error" | null>(null);
  const [refresh, setRefresh] = useState(0);
  const value = draft ?? stored ?? DEFAULT_FILE_INCLUDE_GLOBS;
  // Conductor previews the stored setting as "no setting" while it still equals the default.
  const previewGlobs = stored === undefined && value === DEFAULT_FILE_INCLUDE_GLOBS ? null : value;
  useEffect(() => {
    if (!repoPath) return;
    let live = true;
    const t = setTimeout(() => {
      filesToCopyPreview(repoPath, previewGlobs).then(
        (p) => live && setPreview(p),
        () => live && setPreview("error"),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [repoPath, previewGlobs, refresh]);
  const save = useDebounced((text: string) => {
    if (!repoPath) return;
    repoSettingsSetLocal(repoPath, "file_include_globs", text.trim() ? text : "").then(notifyRepoSettingsChanged, () => setError(COPY.filesToCopy.saveError));
  }, 1000);
  const help = (
    <>
      {COPY.filesToCopy.description}{" "}
      <button type="button" className="settings-misc-learn" onClick={() => openUrl(FILES_TO_COPY_DOCS).catch(() => undefined)}>
        Learn more
        <ArrowUpRightIcon size={12} />
      </button>
    </>
  );
  if (!repoPath) {
    return (
      <Row label={COPY.filesToCopy.title} help={help} stacked>
        <p className="muted small">{COPY.filesToCopy.noCheckout}</p>
      </Row>
    );
  }
  const locked = preview !== null && preview !== "error" && preview.source === "worktreeinclude";
  return (
    <Row label={COPY.filesToCopy.title} help={help} stacked>
      <div className="settings-misc-files">
        {locked ? (
          <div className="settings-misc-locked">
            <textarea className="settings-field mono settings-misc-textarea" value={preview.contents} readOnly disabled aria-label={COPY.filesToCopy.title} />
            <div className="settings-misc-locked-note">{COPY.filesToCopy.worktreeinclude}</div>
          </div>
        ) : (
          <textarea
            className="settings-field mono settings-misc-textarea"
            value={value}
            placeholder={COPY.filesToCopy.placeholder}
            aria-label={COPY.filesToCopy.title}
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={!effective}
            onChange={(e) => {
              setError(null);
              setDraft(e.target.value);
              save.call(e.target.value);
            }}
            onBlur={save.flush}
          />
        )}
        <FilesPreview preview={preview} repoPath={repoPath} onRefresh={() => setRefresh((n) => n + 1)} />
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </Row>
  );
}

function FilesPreview({ preview, repoPath, onRefresh }: { preview: FilesToCopyPreview | "error" | null; repoPath: string; onRefresh: () => void }) {
  const refresh = (
    <button type="button" className="settings-misc-refresh" aria-label="Refresh files to copy preview" onClick={onRefresh}>
      <RefreshCwIcon size={12} />
    </button>
  );
  const note = (text: string) => (
    <div className="settings-misc-files-note">
      <span>{text}</span>
      {refresh}
    </div>
  );
  if (preview === "error") return note("Could not preview files to copy.");
  if (preview === null) return note("Detecting files to copy...");
  if (preview.files.length === 0) return note("No matching gitignored files found.");
  const shown = preview.files.slice(0, 100);
  const { directory, fileName } = splitPath(repoPath);
  return (
    <div className="settings-misc-files-preview">
      <div className="settings-misc-files-note settings-misc-files-head">
        <span className="settings-misc-files-count">
          {preview.files.length} {preview.files.length === 1 ? "file" : "files"} will be copied from{" "}
          <span className="settings-misc-path-dir">{directory}</span>
          <span className="settings-misc-path-name">{fileName}</span>
        </span>
        {refresh}
      </div>
      <div className="settings-misc-files-list">
        {shown.map((f) => (
          <div key={f}>{f}</div>
        ))}
        {preview.files.length > shown.length && <div className="muted">...and {preview.files.length - shown.length} more</div>}
      </div>
    </div>
  );
}

/** "Remove repository" and its confirmation (`J3a`, src/components/RemoveRepositoryDialog.tsx). */
function RemoveRow({ repo, actions }: { repo: Repo; actions: RepoMiscActions }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="settings-row settings-misc-remove" data-settings-row>
      <button type="button" className="btn settings-outline settings-misc-remove-btn" onClick={() => setConfirming(true)}>
        <TrashIcon size={12} /> {COPY.remove.button}
      </button>
      {confirming && (
        <RemoveRepositoryDialog
          repo={repo}
          onClose={() => setConfirming(false)}
          onRemoved={() => {
            setConfirming(false);
            actions.notify("info", COPY.remove.removed);
            actions.onRemoved(repo.id);
          }}
          onError={(message) => actions.notify("error", message)}
        />
      )}
    </div>
  );
}
