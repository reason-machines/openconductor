// parity:pr.create:ui parity:pr.merge:ui parity:pr.review-actions:ui parity:pr.commit-push:ui parity:pr.resolve-conflicts:ui
// The workspace header's PR control: Create PR (asks the agent to commit,
// push and run `gh pr create`), Commit and push (uncommitted changes, an
// agent message), Resolve (merge conflicts, an agent message), Merge (gh pr merge with the repository's
// preferred method, named in the tooltip), Ready for review on a draft,
// Approve PR, Automerge while checks run (with the setting on), or the PR's current state, which opens it on GitHub.
import { useEffect, useRef, useState } from "react";
import { prControl } from "./control.ts";
import type { PrActions } from "./usePrActions.ts";
import type { PullRequest } from "./usePullRequest.ts";
import "./pr.css";

interface Props {
  pullRequest: PullRequest;
  actions: PrActions;
  worktree: string | null;
}

export function PrControl({ pullRequest, actions, worktree }: Props) {
  const { header, pr } = pullRequest;
  const { busy } = actions;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const control = prControl(header, pr, { method: actions.method, automerge: pullRequest.settings.automerge });

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current?.contains(e.target as Node) || setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  if (!control || !worktree) return null;

  const tone = `pr-control tone-${control.tone}`;
  const prLink = pr && (
    <button className="btn btn-small pr-link" title={`Open PR #${pr.number} on GitHub`} onClick={actions.openOnGitHub}>
      #{pr.number}
    </button>
  );

  switch (control.intent) {
    case "create":
      return (
        <span className={`${tone} pr-split`} ref={menuRef}>
          <button className="btn btn-small btn-primary" title={control.title} disabled={busy !== null} onClick={() => void actions.create(false)}>
            {busy === "creating" ? "Creating…" : control.label}
          </button>
          <button className="btn btn-small btn-primary pr-caret" aria-label="More ways to create a PR" aria-expanded={menu} disabled={busy !== null} onClick={() => setMenu((m) => !m)}>
            ▾
          </button>
          {menu && (
            <div className="pr-menu" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  void actions.create(true);
                }}
              >
                Create draft PR
              </button>
            </div>
          )}
        </span>
      );
    case "commit_and_push":
      return (
        <span className={tone}>
          {prLink}
          <button className="btn btn-small" title={control.title} disabled={busy !== null} onClick={() => void actions.commitAndPush()}>
            {busy === "committing" ? "Asking agent…" : control.label}
          </button>
        </span>
      );
    case "resolve_conflicts":
      return (
        <span className={tone}>
          {prLink}
          <span className="pr-pending" title={control.title}>
            <span className="pr-dot" /> Merge conflicts
          </span>
          <button className="btn btn-small" title={control.title} disabled={busy !== null} onClick={() => void actions.resolveConflicts()}>
            {busy === "resolving" ? "Asking agent…" : control.label}
          </button>
        </span>
      );
    case "merge":
      return (
        <span className={tone}>
          {prLink}
          <button className="btn btn-small btn-merge" title={control.title} disabled={busy !== null} onClick={() => void actions.merge()}>
            {busy === "merging" ? "Merging…" : control.label}
          </button>
        </span>
      );
    case "ready":
      return (
        <span className={tone}>
          {prLink}
          <button className="btn btn-small" title={control.title} disabled={busy !== null} onClick={() => void actions.markReady()}>
            {busy === "marking-ready" ? "Marking ready…" : control.label}
          </button>
        </span>
      );
    case "approve":
      return (
        <span className={tone}>
          {prLink}
          <button className="btn btn-small btn-approve" title={control.title} disabled={busy !== null} onClick={() => void actions.approve()}>
            {busy === "approving" ? "Approving…" : control.label}
          </button>
        </span>
      );
    case "enable_automerge":
    case "disable_automerge": {
      const enable = control.intent === "enable_automerge";
      const pending = prControl(header, pr);
      return (
        <span className={tone}>
          <span className="pr-pending" title={pending?.title}>
            <span className="pr-dot" /> {pending?.label}
          </span>
          <button className="btn btn-small" title={control.title} disabled={busy !== null} onClick={() => void actions.automerge(enable)}>
            {busy === "automerge" ? (enable ? "Turning on…" : "Cancelling…") : control.label}
          </button>
        </span>
      );
    }
    case "status":
      return (
        <button className={`btn btn-small ${tone}`} title={pr ? `${control.title}. Open PR #${pr.number} on GitHub` : control.title} disabled={!pr} onClick={actions.openOnGitHub}>
          <span className="pr-dot" /> {control.label}
        </button>
      );
  }
}
