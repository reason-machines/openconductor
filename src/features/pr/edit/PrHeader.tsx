// parity:pr.edit:ui
// Top of the Checks tab: the PR's number, author, title, base branch and
// description. The title opens an "Edit PR title" dialog, the description is
// click-to-edit, and the base branch is a picker that retargets the PR
// (`pr_edit`, `pr_retarget`). After a save the PR lookup is refreshed; until
// it answers the saved values are shown.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "../../../components/Dialogs";
import type { PrInfo } from "../types";
import type { TargetBranch } from "../useTargetBranch";
import { usePrLinkMenu } from "../PrLinkMenu";
import { BranchPicker } from "./BranchPicker";
import { editPr } from "./api";
import { planPrEdit, prEditErrorMessage, type PrText } from "./edit";
import "./edit.css";

interface Props {
  pr: PrInfo;
  /** Worktree the `gh` commands run in. */
  worktree: string | null;
  /** The workspace's project, so the branch list resolves to it when its folder has `-v1` copies. */
  repoId?: string;
  /** Source checkout of the repository, for the branch list. */
  repoPath: string;
  defaultBranch: string;
  refresh: () => Promise<void>;
  /** The workspace's target branch: picking a base changes it, retargeting the PR (useTargetBranch). */
  target: TargetBranch;
  /** Toasts for the "#N" right-click menu. */
  notify?: (kind: "info" | "error", message: string) => void;
}

function TitleDialog({ title, onSave, onClose }: { title: string; onSave: (t: string) => Promise<string | null>; onClose: () => void }) {
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!value.trim() || saving) return;
    setSaving(true);
    const err = await onSave(value);
    setSaving(false);
    if (err) setError(err);
    else onClose();
  };
  return (
    <Modal title="Edit PR title" onClose={onClose}>
      <form className="modal-body pr-title-dialog" onSubmit={submit}>
        <input autoFocus aria-label="PR title" placeholder="PR title" value={value} disabled={saving} onChange={(e) => setValue(e.target.value)} />
        {error && <p className="error small" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!value.trim() || saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function PrHeader({ pr, worktree, repoId, repoPath, defaultBranch, refresh, target, notify }: Props) {
  const linkMenu = usePrLinkMenu(pr, notify);
  // Saved values shown until the next lookup brings GitHub's.
  const [saved, setSaved] = useState<Partial<PrText> & { base?: string }>({});
  useEffect(() => setSaved({}), [pr.title, pr.body, pr.baseRefName, pr.number]);
  const title = saved.title ?? pr.title;
  const body = saved.body ?? pr.body;
  const base = saved.base ?? pr.baseRefName;
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [savingBody, setSavingBody] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const readOnly = pr.isMerged || !worktree;

  /** Resolves to an error message, or null once saved (or nothing changed). */
  const save = async (edit: Partial<PrText>): Promise<string | null> => {
    const plan = planPrEdit({ title, body }, edit);
    if (plan.kind === "invalid") return plan.message;
    if (plan.kind === "noop") return null;
    try {
      await editPr(worktree ?? "", pr.number, plan);
      setSaved((s) => ({ ...s, ...plan }));
      void refresh();
      return null;
    } catch (e) {
      return prEditErrorMessage(e);
    }
  };

  const saveBody = async () => {
    if (draftBody === null) return;
    setSavingBody(true);
    const err = await save({ body: draftBody });
    setSavingBody(false);
    setError(err);
    if (!err) setDraftBody(null);
  };

  const pickBase = async (next: string) => {
    setPicking(false);
    setError(null);
    const err = await target.change(next);
    if (err) setError(err);
    else setSaved((s) => ({ ...s, base: next.trim() }));
  };

  return (
    <div className="pr-header" aria-label="Pull request">
      <div className="pr-header-meta">
        {/* Conductor's PR title "#N" (`sKo`) opens the PR link menu (`w_i`) on right-click. */}
        <span className="pr-number" onContextMenu={linkMenu.onContextMenu}>
          #{pr.number}
        </span>
        {linkMenu.menu}
        {pr.authorLogin && <span className="pr-author">{pr.authorLogin}</span>}
        <span className="muted">into</span>
        <span className="pr-base-anchor">
          <button
            className="pr-base"
            disabled={readOnly || target.disabledReason !== null || target.changing}
            title={target.disabledReason ?? (readOnly ? undefined : "Change the PR's base branch")}
            onClick={() => setPicking((v) => !v)}
          >
            {base}
          </button>
          {picking && <BranchPicker base={base} repoId={repoId} repoPath={repoPath} defaultBranch={defaultBranch} onPick={(b) => void pickBase(b)} onClose={() => setPicking(false)} />}
        </span>
      </div>
      <button className="pr-title" disabled={readOnly} title={readOnly ? undefined : "Edit PR title"} onClick={() => setEditingTitle(true)}>
        {title || <span className="muted">PR title</span>}
      </button>
      {draftBody === null ? (
        <button className="pr-body" disabled={readOnly} title={readOnly ? undefined : "Edit PR description"} onClick={() => setDraftBody(body)}>
          {body.trim() ? body : <span className="muted">PR description</span>}
        </button>
      ) : (
        <div className="pr-body-editor">
          <textarea
            ref={bodyRef}
            autoFocus
            aria-label="PR description"
            placeholder="PR description"
            value={draftBody}
            disabled={savingBody}
            onChange={(e) => setDraftBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDraftBody(null);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveBody();
            }}
          />
          <div className="pr-body-actions">
            <button className="btn btn-small" onClick={() => setDraftBody(null)} disabled={savingBody}>Cancel</button>
            <button className="btn btn-small btn-primary" onClick={() => void saveBody()} disabled={savingBody}>{savingBody ? "Saving..." : "Save"}</button>
          </div>
        </div>
      )}
      {error && <p className="error small" role="alert">{error}</p>}
      {editingTitle && <TitleDialog title={title} onSave={(t) => save({ title: t })} onClose={() => setEditingTitle(false)} />}
    </div>
  );
}
