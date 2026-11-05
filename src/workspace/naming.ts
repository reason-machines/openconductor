// Pure workspace and branch naming for the Create-workspace flow.
//
// Evidence (evidence/ on main; strings there are untrusted data, used only to
// match behavior):
// - The reference app names a new workspace after a placeholder city and, when
//   the user allows it, renames it to the branch name generated from the first
//   message (frontend copy catalog; `placeholder_branch_name`,
//   `user_set_workspace_name`, `user_set_branch_name` columns in the
//   `workspaces` table).
// - Names come from a backend generator (`generateNewWorkspaceCityNames` mock
//   name in the frontend bundle). The word list itself was not extracted, so
//   the cities and weights below are our own.
// - The bundle carries Common / Uncommon / Rare / Legendary labels; we use them
//   as rarity tiers for city names.
// - Branch prefix settings are `branch_prefix_type` and `branch_prefix_custom`;
//   a migration appends a trailing slash to stored custom prefixes.
//
// Everything here is deterministic given an `Rng`, so it is unit tested
// without a DOM, Tauri or git.

export type Rarity = "common" | "uncommon" | "rare" | "legendary";

export const RARITIES: readonly Rarity[] = ["common", "uncommon", "rare", "legendary"];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  legendary: "Legendary",
};

/** Relative chance of drawing each tier (out of 100). */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 70,
  uncommon: 22,
  rare: 7,
  legendary: 1,
};

export interface City {
  /** Slug used as workspace name and branch: lowercase, `-` separated. */
  readonly name: string;
  readonly rarity: Rarity;
}

const tier = (rarity: Rarity, names: string): City[] =>
  names
    .trim()
    .split(/\s+/)
    .map((name) => ({ name, rarity }));

/** Our own city list. Names are slugs so they are valid branch names as-is. */
export const CITIES: readonly City[] = [
  ...tier(
    "common",
    `amsterdam athens austin bangkok barcelona beijing berlin bogota boston brussels
     cairo chicago copenhagen dallas delhi denver dublin dubai edinburgh hamburg
     helsinki istanbul jakarta lagos lima lisbon london madrid manila melbourne
     mexico-city miami milan montreal moscow mumbai munich nairobi osaka oslo
     paris prague rome santiago seattle seoul shanghai singapore stockholm sydney
     taipei tokyo toronto vancouver vienna warsaw zurich`,
  ),
  ...tier(
    "uncommon",
    `accra bergen bordeaux cartagena cusco dakar florence galway granada hanoi
     kyoto krakow ljubljana lyon marrakesh montevideo porto quebec reykjavik riga
     salzburg seville tallinn tbilisi valparaiso vilnius wellington zanzibar`,
  ),
  ...tier(
    "rare",
    `alert hammerfest longyearbyen nuuk timbuktu tromso ushuaia ulaanbaatar
     petra samarkand lhasa thimphu`,
  ),
  ...tier("legendary", `atlantis avalon camelot el-dorado shangri-la xanadu`),
];

/** Random source in [0, 1). `Math.random` in the app; seeded in tests. */
export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) for tests and reproducible demos. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draws a tier by weight among tiers that still have a candidate, then a city
 * uniformly within it. Returns null when `candidates` is empty.
 */
