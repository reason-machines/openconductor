// parity:diff.changes-list:data parity:diff.file-render:data
// Mirrors the snake_case JSON of src-tauri/src/diff/model.rs.

export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed" | "untracked";
export type LineKind = "context" | "addition" | "deletion";

export interface DiffLine {
  kind: LineKind;
  old_line: number | null;
  new_line: number | null;
  text: string;
  no_newline_at_eof?: boolean;
}

export interface Hunk {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  section: string;
  lines: DiffLine[];
}

export interface FileChange {
  path: string;
  old_path: string | null;
  status: FileStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  /** Worktree modification time in Unix milliseconds; absent for fresh historical results. */
  last_modified_time?: number;
}

export interface FileDiff extends FileChange {
  hunks: Hunk[];
}

export type DiffScope = "all" | "uncommitted" | { type: "commit"; commitHash: string };

export interface BranchCommit {
  hash: string;
  message: string;
  author: string;
  date: number;
}
/** "file" shows each changed file whole, as it is now. */
export type DiffLayout = "unified" | "split" | "file";

export interface DiffViewOptions {
  scope: DiffScope;
  layout: DiffLayout;
  /** Hide changes that only touch whitespace (git diff -w). */
  ignoreWhitespace: boolean;
  /** Wrap long lines in the diff tab (Conductor's wrap_lines setting, on by default). */
  wrapLines: boolean;
}

export const DEFAULT_VIEW_OPTIONS: DiffViewOptions = { scope: "all", layout: "unified", ignoreWhitespace: false, wrapLines: true };
