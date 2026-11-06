// The repository Environment page (`/settings/repos/$repoId/environment`) as
// Conductor 0.87.6 builds it: the same panel as the user page (`zda`) with the
// settings target `{scope:"workspace-template", locality:"local", repoId}`
// (renderApp-D_fmY7hW.js, the `environment-panel` row). Pure functions, so the
// rules are tested without the backend:
//
// - Which variables the page lists, and where each is shown: `nGt` builds the
//   effective list (stored user variables, then settings files, then managed),
//   `fOt` / `A$i` split it into this repository's own (`repo-local` and
//   managed), "Inherited from Repo shared" and "Inherited from User", and `Ada`
//   adds the user's variables this repository overrides, dimmed.
// - Row order and actions (`Oda`, `zZn`, `VZn`, `BZn`).
// - Validation copy of the add sheet (`Mda`) and the edit sheet (`T$i`).
// - Env file paths picked in the file dialog (`MZn`) and the per-file count
//   (`mda`).
//
// Strings and code read out of Conductor are reference data only.
import { DOCUMENTED_VARS } from "./documentedVars.ts";
import type { EffectiveSettings, Layer } from "./repoSettings.ts";

/** A variable stored on the user Environment page (`env_vars`, scope shared, context local). */
export interface StoredVar {
  key: string;
  value: string;
}

/** Conductor's `A$i`: which settings level a variable's value comes from. */
export type EnvLevel = "managed" | "repo-local" | "repo-shared" | "user";

export interface EnvEntry {
  key: string;
  value: string;
  level: EnvLevel;
  /** The settings file that set it, or that listed its env file; absent for a stored variable. */
  origin?: string;
  /** The env file it was read from (Conductor's `valueOrigin: "env-file"`). */
  envFile?: string;
}

export interface EnvRow {
  name: string;
  value?: string;
  description?: string;
  level?: EnvLevel;
  origin?: string;
  envFile?: string;
  canEdit: boolean;
  canDelete: boolean;
  /** A user variable this repository overrides (Conductor's `dimmedKeys`). */
  dimmed?: boolean;
}

/** The value Conductor writes to unset an inherited variable (`pN`). */
export const UNSET_VALUE = "<none>";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function levelOf(layer: Layer): EnvLevel {
  switch (layer) {
    case "managed":
      return "managed";
    case "repo_local":
      return "repo-local";
    case "repo_shared":
      return "repo-shared";
    default:
      return "user";
  }
}

/**
 * Conductor's `nGt` for the local context of a repository: stored user
 * variables first; a variable a repository file unsets with "<none>" hides
 * the stored one; a settings-file value replaces a stored one unless it comes
 * from the user's own env files; managed values win.
 */
export function effectiveEntries(env: EffectiveSettings["env"], stored: StoredVar[]): EnvEntry[] {
  const out = new Map<string, EnvEntry>(stored.map((s) => [s.key, { key: s.key, value: s.value, level: "user" }]));
  for (const [key, layer] of Object.entries(env.unset?.local ?? {})) if (layer !== "user") out.delete(key);
  for (const [key, v] of Object.entries(env.local)) {
    if (v.source.layer === "user" && out.has(key)) continue;
    out.set(key, { key, value: v.value, level: levelOf(v.source.layer), origin: v.source.origin, envFile: v.source.envFile });
  }
  return [...out.values()];
}

export interface RepoEnvSections {
  /** This repository's own variables and managed ones: the editable table. */
  current: EnvEntry[];
  /** "Inherited from Repo shared". */
  repoShared: EnvEntry[];
  /** "Inherited from User", with the keys this repository overrides dimmed. */
  user: EnvEntry[];
  dimmedUserKeys: Set<string>;
}

/** Conductor's `fOt` (target level `repo-local`) and `Ada` (`isRepoScope`). */
export function repoEnvSections(entries: EnvEntry[], userScope: EnvEntry[]): RepoEnvSections {
  const current: EnvEntry[] = [];
  const repoShared: EnvEntry[] = [];
  const user: EnvEntry[] = [];
  for (const e of entries) {
    if (e.level === "managed" || e.level === "repo-local") current.push(e);
    else if (e.level === "repo-shared") repoShared.push(e);
    else user.push(e);
  }
  const levels = new Map(entries.map((e) => [e.key, e.level]));
  const overridden = userScope.filter((e) => e.level !== "managed" && (levels.get(e.key) ?? "user") !== "user");
  return { current, repoShared, user: [...user, ...overridden], dimmedUserKeys: new Set(overridden.map((e) => e.key)) };
}

