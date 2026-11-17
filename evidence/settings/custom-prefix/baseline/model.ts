// Pure helpers for the settings UI (no React, no Tauri) so node --test covers them.
import { applyBranchPrefix, resolveBranchPrefix } from "../workspace/naming.ts";
import type { Settings } from "./types";

type Section = "general" | "git" | "models";

/** A copy of `s` with `section.field` set; other sections and unknown keys are kept. */
export function withField<S extends Section, K extends keyof Settings[S]>(
  s: Settings,
  section: S,
  field: K,
  value: Settings[S][K],
): Settings {
  return { ...s, [section]: { ...s[section], [field]: value } };
}

/** Empty or whitespace-only text input means "not set" (`null` over IPC). */
export const blankToNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

/**
 * Same rule as `valid_branch_prefix` in src-tauri/src/settings/validate.rs,
 * so the form can flag a bad prefix before the backend refuses it.
 * Returns an error message, or null when valid.
 */
export function branchPrefixError(prefix: string): string | null {
  const p = prefix.trim();
  if (p === "") return "Enter a prefix.";
  const bad =
    /^[./-]/.test(p) ||
    /[./]$/.test(p) ||
    p.endsWith(".lock") ||
    p.includes("..") ||
    p.includes("//") ||
    p.includes("@{") ||
    /[\u0000-\u001f\u007f-\u009f ~^:?*[\\]/.test(p);
  return bad ? "Use letters, numbers, - and /; no spaces, \"..\", or a trailing . or .lock." : null;
}

/**
 * The branch a new workspace called `name` gets, computed by the same
 * resolver the Create-workspace flow uses, so the preview never disagrees
 * with the branch actually created.
 */
export function branchPreview(s: Settings, githubUser: string | null, name = "tokyo"): string {
  return applyBranchPrefix(resolveBranchPrefix(s.git, githubUser), name);
}

/**
 * The Custom prefix as the backend stores it. Conductor's own hint suggests
 * `feature/`; our naming adds the `/` itself and the backend refuses a
 * trailing one, so it is dropped here instead of being rejected.
 */
export const normalizeCustomPrefix = (v: string): string => v.trim().replace(/\/+$/, "");

/** Only http(s) URLs are accepted for provider base URL overrides. */
export const baseUrlError = (v: string): string | null =>
  v.trim() === "" || /^https?:\/\/\S+$/.test(v.trim()) ? null : "Use an http:// or https:// URL.";
