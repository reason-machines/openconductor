// parity:pr.create:ui parity:pr.merge:ui
// The workspace header's PR control: Create PR (asks the agent to commit,
// push and run `gh pr create`), Merge (gh pr merge with the repository's
// preferred method), or the PR's current state, which opens it on GitHub.
import { useEffect, useRef, useState } from "react";
import { openUrl } from "../../backend.ts";
import { createPrPrompt, mergePr } from "./api.ts";
import { prControl } from "./control.ts";
import type { PullRequest } from "./usePullRequest.ts";
import "./pr.css";

interface Props {
  pullRequest: PullRequest;
  worktree: string | null;
  branch: string;
  targetBranch: string;
  /** Sends a message to the workspace's agent. */
  sendToAgent: (text: string) => void;
  notify?: (kind: "info" | "error", message: string) => void;
}

export function PrControl({ pullRequest, worktree, branch, targetBranch, sendToAgent, notify }: Props) {
  const { header, pr, git, refresh } = pullRequest;
  const [busy, setBusy] = useState<null | "creating" | "merging">(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const control = prControl(header, pr);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current?.contains(e.target as Node) || setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  // A new header state means the last action took effect (or was replaced).
  useEffect(() => setBusy((b) => (b === "creating" && header?.action.type !== "create_pr" ? null : b)), [header]);

  if (!control || !worktree) return null;

  async function create(draft: boolean) {
    setMenu(false);
    setBusy("creating");
    try {
      const text = await createPrPrompt({ branch, remote: git?.remote ?? "origin", targetBranch, draft });
      sendToAgent(text);
    } catch (e) {
      notify?.("error", `Couldn't start the PR: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function merge() {
    if (!pr || !worktree) return;
    setBusy("merging");
    try {
      await mergePr(worktree, pr.number);
      notify?.("info", `Merged PR #${pr.number}`);
    } catch (e) {
      notify?.("error", `Merge failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  const tone = `pr-control tone-${control.tone}`;
  if (control.intent === "create") {
    return (
      <span className={`${tone} pr-split`} ref={menuRef}>
        <button className="btn btn-small btn-primary" title={control.title} disabled={busy !== null} onClick={() => void create(false)}>
          {busy === "creating" ? "Creating…" : control.label}
        </button>
        <button className="btn btn-small btn-primary pr-caret" aria-label="More ways to create a PR" aria-expanded={menu} disabled={busy !== null} onClick={() => setMenu((m) => !m)}>
          ▾
        </button>
        {menu && (
          <div className="pr-menu" role="menu">
            <button role="menuitem" onClick={() => void create(true)}>
              Create draft PR
            </button>
          </div>
        )}
      </span>
    );
  }
  if (control.intent === "merge") {
    return (
      <span className={tone}>
        {pr && (
          <button className="btn btn-small pr-link" title={`Open PR #${pr.number} on GitHub`} onClick={() => void openUrl(pr.url)}>
            #{pr.number}
          </button>
        )}
        <button className="btn btn-small btn-merge" title={control.title} disabled={busy !== null} onClick={() => void merge()}>
          {busy === "merging" ? "Merging…" : control.label}
        </button>
      </span>
    );
  }
  return (
    <button className={`btn btn-small ${tone}`} title={pr ? `${control.title}. Open PR #${pr.number} on GitHub` : control.title} disabled={!pr} onClick={() => pr && void openUrl(pr.url)}>
      <span className="pr-dot" /> {control.label}
    </button>
  );
}
