// parity:diff.comments-inline:data parity:diff.comments-to-chat:ui parity:diff.comments-github:data
// Review comments on diff lines. Field names mirror the columns of Conductor's
// `diff_comments` table (evidence/sqlite/conductor.schema.sql) so the Rust
// store can persist rows as-is. Stored `state`/`location` values follow an REA
// inspection of a column-only snapshot of Conductor's diff_comments (1,508 rows,
// evidence/sqlite/diff-comments-values.json): state was always "pending";
// location was "file" (file-level) or "modified" (new side). The old side is
// "original", the value Conductor's GitHub sync writes for a LEFT-side thread
// and its agent note reads (evidence/diff/comments-to-chat.md); rows we stored
// before as "base" are read as "original". The "sent" state is our own.
import type { TextAttachment } from "./chatAttachment.ts";
import type { FileDiff } from "./types.ts";

/** Which side of the diff a comment is anchored to, as the UI sees it. */
export type CommentSide = "old" | "new";
/** Stored anchor: "modified" (new side), "original" (old side), "file" (whole file). */
export type CommentLocation = "modified" | "original" | "file";
/** `pending`: saved, not yet sent to the agent. `sent`: added to the chat (ours). */
export type CommentState = "pending" | "sent";

export function locationOf(side: CommentSide): CommentLocation {
  return side === "old" ? "original" : "modified";
}

/** A stored location, reading our earlier "base" for the old side as "original". */
export function parseLocation(raw: string): CommentLocation {
  return raw === "base" || raw === "original" ? "original" : raw === "file" ? "file" : "modified";
}

/** Rows as stored, with legacy "base" locations read as "original". */
export function migrateLocations(rows: DiffComment[]): DiffComment[] {
  return rows.map((c) => (c.location === parseLocation(c.location) ? c : { ...c, location: parseLocation(c.location) }));
}

/** UI side of a stored comment; file-level comments sit on the new side. */
export function sideOf(c: Pick<DiffComment, "location">): CommentSide {
  return c.location === "original" ? "old" : "new";
}

export interface DiffComment {
  id: string;
  workspace_id: string;
  file_path: string;
  /** First line of the commented range (1-based, on `location`'s side). */
  line_number: number;
  /** Last line of a multi-line range; null for a single line. */
  end_line_number: number | null;
  body: string;
  state: CommentState;
  location: CommentLocation;
  /** Comment on the whole file rather than a line range. */
  file_level: boolean;
  created_at: number;
  updated_at: number | null;
  /** Set for comments synced from a GitHub pull request. */
  remote_url: string | null;
  author: string | null;
  author_avatar_url: string | null;
  thread_id: string | null;
  reply_to_comment_id: string | null;
  is_outdated: boolean;
  is_resolved: boolean;
  /** Original code a GitHub suggestion replaces. */
  suggestion_base_code: string | null;
}

export type CommentAnchorPositions = ReadonlyMap<string, number | null>;
export type CommentAnchorUpdate = Pick<DiffComment, "id" | "line_number" | "end_line_number">;

export function commentAnchorUpdates(comments: DiffComment[], path: string, positions: CommentAnchorPositions): CommentAnchorUpdate[] {
  const updates: CommentAnchorUpdate[] = [];
  for (const comment of comments) {
    if (comment.file_path !== path || comment.file_level || comment.remote_url !== null) continue;
    const line = positions.get(comment.id);
    if (line == null) continue;
    const delta = line - (comment.end_line_number ?? comment.line_number);
    if (delta === 0) continue;
    updates.push({
      id: comment.id,
      line_number: comment.line_number + delta,
      end_line_number: comment.end_line_number === null ? null : comment.end_line_number + delta,
    });
  }
  return updates;
}

export interface NewComment {
  id: string;
  workspaceId: string;
  filePath: string;
  side: CommentSide;
  /** Comment on the whole file; start/end are ignored. */
  fileLevel?: boolean;
  start: number;
  end?: number;
  body: string;
  now: number;
  replyTo?: DiffComment;
}

