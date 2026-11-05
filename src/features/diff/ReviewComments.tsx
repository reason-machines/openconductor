// parity:diff.comments-inline:ui parity:diff.comments-to-chat:ui parity:diff.review:ui parity:diff.navigation:ui
// Inline review comments for the diff viewer: threads under the lines they
// end on, a composer opened by clicking a line number, replies, edit, delete,
// resolve, "add to chat", the Review button, and next/previous comment through
// the keybinding registry (diff.nextComment / diff.previousComment,
// workspace.showReview). Conductor attaches comments to the composer as
// attachments; until the agent runtime lands we insert them as text.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { commentStoreFor } from "./commentsApi.ts";
import { formatForAgent, newLocalComment, pendingForAgent, refreshOutdated, sideOf, threadKey, threadsAt, threadsOf, type DiffComment, type Thread } from "./comments.ts";
import type { LineAnchor } from "./FileDiffView";
import { commentTargets, stepComment } from "./nav.ts";
import { buildReviewPrompt } from "./review.ts";
import type { DiffScope, FileDiff } from "./types.ts";

/** How the diff viewer reaches the workspace chat. */
export interface ChatBridge {
  /** Put text into the composer for the user to edit and send. */
  insert(text: string): void;
  /** Send a message right away. */
  send(text: string): void;
}

interface Ops {
  reply(root: DiffComment, body: string): Promise<boolean>;
  edit(c: DiffComment, body: string): Promise<boolean>;
  remove(c: DiffComment): Promise<boolean>;
  resolve(t: Thread, resolved: boolean): Promise<boolean>;
  toChat(cs: DiffComment[]): Promise<boolean>;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function Composer({ initial = "", placeholder, submitLabel, onSubmit, onCancel }: { initial?: string; placeholder?: string; submitLabel: string; onSubmit: (body: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const cancel = () => {
    if (text.trim() && text.trim() !== initial.trim() && !window.confirm("Discard this comment? What you wrote will be lost.")) return;
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
        onKeyDown={(e) => {
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
    </div>
  );
}

function CommentItem({ c, ops }: { c: DiffComment; ops: Ops }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <Composer initial={c.body} submitLabel="Save" onCancel={() => setEditing(false)} onSubmit={(b) => void ops.edit(c, b).then((ok) => ok && setEditing(false))} />;
  return (
    <div className="oc-comment">
      <div className="oc-comment-meta">
        <strong>{c.author ?? "You"}</strong>
        {c.end_line_number !== null && (
          <span className="muted">
            lines {c.line_number}–{c.end_line_number}
          </span>
        )}
        {c.is_outdated && <span className="oc-tag">Outdated</span>}
        {c.state === "sent" && <span className="oc-tag">In chat</span>}
        {c.remote_url && (
          <a href={c.remote_url} target="_blank" rel="noreferrer">
            GitHub
          </a>
        )}
        <span className="spacer" />
        {!c.remote_url && (
          <>
            <button className="oc-link" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="oc-link" onClick={() => window.confirm(c.reply_to_comment_id ? "Delete this reply?" : "Delete this comment and its replies?") && void ops.remove(c)}>
              Delete
            </button>
          </>
        )}
      </div>
      <div className="oc-comment-body">{c.body}</div>
    </div>
  );
}

function ThreadView({ thread, ops, focused }: { thread: Thread; ops: Ops; focused: boolean }) {
  const resolved = thread.root.is_resolved;
  const [open, setOpen] = useState(!resolved);
  const [replying, setReplying] = useState(false);
  useEffect(() => setOpen(!resolved), [resolved]);
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
            <div className="oc-thread-bar">
              <button className="btn btn-small" onClick={() => setReplying(true)}>
                Reply
              </button>
              {pending.length > 0 && (
                <button className="btn btn-small" onClick={() => void ops.toChat(pending)} title="Put this thread into the chat composer">
                  Add to chat
                </button>
              )}
              <button className="btn btn-small" onClick={() => void ops.resolve(thread, !resolved)}>
                {resolved ? "Reopen" : "Resolve"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type Composing = LineAnchor & { path: string };

/** Props for DiffViewer that add review comments and the Review button. */
export function useReviewComments(workspaceId: string, chat: ChatBridge, customReviewPrompt?: string | null) {
  const store = useMemo(() => commentStoreFor(workspaceId), [workspaceId]);
  const [stored, setStored] = useState<DiffComment[]>([]);
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [scope, setScope] = useState<DiffScope>("all");
  const [composing, setComposing] = useState<Composing | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => store.list().then(setStored, (e: unknown) => setError(String(e))), [store]);
  useEffect(() => {
    setStored([]);
    setComposing(null);
    setFocused(null);
    void reload();
  }, [reload]);

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

  const toChat = (cs: DiffComment[]) => {
    if (cs.length === 0) return Promise.resolve(false);
    chat.insert(formatForAgent(cs, files));
    return run(store.markSent(cs.map((c) => c.id)));
  };

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
    edit: (c, body) => run(store.edit(c.id, body)),
    remove: (c) => run(store.remove(c.id)),
    resolve: (t, resolved) => run(store.resolve(threadKey(t.root), resolved)),
    toChat,
  };

  const review = () => chat.send(buildReviewPrompt(scope, customReviewPrompt));

  const goToComment = (dir: 1 | -1) => {
    const t = stepComment(commentTargets(comments, files), focused, dir);
    if (!t) return;
    setFocused(t.id);
    const el = document.getElementById(`oc-comment-${t.id}`) ?? document.getElementById(`oc-file-${encodeURIComponent(files[t.fileIndex].path)}`);
    el?.scrollIntoView({ block: "center" });
  };

  useKeybindings({
    "diff.nextComment": () => goToComment(1),
    "diff.previousComment": () => goToComment(-1),
    "workspace.showReview": review,
  });

  const onLineClick = (file: FileDiff, anchor: LineAnchor) => setComposing({ path: file.path, ...anchor });

  const annotations = (file: FileDiff, anchor: LineAnchor): ReactNode => {
    const here = threadsAt(threads, file.path, anchor.side, anchor.line);
    const composeHere = composing?.path === file.path && composing.side === anchor.side && composing.line === anchor.line;
    if (here.length === 0 && !composeHere) return null;
    return (
      <div className="oc-threads">
        {here.map((t) => (
          <ThreadView key={t.root.id} thread={t} ops={ops} focused={focused === t.root.id} />
        ))}
        {composeHere && (
          <Composer
            placeholder="Leave a comment for the agent…"
            submitLabel="Comment"
            onCancel={() => setComposing(null)}
            onSubmit={(body) =>
              void run(store.add(newLocalComment({ id: crypto.randomUUID(), workspaceId, filePath: file.path, side: anchor.side, start: anchor.line, body, now: Date.now() }))).then(
                (ok) => ok && setComposing(null),
              )
            }
          />
        )}
      </div>
    );
  };

  const actions = (): ReactNode => (
    <>
      {error && (
        <span className="error" title={error}>
          Comment failed
        </span>
      )}
      {ready.length > 0 && (
        <button className="btn btn-small" onClick={() => void toChat(ready)} title="Put every pending comment into the chat composer">
          Add {plural(ready.length, "comment")} to chat
        </button>
      )}
      <button className="btn btn-small" onClick={review} title="Ask the agent to review these changes">
        Review
      </button>
    </>
  );

  const onLoaded = useCallback((loaded: FileDiff[], s: DiffScope) => {
    setFiles(loaded);
    setScope(s);
  }, []);

  return { onLineClick, annotations, actions, onLoaded };
}
