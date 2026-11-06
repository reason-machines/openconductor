// parity:diff.changes-list:command
// Loads a workspace diff from the Rust side (`diff_workspace`). In a plain
// browser (vite dev / preview) it returns a built-in sample so the viewer can
// be developed and checked without Tauri.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../../backend";
import { scopeRequest, type DiffTarget } from "./target.ts";
import type { DiffLine, DiffScope, DiffViewOptions, FileChange, FileDiff } from "./types.ts";
import type { TurnRef } from "./turnChangesCache.ts";

/** Context large enough that each file comes back as one hunk covering the whole file. */
export const WHOLE_FILE_CONTEXT = 2 ** 31 - 1;

export interface LoadExtra {
  /** Load only this file. */
  path?: string;
  /** Unchanged lines around each change; the entire-file view asks for the whole file. */
  contextLines?: number;
  /** Show only what this chat turn changed (its start versus end checkpoint) instead of `opts.scope`. */
  turn?: TurnRef | null;
}

// Browser mode: sample files discarded this page load, so the flow can be tried without Tauri.
const discardedSamples = new Set<string>();

/** `target`: the workspace's target branch, which "All changes" is compared against (target.ts). */
export async function loadWorkspaceDiff(worktree: string | null, target: DiffTarget, opts: DiffViewOptions, extra: LoadExtra = {}): Promise<FileDiff[]> {
  const contextLines = extra.contextLines ?? (opts.layout === "file" ? WHOLE_FILE_CONTEXT : undefined);
  if (!inTauri()) {
    const files = (extra.turn ? sampleTurnDiff(opts) : sampleDiff(opts)).filter((f) => !discardedSamples.has(f.path));
    return extra.path ? files.filter((f) => f.path === extra.path) : files;
  }
  if (!worktree) throw new Error("This workspace has no worktree on disk yet.");
  const scope = extra.turn ? { kind: "turn", session_id: extra.turn.sessionId, turn_id: extra.turn.turnId } : scopeRequest(opts.scope, target);
  const res = await invoke<{ files: FileDiff[] }>("diff_workspace", {
    repo: worktree,
    request: { scope, ignore_whitespace: opts.ignoreWhitespace, path: extra.path ?? null, context_lines: contextLines ?? null },
  });
  return res.files;
}

// parity:diff.discard:command
/**
 * Put one file back the way it is at `scope`'s base: the merge base with the
 * target ref for "All changes", HEAD for "Uncommitted". Files the base lacks
 * are deleted; a rename restores the old path. Rust side: `diff_discard_file`.
 */
export async function discardFileChanges(worktree: string | null, target: DiffTarget, scope: DiffScope, file: Pick<FileDiff, "path" | "old_path">): Promise<void> {
  if (!inTauri()) {
    discardedSamples.add(file.path);
    return;
  }
  if (!worktree) throw new Error("This workspace has no worktree on disk yet.");
  await invoke("diff_discard_file", { repo: worktree, request: { scope: scopeRequest(scope, target), path: file.path, old_path: file.old_path ?? null } });
}

// parity:diff.turn-changes:command
/** The files one finished chat turn changed, with counts (Rust: `checkpoint_turn_changes`). */
export async function loadTurnChanges(ref: TurnRef, worktree: string): Promise<FileChange[]> {
  if (!inTauri()) return sampleTurnDiff({ scope: "uncommitted", layout: "unified", ignoreWhitespace: false, wrapLines: false }).map(({ hunks: _, ...change }) => change);
  return invoke<FileChange[]>("checkpoint_turn_changes", { repo: worktree, sessionId: ref.sessionId, turnId: ref.turnId });
}

function lines(spec: string, oldStart: number, newStart: number): DiffLine[] {
  let o = oldStart;
  let n = newStart;
  return spec.split("\n").map((raw) => {
    const m = raw[0];
    const text = raw.slice(1);
    if (m === "+") return { kind: "addition", old_line: null, new_line: n++, text };
    if (m === "-") return { kind: "deletion", old_line: o++, new_line: null, text };
    return { kind: "context", old_line: o++, new_line: n++, text };
  });
}

function file(path: string, status: FileDiff["status"], hunks: Array<[number, number, string, string]>): FileDiff {
  const built = hunks.map(([os, ns, section, spec]) => {
    const ls = lines(spec, os, ns);
    return {
      old_start: os,
      new_start: ns,
      old_lines: ls.filter((l) => l.kind !== "addition").length,
      new_lines: ls.filter((l) => l.kind !== "deletion").length,
      section,
      lines: ls,
    };
  });
  const all = built.flatMap((h) => h.lines);
  return {
    path,
    old_path: null,
    status,
    binary: false,
    additions: all.filter((l) => l.kind === "addition").length,
    deletions: all.filter((l) => l.kind === "deletion").length,
    hunks: built,
  };
}

/** Demo data for browser mode: what a sample agent turn changed. */
export function sampleTurnDiff(opts: DiffViewOptions): FileDiff[] {
  return sampleDiff({ ...opts, scope: "all" }).filter((f) => f.path !== "README.md");
}

/** Demo data for browser mode: one committed file, one uncommitted, one whitespace-only. */
export function sampleDiff(opts: DiffViewOptions): FileDiff[] {
  const committed = file("src/server/router.ts", "modified", [
    [12, 12, "export function route(req: Request) {", " const url = new URL(req.url);\n-  if (url.pathname === \"/health\") return ok();\n+  if (url.pathname === \"/healthz\") return ok();\n+  if (url.pathname === \"/ready\") return ready();\n   return notFound();"],
    [40, 41, "function notFound() {", " function notFound() {\n-  return new Response(\"missing\", { status: 404 });\n+  return new Response(\"not found\", { status: 404 });\n }"],
  ]);
  const added = file("src/server/ready.ts", "added", [[0, 1, "", "+export function ready() {\n+  return new Response(\"ready\");\n+}"]]);
  // Like the backend: hidden whitespace keeps the file and its counts, drops its hunks.
  const spacedFull = file("README.md", "modified", [[3, 3, "", " ## Usage\n-Run  the server with `npm start`.\n+Run the server with `npm start`."]]);
  const spaced = opts.ignoreWhitespace ? { ...spacedFull, hunks: [] } : spacedFull;
  const files = opts.scope === "all" ? [spaced, added, committed] : [spaced, added];
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
