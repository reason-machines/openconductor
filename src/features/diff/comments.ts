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

/** Comments that "add all comments to chat" would send. */
export function pendingForAgent(comments: DiffComment[]): DiffComment[] {
  return comments.filter((c) => c.state === "pending" && !c.is_resolved && !c.is_outdated && c.body.length > 0);
}

/** Text handed to the agent composer: location, the commented code, then the note. */
export function formatForAgent(comments: DiffComment[], files: FileDiff[]): string {
  const byPath = new Map(files.map((f) => [f.path, f]));
  return comments
    .map((c) => {
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