/**
 * What the user's own level holds (Conductor's list for target
 * `{scope:"user"}`), from the backend's `userEnv`: stored variables over the
 * user's env files, managed values last.
 */
export function userScopeEntries(userEnv: EffectiveSettings["env"], stored: StoredVar[]): EnvEntry[] {
  return effectiveEntries(userEnv, stored);
}

const description = new Map(DOCUMENTED_VARS.map((d) => [d.name, d.description]));

function row(e: EnvEntry, editable: boolean): EnvRow {
  return {
    name: e.key,
    value: e.value,
    description: description.get(e.key),
    level: e.level,
    origin: e.origin,
    envFile: e.envFile,
    canEdit: editable,
    canDelete: editable,
  };
}

/** Documented variables first in Conductor's order (`R$i`), then the rest by name. */
function ordered(entries: EnvEntry[], editable: (e: EnvEntry) => boolean): EnvRow[] {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const known = DOCUMENTED_VARS.flatMap((d) => (byKey.has(d.name) ? [row(byKey.get(d.name)!, editable(byKey.get(d.name)!))] : []));
  const rest = entries
    .filter((e) => !description.has(e.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((e) => row(e, editable(e)));
  return [...known, ...rest];
}

/**
 * Conductor's `Oda` for the repository level: the variables set here
 * (settings-file values before env-file ones), and the documented variables
 * that are not, shown on "Show documented variables (N)" as "Not set".
 * Everything but a managed value can be edited and deleted (`VZn`).
 */
export function currentRows(current: EnvEntry[]): { setEntries: EnvRow[]; documentedEntries: EnvRow[] } {
  const editable = (e: EnvEntry) => e.level !== "managed";
  const setEntries = [...ordered(current.filter((e) => !e.envFile), editable), ...ordered(current.filter((e) => e.envFile), editable)];
  const set = new Set(current.map((e) => e.key));
  const documentedEntries = DOCUMENTED_VARS.filter((d) => !set.has(d.name)).map((d) => ({ name: d.name, description: d.description, canEdit: false, canDelete: false }));
  return { setEntries, documentedEntries };
}

/** Conductor's `BZn`: a read-only inherited table, settings-file values before env-file ones, then by name. */
export function inheritedRows(entries: EnvEntry[], dimmed?: Set<string>): EnvRow[] {
  return [...entries]
    .sort((a, b) => (a.envFile && !b.envFile ? 1 : !a.envFile && b.envFile ? -1 : a.key.localeCompare(b.key)))
    .map((e) => ({ ...row(e, false), dimmed: dimmed?.has(e.key) ?? false }));
}

/** Conductor's `Jzt`: the short name of a level in "From …". */
export function levelLabel(level: EnvLevel): string {
  switch (level) {
    case "repo-local":
      return "local";
    case "repo-shared":
      return "shared";
    case "user":
      return "user";
    case "managed":
      return "managed";
  }
}

/** Conductor's `T$i` save check in the edit sheet; null when the edit can be saved. */
export function editError(name: string, editingName: string, existing: string[]): string | null {
  const n = name.trim();
  if (!n) return "Variable name is required.";
  if (!NAME.test(n)) return "Variable names must start with a letter or underscore and contain only letters, numbers, and underscores.";
  if (existing.some((e) => e === n && e !== editingName)) return "That variable already exists.";
  return null;
}

/** Conductor's `Mda` for the add sheet at the repository level (one context, local). */
export function addError(entries: StoredVar[], existing: Set<string>): string | null {
  if (entries.some((e) => !e.key)) return "Variable name is required.";
  const bad = entries.map((e) => e.key).filter((k) => !NAME.test(k));
  if (bad.length > 0) return `Invalid variable ${bad.length === 1 ? "name" : "names"} ${bad.join(", ")}. Names must start with a letter or underscore and contain only letters, numbers, and underscores.`;
  const taken = entries.map((e) => e.key).filter((k) => existing.has(k));
  if (taken.length === 0) return null;
  return entries.length === 1 ? "That variable already exists in local." : `These variables already exist: ${taken.join(", ")}. Remove them from your pasted text and try again.`;
}

/** The settings-file key a repository variable is written under: top level, both contexts (Conductor's `YBe` / `s$e`). */
export function repoVarKey(name: string): `environment_variables.${string}` {
  return `environment_variables.${name}`;
}

/** Conductor's `mda`. */
export function loadedLabel(n: number): string {
  return n === 1 ? "1 variable loaded" : `${n} variables loaded`;
}

/**
 * Variables each env-file entry contributes to the effective list, keyed by
 * the entry as written (Conductor counts `envFilePath`s of the effective
 * entries, so a variable a later file or layer replaces is not counted).
 */
export function envFileCounts(env: EffectiveSettings["env"]): Map<string, number> {
  const pathOf = new Map(env.files.map((f) => [f.path, f.entry]));
  const counts = new Map<string, number>();
  for (const v of Object.values(env.local)) {
    const entry = v.source.envFile !== undefined ? pathOf.get(v.source.envFile) : undefined;
    if (entry !== undefined) counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }
  return counts;
}

function parts(p: string): string[] {
  return p.split("/").filter((s) => s.length > 0);
}

/**
 * Conductor's `MZn` for a repository: a path typed or picked in the file
 * dialog is kept as typed unless absolute; an absolute path is written
 * relative to `<repo>/.conductor` when it is inside it, else with `~` for the
 * home folder, else as is.
 */
export function repoEnvFilePath(raw: string, repoRoot: string, home: string): string {
  const path = raw.trim();
  if (!path.startsWith("/")) return path;
  const from = parts(`${repoRoot}/.conductor`);
  const to = parts(path);
  let i = 0;
  while (from[i] !== undefined && from[i] === to[i]) i += 1;
  const rel = [...from.slice(i).map(() => ".."), ...to.slice(i)].join("/") || ".";
  if (rel !== ".." && !rel.startsWith("../")) return rel;
  if (path === home) return "~";
  return path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path;
}

function backslashesBefore(s: string, end: number): number {
  let n = 0;
  for (let i = end; i >= 0 && s[i] === "\\"; i--) n++;
  return n;
}

/**
 * `KEY=VALUE` lines pasted into the name field (Conductor's `Q$e`, imported
 * into the sheet as `lPt`): `export ` is dropped, `#` lines skipped, a quoted
 * value may span lines and loses its quotes. Names are not checked here; the
 * sheet reports invalid ones. Empty when nothing was found.
 */
export function parsePasted(text: string): StoredVar[] {
  const out = new Map<string, string>();
  const lines = text.split("\n");
  for (let n = 0; n < lines.length; n++) {
    let l = lines[n].trim();
    if (!l || l.startsWith("#")) continue;
    if (l.startsWith("export ")) l = l.slice(7).trim();
    const i = l.indexOf("=");
    if (i === -1) continue;
    const key = l.slice(0, i).trim();
    if (!key) continue;
    let value = l.slice(i + 1).trim();
    if ((value.startsWith('"') || value.startsWith("'")) && value.length > 1) {
      const q = value[0];
      let from = 1;
      let close = -1;
      for (;;) {
        const d = value.indexOf(q, from);
        if (d === -1) {
          if (n + 1 < lines.length) {
            n++;
            value += `\n${lines[n]}`;
            continue;
          }
          break;
        }
        if (backslashesBefore(value, d - 1) % 2 === 0) {
          close = d;
          break;
        }
        from = d + 1;
      }
      if (close !== -1) value = value.slice(1, close).split(`\\${q}`).join(q).replace(/\\\\/g, "\\");
    }
    out.set(key, value);
  }
  return [...out].map(([key, value]) => ({ key, value }));
}

/** Variables the app sets itself (Conductor's `N7r`, with the `CONDUCTOR_` prefixes of `Txe`, named for OpenConductor). */
const APP_MANAGED = new Set([
  "CONDUCTOR_API_URL",
  "CONDUCTOR_BASE_DIR",
  "CONDUCTOR_INTERNAL_CLOUD_ENV_JSON",
  "CONDUCTOR_IS_LOCAL",
  "CONDUCTOR_ROOT_PATH",
  "CONDUCTOR_WORKSPACE_NAME",
  "CONDUCTOR_WORKSPACE_ID",
  "CONDUCTOR_WORKSPACE_PATH",
  "HOME",
  "NODE_PATH",
  "PATH",
  "PORT",
]);

/** Conductor's `Het`: why a repository may not set `name`, or null. Blocks Save in the add sheet. */
export function managedNameWarning(name: string): string | null {
  const n = name.trim();
  if (!(n.startsWith("CONDUCTOR_INTERNAL_") || n.startsWith("CONDUCTOR_GIT_AUTH_") || APP_MANAGED.has(n))) return null;
  return n === "PATH" ? "PATH is managed by OpenConductor. Update it in the cloud computer install script using ~/.bash_profile." : `${n} is managed by OpenConductor and can’t be set here.`;
}
