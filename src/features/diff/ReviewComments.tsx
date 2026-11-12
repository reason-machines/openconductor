// parity:diff.comments-inline:ui parity:diff.comments-to-chat:ui parity:diff.navigation:ui parity:diff.comments-github:ui
// Inline review comments for the diff viewer: threads under the lines they
// end on, a composer opened by clicking a line number, replies, edit, delete,
// resolve, "add to chat", and next/previous comment through the keybinding
// registry (diff.nextComment / diff.previousComment). The Review button lives
// in the right panel (WorkspaceView). As in Conductor, "Add to chat" attaches
// each comment to the workspace chat's composer as a markdown file carrying the
// comment id (commentAttachment), and bodies render as markdown (commentMarkdown.ts).
// GitHub review comments on the workspace PR are synced in (commentsApi.ts,
// diff_comments_sync_github) and shown with author, Resolved / Outdated tags,
// suggested changes, Resolve (on GitHub) and Delete (here only, as Conductor
// does); they cannot be edited or replied to. Comments on the PR itself are
// listed from the Changes toolbar, so no file has to be open.
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { openUrl } from "../../backend";
import { DialogFrame } from "../../components/DialogFrame";
import { useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { commentStoreFor } from "./commentsApi.ts";
import {
  bodyParts,
  commentAnchorUpdates,
  type CommentAnchorPositions,
  canDeleteComment,
  commentAttachment,
  commentSource,
  commentTags,
  fileThreads,
  isRemoteThread,
  newLocalComment,
  hasPendingComments,
  pendingForAgent,
  prThreads,
  refreshOutdated,
  sideOf,
  suggestionRows,
  threadKey,
  threadsAt,
  threadsOf,
  type DiffComment,
  type Thread,
} from "./comments.ts";
import type { ComposerAttach } from "./chatAttachment.ts";
import { CommentMarkdown } from "./commentMarkdown.ts";
import type { GithubSyncReport } from "./commentStore.ts";
import "../chat/chat.css";
import "./comments-github.css";
import { revealLine, type LineAnchor, type LineRange } from "./FileDiffView";
import { commentTargets, stepComment } from "./nav.ts";
import type { DiffScope, FileDiff } from "./types.ts";

/** How the diff viewer reaches the workspace chat. */
export interface ChatBridge {
  /** Put text into the composer for the user to edit and send. */
  insert(text: string): void;
  /** Send a message to the workspace's own chat right away. */
  send(text: string): void;
}

interface Ops {
  reply(root: DiffComment, body: string): Promise<boolean>;
  edit(c: DiffComment, body: string): Promise<boolean>;
  remove(c: DiffComment): Promise<boolean>;
  resolve(t: Thread, resolved: boolean): Promise<boolean>;
  /** Resolve a GitHub review thread on GitHub; absent outside the app. */
  resolveOnGithub?(t: Thread): Promise<boolean>;
  toChat(cs: DiffComment[]): Promise<boolean>;
}

/** How often the open diff re-reads the PR's GitHub comments. */
const GITHUB_SYNC_MS = 120_000;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function Composer({ initial = "", edit, placeholder, submitLabel, onSubmit, onCancel }: { initial?: string; edit?: { text: string; onChange: (body: string) => void }; placeholder?: string; submitLabel: string; onSubmit: (body: string) => void; onCancel: () => void }) {
  const [localText, setLocalText] = useState(initial);
  const text = edit?.text ?? localText;
  const setText = edit?.onChange ?? setLocalText;
  const [discardOpen, setDiscardOpen] = useState(false);
  const composing = useRef(false);
  const dialogId = useId();
  const cancel = () => {
    const dirty = initial === "" ? text.trim() !== "" : text !== initial;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onCancel();
  };
  const submit = () => {
    if (text.trim()) onSubmit(text);
  };
  return (
    <div className="oc-composer">
      <textarea
        autoFocus
        rows={3}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onBlur={() => { composing.current = false; }}
        onKeyDown={(e) => {
          if (composing.current || e.nativeEvent?.isComposing || e.keyCode === 229 || e.which === 229) return;
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
      />
      <div className="oc-composer-bar">
        <span className="muted">⌘↵ to save · Esc to cancel</span>
        <span className="spacer" />
        <button className="btn btn-small" onClick={cancel}>
          Cancel
        </button>
        <button className="btn btn-primary btn-small" disabled={!text.trim()} onClick={submit}>
          {submitLabel}
        </button>
      </div>
      {discardOpen && (
        <DialogFrame kind="alert" className="project-confirmation" titleId={`${dialogId}-title`} descriptionId={`${dialogId}-description`} onClose={() => setDiscardOpen(false)}>
          <div className="project-confirmation-header">
            <h2 id={`${dialogId}-title`}>Discard comment?</h2>
            <div id={`${dialogId}-description`} className="project-confirmation-body">
              {initial === "" ? "This comment will be lost." : "Your changes to this comment will be lost."}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" data-dialog-cancel onClick={() => setDiscardOpen(false)}>Keep editing</button>
            <button type="button" className="btn btn-danger" onClick={() => { setDiscardOpen(false); onCancel(); }}>Discard</button>
          </div>
        </DialogFrame>
      )}
    </div>
  );
}

/** A ```suggestion block on GitHub, shown as the change it proposes. */
function SuggestedChange({ base, code }: { base: string; code: string }) {
  return (
    <div className="oc-suggestion">
      <div className="oc-suggestion-head">Suggested change</div>
      {suggestionRows(base, code).map((r, i) => (
        <div key={i} className={`oc-suggestion-row ${r.kind}`}>
          <span className="sign">{r.kind === "del" ? "-" : "+"}</span>
          {r.text}
        </div>
      ))}
    </div>
  );
}

const openLink = (href: string) => void openUrl(href);

function CommentBody({ c }: { c: DiffComment }) {
  return (
    <div className="oc-comment-body">
      {bodyParts(c.body, c.suggestion_base_code).map((p, i) => (p.kind === "text" ? <CommentMarkdown key={i} text={p.text} onOpenLink={openLink} /> : <SuggestedChange key={i} base={c.suggestion_base_code ?? ""} code={p.code} />))}
    </div>
  );
}

/** Avatar and login of a comment's GitHub author. */
function GithubCommentAuthor({ c }: { c: DiffComment }) {
  return (
    <span className="oc-gh-author">
      {c.author_avatar_url ? <img src={c.author_avatar_url} alt="" /> : <span className="oc-gh-avatar" />}
      <strong>{c.author ? `@${c.author}` : "GitHub"}</strong>
    </span>
  );
}

type CommentIdentity = Pick<DiffComment, "workspace_id" | "id">;
const commentEditDrafts = new Map<string, string>();
const commentEditListeners = new Set<() => void>();
const commentEditKey = (comment: CommentIdentity) => JSON.stringify([comment.workspace_id, comment.id]);
const notifyCommentEdit = () => commentEditListeners.forEach((listener) => listener());
const subscribeCommentEdit = (listener: () => void) => {
  commentEditListeners.add(listener);
  return () => { commentEditListeners.delete(listener); };
};

function useCommentEditDraft(comment: CommentIdentity): string | undefined {
  const key = commentEditKey(comment);
  return useSyncExternalStore(subscribeCommentEdit, () => commentEditDrafts.get(key), () => undefined);
}

function startCommentEdit(comment: CommentIdentity & Pick<DiffComment, "body">): void {
  const key = commentEditKey(comment);
  if (commentEditDrafts.has(key)) return;
  commentEditDrafts.set(key, comment.body);
  notifyCommentEdit();
}

function updateCommentEdit(comment: CommentIdentity, body: string): void {
  commentEditDrafts.set(commentEditKey(comment), body);
  notifyCommentEdit();
}

function discardCommentEdit(comment: CommentIdentity): void {
  if (commentEditDrafts.delete(commentEditKey(comment))) notifyCommentEdit();
}

function CommentItem({ c, ops }: { c: DiffComment; ops: Ops }) {
  const draft = useCommentEditDraft(c);
  const source = commentSource(c);
  if (draft !== undefined) return <Composer initial={c.body} edit={{ text: draft, onChange: (body) => updateCommentEdit(c, body) }} submitLabel="Save" onCancel={() => discardCommentEdit(c)} onSubmit={(b) => void ops.edit(c, b).then((ok) => ok && discardCommentEdit(c))} />;
  return (
    <div className="oc-comment">
      <div className="oc-comment-meta">
        {source === "remote" ? <GithubCommentAuthor c={c} /> : <strong>{c.author ?? "You"}</strong>}
        {c.end_line_number !== null && (
          <span className="muted">
            lines {c.line_number}–{c.end_line_number}
          </span>
        )}
        {commentTags(c).map((t) => (
          <span key={t} className="oc-tag">
            {t}
          </span>
        ))}
        {c.state === "sent" && <span className="oc-tag">In chat</span>}
        <span className="spacer" />
        {c.remote_url && (
          <a className="oc-link" href={c.remote_url} target="_blank" rel="noreferrer" title="Open this comment on GitHub">
            View on GitHub
          </a>
        )}
        {source === "user-local" && (
          <button className="oc-link" onClick={() => startCommentEdit(c)}>
            Edit
          </button>
        )}
        {/* Conductor offers Delete on GitHub and agent comments once they have left pending (see
            canDeleteComment). It removes the comment from its own list without asking; a GitHub comment
            stays on GitHub and comes back with the next sync. */}
        {canDeleteComment(c) &&
          (source === "user-local" ? (
            <button className="oc-link" onClick={() => void ops.remove(c)}>
              Delete
            </button>
          ) : (
            <button className="oc-link" aria-label="Delete comment" title={source === "remote" ? "Remove from OpenConductor; it stays on GitHub" : "Remove this comment"} onClick={() => void ops.remove(c)}>
              Delete
            </button>
          ))}
      </div>
      <CommentBody c={c} />
    </div>
  );
}

function ThreadView({ thread, ops, focused }: { thread: Thread; ops: Ops; focused: boolean }) {
  const resolved = thread.root.is_resolved;
  const [open, setOpen] = useState(!resolved);
  const [replying, setReplying] = useState(false);
  const [resolving, setResolving] = useState(false);
  useEffect(() => setOpen(!resolved), [resolved]);
  // GitHub threads are resolved on GitHub (there is no unresolve) and replies are not posted there.
  // PR-level GitHub comments have no thread to resolve.
  const remote = commentSource(thread.root) === "remote";
  const resolveRemote = isRemoteThread(thread) ? ops.resolveOnGithub : undefined;
  const all = [thread.root, ...thread.replies];
  const pending = pendingForAgent(all);
  return (
    <div className={`oc-thread${resolved ? " resolved" : ""}`} id={`oc-comment-${thread.root.id}`} data-focused={focused || undefined}>
      {!open ? (
        <button className="oc-thread-collapsed" onClick={() => setOpen(true)}>
          Resolved · {plural(all.length, "comment")} · <span className="muted">{thread.root.body.split("\n")[0]}</span>
        </button>
      ) : (
        <>
          {all.map((c) => (
            <CommentItem key={c.id} c={c} ops={ops} />
          ))}
          {replying ? (
            <Composer placeholder="Reply…" submitLabel="Reply" onCancel={() => setReplying(false)} onSubmit={(b) => void ops.reply(thread.root, b).then((ok) => ok && setReplying(false))} />
          ) : (
            (!remote || pending.length > 0 || (!resolved && resolveRemote)) && (
              <div className="oc-thread-bar">
                {!remote && (
                  <button className="btn btn-small" onClick={() => setReplying(true)}>
                    Reply
                  </button>
                )}
                {pending.length > 0 && (
                  <button className="btn btn-small" onClick={() => void ops.toChat(pending)} title="Attach this thread to the workspace chat">
                    Add to chat
                  </button>
                )}
                {!remote ? (
                  <button className="btn btn-small" onClick={() => void ops.resolve(thread, !resolved)}>
                    {resolved ? "Reopen" : "Resolve"}
                  </button>
                ) : (
                  !resolved &&
                  resolveRemote && (
                    <button
                      className="btn btn-small"
                      disabled={resolving}
                      title="Resolve this conversation on GitHub"
                      onClick={() => {
                        setResolving(true);
                        void resolveRemote(thread).finally(() => setResolving(false));
                      }}
                    >
                      {resolving ? "Resolving…" : "Resolve"}
                    </button>
                  )
                )}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

type Composing = LineRange & { path: string; workspaceId: string; id: string; body: string };

/** Conductor's toasts for review comments. */
export type Notify = (kind: "info" | "error", message: string) => void;

/** Comments on the PR itself, listed from the Changes toolbar so no file has to be open. */
function PrComments({ threads, prNumber, ops }: { threads: Thread[]; prNumber: number | null; ops: Ops }) {
  const [open, setOpen] = useState(false);
  if (threads.length === 0) return null;
  return (
    <span className="oc-pr-comments-pop">
      <button className="btn btn-small" aria-expanded={open} onClick={() => setOpen((v) => !v)} title="Comments on the pull request">
        PR comments <span className="tab-count">{threads.length}</span>
      </button>
      {open && (
        <div className="oc-pr-comments-panel" role="dialog" aria-label="Pull request comments">
          <div className="oc-pr-comments-head">
            <strong>{plural(threads.length, "comment")} on the pull request{prNumber ? ` #${prNumber}` : ""}</strong>
            <span className="spacer" />
            <button className="oc-link" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          <div className="oc-threads">
            {threads.map((t) => (
              <ThreadView key={t.root.id} thread={t} ops={ops} focused={false} />
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * Review comments for the diff views. `reveal` opens a file in the diff tab,
 * so comment navigation can move to another file. `chat.attach` must reach the
 * workspace's own chat (WorkspaceView routes it there); `notify` shows
 * Conductor's "Comment resolved on GitHub" / "Failed to …" messages.
 */
export function useReviewComments(workspaceId: string, chat: ChatBridge & ComposerAttach, reveal?: (path: string) => void, workspacePath: string | null = null, notify?: Notify) {
  const store = useMemo(() => commentStoreFor(workspaceId, workspacePath), [workspaceId, workspacePath]);
  const [stored, setStored] = useState<DiffComment[]>([]);
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [newDrafts, setComposing] = useState<Composing[]>([]);
  const composing = newDrafts.filter((draft) => draft.workspaceId === workspaceId);
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [github, setGithub] = useState<{ report?: GithubSyncReport; error?: string }>({});

  const reload = useCallback(() => store.list().then(setStored, (e: unknown) => setError(String(e))), [store]);
  useEffect(() => {
    setStored([]);
    setComposing([]);
    setFocused(null);
    void reload();
  }, [reload]);

  // Pull the PR's GitHub comments when the workspace opens and every couple of minutes after.
  useEffect(() => {
    const sync = store.syncGithub;
    if (!sync) return;
    let live = true;
    setGithub({});
    const once = () =>
      sync().then(
        (report) => {
          if (!live) return;
          setGithub({ report });
          if (report.changed > 0) void reload();
        },
        (e: unknown) => live && setGithub({ error: String(e) }),
      );
    void once();
    const timer = setInterval(() => void once(), GITHUB_SYNC_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [store, reload]);

  const run = (p: Promise<unknown>): Promise<boolean> =>
    p.then(
      async () => {
        setError(null);
        await reload();
        return true;
      },
      (e: unknown) => {
        setError(String(e));
        return false;
      },
    );

  const comments = useMemo(() => refreshOutdated(stored, files), [stored, files]);
  const threads = useMemo(() => threadsOf(comments), [comments]);
  const ready = pendingForAgent(comments);

  // One attachment per comment, as Conductor's addReviewCommentToComposer does.
  const toChat = (cs: DiffComment[]) => {
    if (cs.length === 0) return Promise.resolve(false);
    for (const c of cs) chat.attach(commentAttachment(c));
    return run(store.markSent(cs.map((c) => c.id))).then((ok) => {
      if (!ok) notify?.("error", cs.length === 1 ? "Failed to add comment to chat" : "Failed to add comments to chat");
      return ok;
    });
  };

  const resolveOnGithub = store.resolveOnGithub;

  const ops: Ops = {
    reply: (root, body) =>
      run(
        store.add(
          newLocalComment({
            id: crypto.randomUUID(),
            workspaceId,
            filePath: root.file_path,
            side: sideOf(root),
            fileLevel: root.file_level,
            start: root.line_number,
            end: root.end_line_number ?? undefined,
            body,
            now: Date.now(),
            replyTo: root,
          }),
        ),
      ),
    edit: (c, body) => run(store.edit(c.id, body).catch((e: unknown) => {
      notify?.("error", `Failed to save comment: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    })),
    remove: (c) => run(store.remove(c.id)),
    resolve: (t, resolved) => run(store.resolve(threadKey(t.root), resolved)),
    // Conductor: "Comment resolved on GitHub", or "Failed to resolve comment: <reason>".
    resolveOnGithub:
      resolveOnGithub &&
      ((t) =>
        resolveOnGithub(threadKey(t.root)).then(
          async () => {
            setError(null);
            await reload();
            notify?.("info", "Comment resolved on GitHub");
            return true;
          },
          (e: unknown) => {
            const message = `Failed to resolve comment: ${e instanceof Error ? e.message : String(e)}`;
            if (notify) notify("error", message);
            else setError(message);
            return false;
          },
        )),
    toChat,
  };

  const goToComment = (dir: 1 | -1) => {
    const t = stepComment(commentTargets(comments, files), focused, dir);
    if (!t) return;
    setFocused(t.id);
    const path = files[t.fileIndex].path;
    reveal?.(path);
    const root = comments.find((c) => c.id === t.id);
    // The diff tab shows one file: let it render the revealed file, then have its
    // virtualized view scroll the comment's line into the rendered window.
    requestAnimationFrame(() => {
      if (root && revealLine(path, { side: sideOf(root), line: t.line })) return;
      const el = document.getElementById(`oc-comment-${t.id}`) ?? document.getElementById(`oc-file-${encodeURIComponent(path)}`);
      el?.scrollIntoView({ block: "center" });
    });
  };

  useKeybindings({
    "diff.nextComment": () => goToComment(1),
    "diff.previousComment": () => goToComment(-1),
  });

  const onLineClick = (file: FileDiff, range: LineRange) => {
    const next = { path: file.path, ...range, workspaceId, id: crypto.randomUUID(), body: "" };
    setComposing((current) => {
      const existing = current.find((draft) => draft.workspaceId === workspaceId && draft.path === file.path && draft.side === range.side && draft.start === range.start && draft.line === range.line);
      const retained = current.filter((draft) => draft.workspaceId === workspaceId && draft.body !== "" && draft.id !== existing?.id);
      return [...retained, existing ?? next];
    });
  };
  const discardNewDraft = (draft: Composing) => setComposing((current) => current.filter((value) => value.id !== draft.id || value.body !== draft.body));
  // The composer's lines stay highlighted in the file until it is saved or cancelled.
  const commentRange = (file: FileDiff): LineRange | null => {
    const draft = composing.slice().reverse().find((value) => value.path === file.path);
    return draft ? { side: draft.side, start: draft.start, line: draft.line } : null;
  };

  // Lines with something rendered under them: each thread's last line, and the open composer.
  const anchors = (file: FileDiff): LineAnchor[] => {
    const out = new Map<string, LineAnchor>();
    for (const t of threads) {
      if (t.root.file_path !== file.path || t.root.file_level) continue;
      const a = { side: sideOf(t.root), line: t.root.end_line_number ?? t.root.line_number };
      const key = `${a.side}:${a.line}`;
      const existing = out.get(key);
      out.set(key, { ...a, commentIds: [...(existing?.commentIds ?? []), t.root.id, ...t.replies.map((c) => c.id)] });
    }
    for (const draft of composing) {
      if (draft.path !== file.path) continue;
      const key = `${draft.side}:${draft.line}`;
      if (!out.has(key)) out.set(key, { side: draft.side, line: draft.line });
    }
    return [...out.values()];
  };

  const persistAnchors = (file: FileDiff, positions: CommentAnchorPositions) => {
    const updates = commentAnchorUpdates(stored, file.path, positions);
    if (updates.length > 0) void run(store.updateAnchors(updates));
  };

  const annotations = (file: FileDiff, anchor: LineAnchor): ReactNode => {
    const here = threadsAt(threads, file.path, anchor.side, anchor.line);
    const draft = composing.slice().reverse().find((value) => value.path === file.path && value.side === anchor.side && value.line === anchor.line);
    if (here.length === 0 && !draft) return null;
    return (
      <div className="oc-threads">
        {here.map((t) => (
          <ThreadView key={t.root.id} thread={t} ops={ops} focused={focused === t.root.id} />
        ))}
        {draft && (
          <Composer
            key={draft.id}
            edit={{ text: draft.body, onChange: (body) => setComposing((current) => current.map((value) => value.id === draft.id ? { ...value, body } : value)) }}
            placeholder="Leave a comment for the agent…"
            submitLabel="Comment"
            onCancel={() => discardNewDraft(draft)}
            onSubmit={(body) =>
              void run(store.add(newLocalComment({ id: crypto.randomUUID(), workspaceId, filePath: file.path, side: anchor.side, start: draft.start, end: anchor.line, body, now: Date.now() }))).then(
                (ok) => ok && discardNewDraft(draft),
              )
            }
          />
        )}
      </div>
    );
  };

  /** Above a file's diff: comments on the PR itself, then threads on the file without a line. */
  const notes = (file: FileDiff): ReactNode => {
    const onPr = prThreads(threads);
    const onFile = fileThreads(threads, file.path);
    if (onPr.length === 0 && onFile.length === 0) return null;
    return (
      <div className="oc-file-notes">
        {onPr.length > 0 && (
          <details className="oc-pr-comments">
            <summary>
              {plural(onPr.length, "comment")} on the pull request{github.report?.pr_number ? ` #${github.report.pr_number}` : ""}
            </summary>
            <div className="oc-threads">
              {onPr.map((t) => (
                <ThreadView key={t.root.id} thread={t} ops={ops} focused={false} />
              ))}
            </div>
          </details>
        )}
        {onFile.length > 0 && (
          <div className="oc-threads">
            {onFile.map((t) => (
              <ThreadView key={t.root.id} thread={t} ops={ops} focused={focused === t.root.id} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const synced = github.report && github.report.pr_number !== null && !github.report.skipped ? github.report : undefined;

  const actions = (): ReactNode => (
    <>
      {github.error && (
        <span className="error" title={github.error}>
          GitHub comments failed
        </span>
      )}
      {synced && (
        <span className="muted" title={`Synced GitHub PR comments for #${synced.pr_number}`}>
          PR #{synced.pr_number} comments synced
        </span>
      )}
      {error && (
        <span className="error" title={error}>
          Comment failed
        </span>
      )}
      <PrComments threads={prThreads(threads)} prNumber={github.report?.pr_number ?? null} ops={ops} />
      {ready.length > 0 && (
        <button className="btn btn-small" onClick={() => void toChat(ready)} title={`Attach ${plural(ready.length, "comment")}, GitHub ones included, to the workspace chat`}>
          Add all comments to chat
        </button>
      )}
    </>
  );

  const onLoaded = useCallback((loaded: FileDiff[], _scope: DiffScope) => {
    setFiles(loaded);
  }, []);

  // The PR header's "changes requested" state offers "Add all comments to chat" while any comment is unsent.
  const hasPending = hasPendingComments(comments);
  const addAllToChat = () => void toChat(ready);

  return { onLineClick, commentRange, anchors, annotations, persistAnchors, notes, actions, onLoaded, hasPending, addAllToChat };
}