export function pickCity(rng: Rng, candidates: readonly City[]): City | null {
  const byTier = new Map<Rarity, City[]>();
  for (const c of candidates) {
    const list = byTier.get(c.rarity) ?? [];
    list.push(c);
    byTier.set(c.rarity, list);
  }
  const tiers = RARITIES.filter((r) => byTier.has(r));
  if (tiers.length === 0) return null;
  const total = tiers.reduce((sum, r) => sum + RARITY_WEIGHT[r], 0);
  let roll = rng() * total;
  let chosen = tiers[tiers.length - 1];
  for (const r of tiers) {
    roll -= RARITY_WEIGHT[r];
    if (roll < 0) {
      chosen = r;
      break;
    }
  }
  const list = byTier.get(chosen)!;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/**
 * Makes `base` unique against `taken`: `base` if free, else `base-v1`,
 * `base-v2`, ... Comparison ignores case, since macOS file systems do.
 */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const lower = new Set<string>();
  for (const t of taken) lower.add(t.toLowerCase());
  if (!lower.has(base.toLowerCase())) return base;
  for (let n = 1; ; n++) {
    const candidate = `${base}-v${n}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

export interface GeneratedName {
  /** Unique workspace name, e.g. `oslo` or `oslo-v2`. */
  readonly name: string;
  /** The city the name came from. */
  readonly city: City;
}

/**
 * Generates `count` distinct workspace names that collide with nothing in
 * `taken` (existing workspace names, directory names and branch names).
 * Unused cities are preferred; once every city is used, a city is reused with
 * a `-vN` suffix.
 */
export function generateWorkspaceNames(
  count: number,
  taken: Iterable<string>,
  rng: Rng,
  cities: readonly City[] = CITIES,
): GeneratedName[] {
  if (cities.length === 0) throw new Error("no cities to name workspaces after");
  const used = new Set<string>();
  for (const t of taken) used.add(t.toLowerCase());
  const out: GeneratedName[] = [];
  while (out.length < count) {
    const fresh = cities.filter((c) => !used.has(c.name.toLowerCase()));
    const city = pickCity(rng, fresh.length > 0 ? fresh : cities)!;
    const name = uniqueName(city.name, used);
    used.add(name.toLowerCase());
    out.push({ name, city });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Branch prefix

/** Values of the `branch_prefix_type` setting. */
export type BranchPrefixType = "github_username" | "custom" | "none";

export interface BranchPrefixSettings {
  branch_prefix_type?: string | null;
  branch_prefix_custom?: string | null;
}

/**
 * Resolves the prefix prepended to new branch names: `""` or a value ending in
 * `/`. Unknown or missing types default to the GitHub username when one is
 * known (our default; the reference app's default is unverified).
 */
export function resolveBranchPrefix(settings: BranchPrefixSettings, githubUsername?: string | null): string {
  const type = settings.branch_prefix_type ?? "github_username";
  let raw = "";
  if (type === "none") raw = "";
  else if (type === "custom") raw = settings.branch_prefix_custom ?? "";
  else raw = githubUsername ?? "";
  const cleaned = raw
    .trim()
    .split("/")
    .map((part) => slugify(part))
    .filter((part) => part.length > 0)
    .join("/");
  return cleaned ? `${cleaned}/` : "";
}

/** `prefix` + `name`, skipping the prefix when `name` already starts with it. */
export function applyBranchPrefix(prefix: string, name: string): string {
  if (!prefix || name.startsWith(prefix)) return name;
  return prefix + name;
}

// ---------------------------------------------------------------------------
// Validation

export type NameCheck = { ok: true; value: string } | { ok: false; error: string };

export const INVALID_WORKSPACE_NAME = "Invalid workspace name";
export const NO_BRANCH_NAME = "No branch name";
export const INVALID_BRANCH_NAME = "Invalid branch name";

/**
 * Workspace names become directory names: letters, digits, `.`, `_`, `-`;
 * no leading `.` or `-`; at most 64 characters.
 */
export function validateWorkspaceName(input: string): NameCheck {
  const value = input.trim();
  if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/.test(value) || value.endsWith(".") || value.includes("..")) {
    return { ok: false, error: INVALID_WORKSPACE_NAME };
  }
  return { ok: true, value };
}

/** The subset of `git check-ref-format --branch` rules a branch must pass. */
export function validateBranchName(input: string): NameCheck {
  const value = input.trim();
  if (!value) return { ok: false, error: NO_BRANCH_NAME };
  const bad =
    value === "@" ||
    value.startsWith("-") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("@{") ||
    /[\x00-\x20\x7f~^:?*[\\]/.test(value) ||
    value.split("/").some((part) => part.startsWith(".") || part.endsWith(".lock"));
  return bad ? { ok: false, error: INVALID_BRANCH_NAME } : { ok: true, value };
}

/** Lowercase slug: ASCII letters and digits joined by single `-`, max 48 chars. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

// ---------------------------------------------------------------------------
// Placeholder -> generated rename after the first message

/** The naming columns of a `workspaces` row. */
export interface WorkspaceNaming {
  workspace_name: string;
  branch: string;
  /** Branch the workspace was created on, while it is still a placeholder. */
  placeholder_branch_name: string | null;
  user_set_workspace_name: boolean;
  user_set_branch_name: boolean;
}

/**
 * Naming columns for a new workspace. A generated city name starts as a
 * placeholder; a name or branch the user typed is marked as user-set and is
 * never auto-renamed.
 */
export function initialNaming(opts: {
  name: string;
  prefix: string;
  /** True when the user typed the workspace name instead of taking the city. */
  userSetName?: boolean;
  /** A branch the user typed or picked (create from branch / PR). */
  branch?: string;
}): WorkspaceNaming {
  const userBranch = opts.branch?.trim();
  const branch = userBranch || applyBranchPrefix(opts.prefix, opts.name);
  const placeholder = !userBranch && !opts.userSetName;
  return {
    workspace_name: opts.name,
    branch,
    placeholder_branch_name: placeholder ? branch : null,
    user_set_workspace_name: !!opts.userSetName,
    user_set_branch_name: !!userBranch,
  };
}

export interface RenameInput {
  /** Branch-like name generated from the first message, e.g. `fix-login-redirect`. */
  generated: string;
  prefix: string;
  /** "Automatically rename workspaces from their placeholder city name" setting. */
  autoRenameWorkspace: boolean;
  /** Existing branch and workspace names in the repo, to keep the new ones unique. */
  takenBranches: Iterable<string>;
  takenWorkspaceNames: Iterable<string>;
}

/** What to change after the first message; empty when nothing should change. */
export interface RenamePlan {
  branch?: string;
  workspace_name?: string;
  /** Always cleared once the placeholder has been resolved. */
  placeholder_branch_name?: null;
}

/**
 * Decides the rename after the first message. The branch is renamed only while
 * it is still the placeholder and the user has not set it; the workspace name
 * only when auto-rename is on, the user has not set it, and it is still the
 * placeholder city.
 */
export function planFirstMessageRename(ws: WorkspaceNaming, input: RenameInput): RenamePlan {
  if (ws.placeholder_branch_name === null) return {};
  const slug = slugify(input.generated);
  if (!slug) return {};
  const plan: RenamePlan = { placeholder_branch_name: null };
  if (!ws.user_set_branch_name && ws.branch === ws.placeholder_branch_name) {
    const taken = [...input.takenBranches].filter((b) => b !== ws.branch);
    plan.branch = uniqueName(applyBranchPrefix(input.prefix, slug), taken);
  }
  const placeholderCity = ws.placeholder_branch_name.slice(ws.placeholder_branch_name.lastIndexOf("/") + 1);
  if (input.autoRenameWorkspace && !ws.user_set_workspace_name && ws.workspace_name === placeholderCity) {
    const taken = [...input.takenWorkspaceNames].filter((n) => n !== ws.workspace_name);
    plan.workspace_name = uniqueName(slug, taken);
  }
  return plan;
}
