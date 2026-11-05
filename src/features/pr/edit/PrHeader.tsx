// parity:pr.edit:ui
// Top of the Checks tab: the PR's number, author, title, base branch and
// description. The title opens an "Edit PR title" dialog, the description is
// click-to-edit, and the base branch is a picker that retargets the PR
// (`pr_edit`, `pr_retarget`). After a save the PR lookup is refreshed; until
// it answers the saved values are shown.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Modal } from "../../../components/Dialogs";
import { ensureRepository, listBranches, type BranchDto } from "../../../workspace/api";
import type { PrInfo } from "../types";
import { editPr, retargetPr } from "./api";
import { planPrEdit, planRetarget, prEditErrorMessage, retargetErrorMessage, type PrText } from "./edit";
import "./edit.css";

interface Props {
  pr: PrInfo;
  /** Worktree the `gh` commands run in. */
  worktree: string | null;
  /** Source checkout of the repository, for the branch list. */
  repoPath: string;
  defaultBranch: string;
  refresh: () => Promise<void>;
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

type Branches = { status: "loading" } | { status: "error" } | { status: "ready"; items: BranchDto[] };

function BasePicker({ base, repoPath, defaultBranch, onPick, onClose }: { base: string; repoPath: string; defaultBranch: string; onPick: (b: string) => void; onClose: () => void }) {
  const [branches, setBranches] = useState<Branches>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setBranches({ status: "loading" });
    ensureRepository(repoPath)
      .then((r) => listBranches(r.id, defaultBranch))
      .then((items) => live && setBranches({ status: "ready", items }), () => live && setBranches({ status: "error" }));
    return () => {
      live = false;
    };
  }, [repoPath, defaultBranch, attempt]);
  const names = useMemo(() => {
    if (branches.status !== "ready") return [];
    const seen = new Set<string>();
    for (const b of branches.items) seen.add(b.name.replace(/^origin\//, ""));
    const q = query.trim().toLowerCase();
    return [...seen].filter((n) => n.toLowerCase().includes(q));
  }, [branches, query]);
  return (
    <div className="pr-base-picker" role="dialog" aria-label="Select target branch" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <input autoFocus placeholder="Select target branch..." value={query} onChange={(e) => setQuery(e.target.value)} />
      {branches.status === "loading" && <p className="muted small">Loading branches...</p>}
      {branches.status === "error" && (
        <p className="muted small">
          Couldn't load branches. <button className="link-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </p>
      )}
      {branches.status === "ready" && names.length === 0 && <p className="muted small">No branch found.</p>}
      {branches.status === "ready" && names.length > 0 && (
        <ul>
          {names.map((n) => (
            <li key={n}>
              <button className={n === base ? "selected" : ""} onClick={() => onPick(n)}>
                <span>{n}</span>
                {n === defaultBranch && <span className="pr-badge">default</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PrHeader({ pr, worktree, repoPath, defaultBranch, refresh }: Props) {
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
    const plan = planRetarget({ number: pr.number, baseRefName: base, isMerged: pr.isMerged }, next);
    if (plan.kind === "skip") return;
    setError(null);
    try {
      await retargetPr(worktree ?? "", plan.number, plan.base);
      setSaved((s) => ({ ...s, base: plan.base }));
    } catch (e) {
      setError(retargetErrorMessage(e));
    }
    void refresh();
  };

  return (
    <div className="pr-header" aria-label="Pull request">
      <div className="pr-header-meta">
        <span className="pr-number">#{pr.number}</span>
        {pr.authorLogin && <span className="pr-author">{pr.authorLogin}</span>}
        <span className="muted">into</span>
        <span className="pr-base-anchor">
          <button className="pr-base" disabled={readOnly} title={readOnly ? undefined : "Change the PR's base branch"} onClick={() => setPicking((v) => !v)}>
            {base}
          </button>
          {picking && <BasePicker base={base} repoPath={repoPath} defaultBranch={defaultBranch} onPick={(b) => void pickBase(b)} onClose={() => setPicking(false)} />}
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