export function newLocalComment(c: NewComment): DiffComment {
  const end = !c.fileLevel && c.end !== undefined && c.end !== c.start ? Math.max(c.start, c.end) : null;
  return {
    id: c.id,
    workspace_id: c.workspaceId,
    file_path: c.filePath,
    line_number: c.fileLevel ? 0 : end === null ? c.start : Math.min(c.start, c.end ?? c.start),
    end_line_number: end,
    body: c.body.trim(),
    state: "pending",
    location: c.fileLevel ? "file" : locationOf(c.side),
    file_level: c.fileLevel ?? false,
    created_at: c.now,
    updated_at: null,
    remote_url: null,
    author: null,
    author_avatar_url: null,
    thread_id: c.replyTo ? (c.replyTo.thread_id ?? c.replyTo.id) : null,
    reply_to_comment_id: c.replyTo?.id ?? null,
    is_outdated: false,
    is_resolved: false,
    suggestion_base_code: null,
  };
}

export interface Thread {
  root: DiffComment;
  replies: DiffComment[];
}

/** Group comments into threads: a root plus its replies, oldest first. */
export function threadsOf(comments: DiffComment[]): Thread[] {
  const byTime = [...comments].sort((a, b) => a.created_at - b.created_at);
  const roots = new Map<string, Thread>();
  for (const c of byTime) if (!c.reply_to_comment_id) roots.set(c.thread_id ?? c.id, { root: c, replies: [] });
  for (const c of byTime) {
    if (!c.reply_to_comment_id) continue;
    const t = roots.get(c.thread_id ?? c.reply_to_comment_id);
    if (t) t.replies.push(c);
    else roots.set(c.id, { root: c, replies: [] }); // orphaned reply: show it on its own
  }
  return [...roots.values()];
}

/** Threads rendered under a line: the ones whose range ends on it. */
export function threadsAt(threads: Thread[], path: string, side: CommentSide, line: number): Thread[] {
  return threads.filter((t) => t.root.file_path === path && !t.root.file_level && sideOf(t.root) === side && (t.root.end_line_number ?? t.root.line_number) === line);
}

function sideLines(file: FileDiff, side: CommentSide): Map<number, string> {
  const out = new Map<number, string>();
  for (const l of file.hunks.flatMap((h) => h.lines)) {
    const n = side === "old" ? l.old_line : l.new_line;
    if (n !== null) out.set(n, l.text);
  }
  return out;
}

/** Local comments whose lines are no longer in the diff become outdated. GitHub ones keep GitHub's flag. */
export function refreshOutdated(comments: DiffComment[], files: FileDiff[]): DiffComment[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  return comments.map((c) => {
    if (c.remote_url) return c;
    const file = byPath.get(c.file_path);
    if (c.file_level) return c.is_outdated === !file ? c : { ...c, is_outdated: !file };
    const lines = file ? sideLines(file, sideOf(c)) : new Map<number, string>();
    const outdated = !lines.has(c.line_number) || !lines.has(c.end_line_number ?? c.line_number);
    return outdated === c.is_outdated ? c : { ...c, is_outdated: outdated };
  });
}

/** A comment "Add all comments to chat" sends: saved, not yet in the chat, neither resolved nor outdated,
 *  with text. GitHub and PR-level comments count, as in Conductor's addAllGithubCommentsToChat. */
function isPendingForAgent(c: DiffComment): boolean {
  return c.state === "pending" && !c.is_resolved && !c.is_outdated && c.body.length > 0;
}

/** The header flag for "Add all comments to chat" (the reference's renderApp `Wus`: pending, not outdated,
 *  not resolved). Uses `pendingForAgent`'s filter, so the button never shows with nothing to send. */
export function hasPendingComments(comments: DiffComment[]): boolean {
  return comments.some(isPendingForAgent);
}

/** Comments "Add all comments to chat" sends. */
export function pendingForAgent(comments: DiffComment[]): DiffComment[] {
  return comments.filter(isPendingForAgent);
}

