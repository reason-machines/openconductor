// The create composer's "Target branch" popover (Conductor's `U4a`, renderApp-D_fmY7hW.js
// @10,977,729) around the branch combobox `EJe` (@2,930,626), read as data: an
// icon-only "…" trigger, then "Target branch" beside a combobox whose list is
// searched with "Select target branch...", shows "Loading branches...",
// "Couldn't load branches." / Try again, "No branch found." and a "default" badge.

export const TARGET_BRANCH = "Target branch";
export const SEARCH_PLACEHOLDER = "Select target branch...";
export const LOADING_BRANCHES = "Loading branches...";
export const LOAD_FAILED = "Couldn't load branches.";
export const NO_BRANCH = "No branch found.";

/**
 * The combobox rows: every branch once (the chosen one first if the list
 * lacks it, so it never disappears), filtered by `query` case-insensitively.
 */
export function branchOptions(names: readonly string[], value: string, query: string): string[] {
  const seen = new Set<string>();
  const all = names.includes(value) || !value ? names : [value, ...names];
  const q = query.trim().toLowerCase();
  const out: string[] = [];
  for (const n of all) {
    if (seen.has(n)) continue;
    seen.add(n);
    if (!q || n.toLowerCase().includes(q)) out.push(n);
  }
  return out;
}

/**
 * The trigger's text: `<remote>/<branch>` when the repository has a remote, as
 * `EJe` shows `${remoteName}/${value}`; the remote comes from the branch list.
 */
export function branchDisplay(value: string, branches: readonly { name: string; remote: string | null }[]): string {
  const remote = branches.find((b) => b.name === value && b.remote)?.remote ?? branches.find((b) => b.remote)?.remote;
  return remote ? `${remote}/${value}` : value;
}
