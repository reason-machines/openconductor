// parity:sidebar.ws-diffstat
// The +/- counts on a sidebar row, as Conductor computes them (REA-extracted
// renderApp bundle on Sven's Mac, read as data): `FPt` sums the changed files'
// linesAdded/linesRemoved, skipping lockfiles by basename (`QNr`), and `$Fn`
// formats them compactly for the row (`compactCounts: true`).

/** Conductor's `QNr`: lockfiles left out of the sidebar's line counts. */
export const LOCKFILES: ReadonlySet<string> = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
  "bun.lockb",
  "bun.lock",
]);

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface DiffStat {
  added: number;
  removed: number;
}

export function isLockfile(path: string): boolean {
  return LOCKFILES.has(path.split("/").pop() ?? path);
}

/** Conductor's `FPt`: totals over every changed file except lockfiles. */
export function sumDiffStat(files: readonly ChangedFile[]): DiffStat {
  let added = 0;
  let removed = 0;
  for (const f of files) {
    if (isLockfile(f.path)) continue;
    added += f.additions;
    removed += f.deletions;
  }
  return { added, removed };
}

/** Conductor's `$Fn` with compact counts: 999, 1.2k, 12k, and ✱✱ above 99,000. */
export function compactCount(n: number): string {
  if (n > 99_000) return "✱✱";
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (n > 999) return `${(n / 1_000).toFixed(1).replace(".0", "")}k`;
  return `${n}`;
}