/** Conductor's chip name for a comment attachment: `file.ts +12`, `file.ts +12-14`, the file,
 *  `@author` for a PR-level comment, else the start of the body. */
export function attachmentName(c: DiffComment): string {
  const clean = (s: string) => s.replace(/⟧/g, "]");
  const file = c.file_path.split("/").pop() || c.file_path;
  if (file) {
    if (c.file_level || c.line_number <= 0) return clean(file);
    const end = c.end_line_number;
    return clean(end !== null && end > c.line_number ? `${file} +${c.line_number}-${end}` : `${file} +${c.line_number}`);
  }
  if (c.author) return clean(`@${c.author}`);
  if (c.body) {
    const head = clean(c.body.slice(0, 30).replace(/\n/g, " "));
    return head.length < c.body.length ? `${head}...` : head;
  }
  return "Comment";
}

/** The markdown file the agent receives for one comment: where it is, who left it, then the body. */
export function attachmentText(c: DiffComment): string {
  const source = commentSource(c);
  const onFile = c.file_path !== "";
  const end = c.end_line_number;
  const lines = c.file_level || c.line_number <= 0 ? "Unknown" : end !== null && end > c.line_number ? `${c.line_number}-${end}` : `${c.line_number}`;
  const where = !onFile
    ? "This comment was left on the pull request itself, not on a file."
    : c.file_level || c.location === "file"
      ? "This comment was left on a file."
      : c.location === "original"
        ? "This comment was left on the base branch."
        : "This comment was left on the modified branch.";
  const who =
    source === "remote"
      ? c.author
        ? `This comment was left on GitHub by @${c.author}.`
        : "This comment was left on GitHub."
      : source === "agent-local"
        ? `This comment was left locally by ${c.author}. It is not a GitHub review thread.`
        : "This comment was created locally in OpenConductor by the user. It is not a GitHub review thread.";
  const thread =
    source === "remote" && c.thread_id
      ? c.reply_to_comment_id
        ? `This comment is a reply in GitHub thread ${c.thread_id} to comment ${c.reply_to_comment_id}.`
        : `This comment is the start of GitHub thread ${c.thread_id}.`
      : undefined;
  const meta = [
    source === "remote" ? `GitHub review comment ID: ${c.id}` : `OpenConductor local comment ID: ${c.id}`,
    onFile ? `File: ${c.file_path}` : undefined,
    onFile ? `Lines: ${lines}` : undefined,
    where,
    who,
    thread,
    c.remote_url ? `Remote URL: ${c.remote_url}` : undefined,
    `Outdated: ${c.is_outdated ? "yes" : "no"}`,
    `Resolved: ${c.is_resolved ? "yes" : "no"}`,
  ].filter((l): l is string => l !== undefined);
  return `${meta.join("\n")}\n\n## Comment\n\n${c.body.trim()}\n`;
}

/** A comment as a chat attachment carrying its comment id (Conductor's `review` attachment). */
export function commentAttachment(c: DiffComment): TextAttachment {
  return { name: attachmentName(c), text: attachmentText(c), commentId: c.id };
}

export function markSent(comments: DiffComment[], ids: Set<string>, now: number): DiffComment[] {
  return comments.map((c) => (ids.has(c.id) ? { ...c, state: "sent", updated_at: now } : c));
}

export function editComment(comments: DiffComment[], id: string, body: string, now: number): DiffComment[] {
  return comments.map((c) => (c.id === id ? { ...c, body: body.trim(), updated_at: now } : c));
}

/** Deleting a root deletes its replies too. */
export function deleteComment(comments: DiffComment[], id: string): DiffComment[] {
  return comments.filter((c) => c.id !== id && c.reply_to_comment_id !== id && c.thread_id !== id);
}

export function setResolved(comments: DiffComment[], id: string, resolved: boolean, now: number): DiffComment[] {
  return comments.map((c) => (c.id === id ? { ...c, is_resolved: resolved, updated_at: now } : c));
}

/** Thread a comment belongs to: a reply's `thread_id`, or a root's own id. */
export function threadKey(c: Pick<DiffComment, "id" | "thread_id">): string {
  return c.thread_id ?? c.id;
}

