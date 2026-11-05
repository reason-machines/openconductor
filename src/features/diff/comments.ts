// parity:diff.comments-inline:data parity:diff.comments-to-chat:ui parity:diff.comments-github:data
// Review comments on diff lines. Field names mirror the columns of Conductor's
// `diff_comments` table (evidence/sqlite/conductor.schema.sql) so the Rust
// store can persist rows as-is. Stored `state`/`location` values follow an REA
// inspection of a column-only snapshot of Conductor's diff_comments (1,508 rows,
// evidence/sqlite/diff-comments-values.json): state was always "pending";
// location was "file" (file-level) or "modified" (new side). "base" for the old
// side and the "sent" state are our own: neither occurred in the data.
import type { FileDiff } from "./types.ts";

/** Which side of the diff a comment is anchored to, as the UI sees it. */
export type CommentSide = "old" | "new";
/** Stored anchor: "modified" (new side), "base" (old side, inferred), "file" (whole file). */
export type CommentLocation = "modified" | "base" | "file";
/** `pending`: saved, not yet sent to the agent. `sent`: added to the chat (ours). */
export type CommentState = "pending" | "sent";

export function locationOf(side: CommentSide): CommentLocation {
  return side === "old" ? "base" : "modified";
}

/** UI side of a stored comment; file-level comments sit on the new side. */
export function sideOf(c: Pick<DiffComment, "location">): CommentSide {
  return c.location === "base" ? "old" : "new";
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

/** Any comment not yet sent to the agent, on lines still in the diff and not resolved: the reference's
 *  header flag for "Add all comments to chat" (renderApp `Wus`: `state === "pending"`, not outdated, not resolved). */
export function hasPendingComments(comments: Pick<DiffComment, "state" | "is_outdated" | "is_resolved">[]): boolean {
  return comments.some((c) => c.state === "pending" && !c.is_outdated && !c.is_resolved);
}

/** Comments that "add all comments to chat" would send. PR-level GitHub comments have no file and stay out. */
export function pendingForAgent(comments: DiffComment[]): DiffComment[] {
  return comments.filter((c) => c.state === "pending" && !c.is_resolved && !c.is_outdated && c.body.length > 0 && c.file_path !== "");
}

/** Text handed to the agent composer: location, the commented code, then the note.
 *  A reply that follows its thread's earlier comment is quoted as a reply, without repeating the code. */
export function formatForAgent(comments: DiffComment[], files: FileDiff[]): string {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const seen = new Set<string>();
  return comments
    .map((c) => {
      const key = c.thread_id ?? c.id;
      if (seen.has(key)) return `> Reply: ${c.body}`;
      seen.add(key);
      const end = c.end_line_number ?? c.line_number;
      if (c.file_level) return `${c.file_path}:\n${c.body}`;
      const range = end === c.line_number ? `line ${c.line_number}` : `lines ${c.line_number}-${end}`;
      const where = `${c.file_path} ${range}${c.location === "base" ? " (removed code)" : ""}`;
      const lines = byPath.get(c.file_path) ? sideLines(byPath.get(c.file_path)!, sideOf(c)) : new Map<number, string>();
      const code: string[] = [];
      for (let n = c.line_number; n <= end; n++) if (lines.has(n)) code.push(lines.get(n)!);
      const quoted = code.length ? `\n\`\`\`\n${code.join("\n")}\n\`\`\`` : "";
      return `${where}:${quoted}\n${c.body}`;
    })
    .join("\n\n");
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
