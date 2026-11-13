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

/** Returns an error message, or null when the custom prefix is valid. */
export function branchPrefixError(prefix: string): string | null {
  const p = prefix.trim();
  if (p === "") return "Enter a prefix.";
  const bad =
    /^[./-]/.test(p) ||
    p.endsWith("/") ||
    p.endsWith(".lock") ||
    p.includes("..") ||
    p.includes("//") ||
    p.includes("@{") ||
    /[\u0000-\u001f\u007f-\u009f ~^:?*[\\]/.test(p);
  return bad ? "Use letters, numbers, -, . and /; no spaces, \"..\", or a trailing / or .lock." : null;
}

/**
 * The branch a new workspace called `name` gets, computed by the same
 * resolver the Create-workspace flow uses, so the preview never disagrees
 * with the branch actually created.
 */
export function branchPreview(s: Settings, githubUser: string | null, name = "tokyo"): string {
  return applyBranchPrefix(resolveBranchPrefix(s.git, githubUser), name);
}

/** Remove implicit trailing slashes without hiding an invalid dot-ending component. */
export const normalizeCustomPrefix = (v: string): string => {
  const p = v.trim();
  return /\.\/+$/.test(p) ? p : p.replace(/\/+$/, "");
};

/** Only http(s) URLs are accepted for provider base URL overrides. */
export const baseUrlError = (v: string): string | null =>
  v.trim() === "" || /^https?:\/\/\S+$/.test(v.trim()) ? null : "Use an http:// or https:// URL.";