/** Resolve or reopen a whole thread, as the Rust store's `set_thread_resolved` does. */
export function setThreadResolved(comments: DiffComment[], threadId: string, resolved: boolean, now: number): DiffComment[] {
  return comments.map((c) => (threadKey(c) === threadId ? { ...c, is_resolved: resolved, updated_at: now } : c));
}

// ---- GitHub comments (parity:diff.comments-github:ui) ----

/** Who a comment came from, as the reference tells them apart: a GitHub URL means GitHub,
 *  an author without one means an agent left it locally, otherwise the user did. */
export type CommentSource = "remote" | "agent-local" | "user-local";

export function commentSource(c: Pick<DiffComment, "remote_url" | "author">): CommentSource {
  return c.remote_url ? "remote" : c.author ? "agent-local" : "user-local";
}

/** Whether a comment card offers Delete. Conductor picks the card by state (renderApp 0.87.6 near byte
 *  9412604): a comment that is pending or ready_for_review, or sits in a composer, gets the card whose Delete
 *  is for the user's own comments only (`kVo`); any other state gets the card whose Delete is on every
 *  comment, GitHub included (`TVo`). Ours has one non-pending state, `sent`. Delete removes the local row
 *  only; GitHub sync puts a remote comment back while it is still on the PR. */
export function canDeleteComment(c: Pick<DiffComment, "remote_url" | "author" | "state">): boolean {
  return commentSource(c) === "user-local" || c.state !== "pending";
}

/** A thread synced from a GitHub review thread (resolvable on GitHub). */
export function isRemoteThread(t: Thread): boolean {
  return commentSource(t.root) === "remote" && t.root.thread_id !== null;
}

/** Comments on the pull request itself rather than a file. */
export function prThreads(threads: Thread[]): Thread[] {
  return threads.filter((t) => t.root.file_path === "");
}

/** Threads on a file without a line: whole-file comments and GitHub threads whose code moved on. */
export function fileThreads(threads: Thread[], path: string): Thread[] {
  return threads.filter((t) => t.root.file_path === path && t.root.file_level);
}

/** Tags shown on a comment: resolved wins over outdated, as in the reference. */
export function commentTags(c: Pick<DiffComment, "is_resolved" | "is_outdated">): ("Resolved" | "Outdated")[] {
  return c.is_resolved ? ["Resolved"] : c.is_outdated ? ["Outdated"] : [];
}

export type BodyPart = { kind: "text"; text: string } | { kind: "suggestion"; code: string };

const SUGGESTION = /^```suggestion[^\n]*\n([\s\S]*?)^```[ \t]*$/gm;

/** Split a comment body into text and ```suggestion blocks. Without the original code
 *  (`suggestion_base_code`) a suggestion cannot be shown as a change and stays text. */
export function bodyParts(body: string, suggestionBaseCode: string | null): BodyPart[] {
  if (suggestionBaseCode === null) return [{ kind: "text", text: body }];
  const parts: BodyPart[] = [];
  let at = 0;
  for (const m of body.matchAll(SUGGESTION)) {
    const before = body.slice(at, m.index).replace(/\n$/, "");
    if (before.trim()) parts.push({ kind: "text", text: before });
    parts.push({ kind: "suggestion", code: m[1].replace(/\n$/, "") });
    at = m.index + m[0].length;
  }
  const rest = body.slice(at).replace(/^\n/, "");
  if (rest.trim() || parts.length === 0) parts.push({ kind: "text", text: rest });
  return parts;
}

export interface SuggestionRow {
  kind: "del" | "add";
  text: string;
}

/** A suggested change as removed then added lines. An empty suggestion deletes the lines. */
export function suggestionRows(base: string, suggestion: string): SuggestionRow[] {
  const lines = (s: string) => (s === "" ? [] : s.split("\n"));
  return [...lines(base).map((text) => ({ kind: "del" as const, text })), ...lines(suggestion).map((text) => ({ kind: "add" as const, text }))];
}
