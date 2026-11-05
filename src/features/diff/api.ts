// parity:diff.changes-list:command
// Loads a workspace diff from the Rust side (`diff_workspace`). In a plain
// browser (vite dev / preview) it returns a built-in sample so the viewer can
// be developed and checked without Tauri.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../../backend";
import type { DiffLine, DiffViewOptions, FileDiff } from "./types.ts";

export async function loadWorkspaceDiff(worktree: string | null, base: string, opts: DiffViewOptions): Promise<FileDiff[]> {
  if (!inTauri()) return sampleDiff(opts);
  if (!worktree) throw new Error("This workspace has no worktree on disk yet.");
  const scope = opts.scope === "all" ? { kind: "all", base } : { kind: "uncommitted" };
  const res = await invoke<{ files: FileDiff[] }>("diff_workspace", {
    repo: worktree,
    request: { scope, ignore_whitespace: opts.ignoreWhitespace, path: null },
  });
  return res.files;
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

/** Demo data for browser mode: one committed file, one uncommitted, one whitespace-only. */
export function sampleDiff(opts: DiffViewOptions): FileDiff[] {
  const committed = file("src/server/router.ts", "modified", [
    [12, 12, "export function route(req: Request) {", " const url = new URL(req.url);\n-  if (url.pathname === \"/health\") return ok();\n+  if (url.pathname === \"/healthz\") return ok();\n+  if (url.pathname === \"/ready\") return ready();\n   return notFound();"],
    [40, 41, "function notFound() {", " function notFound() {\n-  return new Response(\"missing\", { status: 404 });\n+  return new Response(\"not found\", { status: 404 });\n }"],
  ]);
  const added = file("src/server/ready.ts", "added", [[0, 1, "", "+export function ready() {\n+  return new Response(\"ready\");\n+}"]]);
  const spaced = file("README.md", "modified", opts.ignoreWhitespace ? [] : [[3, 3, "", " ## Usage\n-Run  the server with `npm start`.\n+Run the server with `npm start`."]]);
  const files = opts.scope === "all" ? [spaced, added, committed] : [spaced, added];
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
