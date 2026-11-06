// Repository-scope settings of a workspace (src-tauri/src/settings/effective.rs):
// `[prompts]`, the `[git]` flags, `preview_urls` and the environment, resolved
// user < repository shared < workspace shared < repository local < managed.
// Edits go to the repository's `.conductor/settings.local.toml`; the shared
// file is read-only in the app, as in Conductor.
import { invoke } from "@tauri-apps/api/core";
import type { PreviewUrl, PromptKind } from "./types.ts";

/** `oc_scripts::config::Layer`. */
export type Layer = "defaults" | "user" | "repo_shared" | "repo_local" | "managed";

export interface Sourced<T> {
  value: T;
  layer: Layer;
}

export interface EnvVar {
  value: string;
  source: { layer: Layer; origin: string; envFile?: string };
}

export interface EnvFileStatus {
  layer: Layer;
  entry: string;
  path: string;
  /** Variables read; null when the file is missing or unreadable. */
  loaded: number | null;
}

export interface ResolvedEnv {
  local: Record<string, EnvVar>;
  cloud: Record<string, EnvVar>;
  files: EnvFileStatus[];
  /** Names a settings file unsets with "<none>", and the layer that did. */
  unset?: { local: Record<string, Layer>; cloud: Record<string, Layer> };
}

export interface EffectiveSettings {
  prompts: Record<PromptKind, Sourced<string> | null>;
  git: {
    branch_prefix_type: Sourced<string> | null;
    branch_prefix: Sourced<string> | null;
    archive_on_merge: Sourced<boolean>;
    delete_branch_on_archive: Sourced<boolean>;
    worktree_push_auto_setup_remote: Sourced<boolean>;
  };
  previewUrls: Sourced<PreviewUrl[]> | null;
  environmentVariableFiles: Sourced<string[]> | null;
  /** "Files to copy": gitignore-style patterns, one per line (`file_include_globs`). */
  fileIncludeGlobs: Sourced<string> | null;
  env: ResolvedEnv;
  /** The environment of the user layer alone (user and managed files): what a repository overrides. */
  userEnv?: ResolvedEnv;
  warnings: string[];
}

/** Dotted keys the app writes to the repository local file. */
export type RepoLocalKey =
  | `prompts.${PromptKind}`
  | "git.archive_on_merge"
  | "git.delete_branch_on_archive"
  | "git.worktree_push_auto_setup_remote"
  | "git.branch_prefix"
  | "git.branch_prefix_type"
  | "preview_urls"
  | "environment_variable_files"
  | "file_include_globs"
  | "scripts.setup"
  | "scripts.archive"
  | `scripts.run.${string}`
  | `environment_variables.${string}`;

export function repoSettingsEffective(repoPath: string, workspacePath?: string): Promise<EffectiveSettings> {
  return invoke<EffectiveSettings>("repo_settings_effective", { repoPath, workspacePath: workspacePath ?? null });
}

/** Set a key, or clear it with `null`, in the repository local layer. */
export function repoSettingsSetLocal(repoPath: string, key: RepoLocalKey, value: unknown): Promise<EffectiveSettings> {
  return invoke<EffectiveSettings>("repo_settings_set_local", { repoPath, key, value });
}

/** Human label of a layer, for "set in ..." hints. */
export function layerLabel(layer: Layer): string {
  switch (layer) {
    case "defaults":
      return "default";
    case "user":
      return "your settings";
    case "repo_shared":
      return "repository settings.toml";
    case "repo_local":
      return "repository settings.local.toml";
    case "managed":
      return "managed settings";
  }
}
