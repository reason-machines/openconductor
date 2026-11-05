// Pure helpers behind the prompt, git and environment rows (no React, no IPC).
import type { EffectiveSettings, EnvVar, Layer, RepoLocalKey } from "../repoSettings.ts";
import type { PromptKind } from "../types.ts";

/** A repository Actions row: Conductor's copy (renderApp registry, `S6e` and the General row). */
export interface PromptRowSpec {
  kind: PromptKind;
  title: string;
  description: string;
  placeholder?: string;
}

/**
 * The Actions rows OpenConductor shows: those whose prompt something here
 * sends (evidence/settings/NOTES.md, "Consumers in the rebuild"). Conductor
 * also has Fix errors, Resolve conflicts and Branch rename preferences; their
 * actions are not built, so their rows are not shown.
 */
export const PROMPT_ROWS: PromptRowSpec[] = [
  {
    kind: "code_review",
    title: "Code review preferences",
    description: "Add custom instructions sent to the agent when you click the Review button.",
  },
  {
    kind: "create_pr",
    title: "Create PR preferences",
    description: "Add custom instructions sent to the agent when you click the Create PR button.",
  },
  {
    kind: "general",
    title: "General preferences",
    description: "Add custom instructions sent to the agent at the start of every new chat.",
    placeholder: "Add custom instructions for all agents working in this repo.",
  },
];

/** Conductor's default placeholder for the prompt textareas (`vzi`). */
export const PROMPT_PLACEHOLDER =
  "Add your preferences here. The agent will be told to prioritize these instructions over its default instructions.";

/**
 * What saving a prompt textarea writes to the repository local file: the
 * trimmed text, or `null` to remove the key when it is blank (Conductor
 * deletes a blank string setting). `null` result: nothing to write.
 */
export function promptWrite(kind: PromptKind, saved: string | undefined, draft: string): { key: RepoLocalKey; value: string | null } | null {
  const next = draft.trim();
  if (next === (saved ?? "").trim()) return null;
  return { key: `prompts.${kind}`, value: next === "" ? null : next };
}

/** `environment_variable_files` from the textarea: one path per line (Conductor's `hda`). */
export function parseEnvFiles(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** "1 variable loaded" / "N variables loaded" (Conductor's `mda`), or why none were. */
export function envFileStatus(loaded: number | null): string {
  if (loaded === null) return "File not found";
  return loaded === 1 ? "1 variable loaded" : `${loaded} variables loaded`;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Why `name` cannot be an environment variable name, or null. */
export function envNameError(name: string): string | null {
  if (name.trim() === "") return "Enter a name.";
  return NAME.test(name.trim()) ? null : "Use letters, digits and _, not starting with a digit.";
}

export type EnvContext = "local" | "cloud";

export interface EnvRow {
  name: string;
  context: EnvContext;
  value: string;
  layer: Layer;
  envFile?: string;
  /** Defined in the repository local file, so this page can remove it. */
  removable: boolean;
}

/** Effective variables per context, sorted by name, with where each came from. */
export function envRows(settings: EffectiveSettings): EnvRow[] {
  const rows: EnvRow[] = [];
  for (const context of ["local", "cloud"] as const) {
    const vars: Record<string, EnvVar> = settings.env[context];
    for (const name of Object.keys(vars).sort()) {
      const v = vars[name];
      rows.push({
        name,
        context,
        value: v.value,
        layer: v.source.layer,
        envFile: v.source.envFile,
        removable: v.source.layer === "repo_local" && v.source.envFile === undefined,
      });
    }
  }
  return rows;
}
