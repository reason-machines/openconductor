// Which sidebar repo an added or cloned repository is already the same as.
// Conductor never refuses a repository that is already added: cloning the same
// remote again lands in a new `<name>-v1` folder and becomes a second project,
// and opening an added folder again adds a `<name>-v1` project on the same
// folder (evidence/screens/duplicate-repo.md). So only the same record counts:
// the backend id when there is one (add_repository gives every add a new id),
// else the same folder in the browser shell. A matching remote alone is a
// different project.
import type { Repo } from "./types";

export function sameRepoRecord(repos: Repo[], added: { id?: string; path?: string }): Repo | undefined {
  if (added.id) return repos.find((r) => r.id === added.id);
  const norm = (p: string) => p.replace(/[\\/]+$/, "");
  return added.path ? repos.find((r) => !!r.path && norm(r.path) === norm(added.path!)) : undefined;
}
