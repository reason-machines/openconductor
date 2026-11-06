// Per-agent options on Settings › Agents, as Conductor 0.87.6 renders them
// (renderApp-D_fmY7hW.js, read with REA's extracted frontend; see
// evidence/settings/agent-options.md). Pure, so node --test covers it.

import type { CodexPersonality, Settings } from "./types";

export type OptionAgent = "claude" | "codex";

/** `mGt`'s props per agent: the label in its copy, and the binary `which` looks up. */
export const EXECUTABLES: Record<OptionAgent, { key: "claude_code_executable_path" | "codex_executable_path"; label: string; binary: string }> = {
  claude: { key: "claude_code_executable_path", label: "Claude Code", binary: "claude" },
  codex: { key: "codex_executable_path", label: "Codex", binary: "codex" },
};

/** Conductor's copy for the executable-path row (`mGt`), with OpenConductor in place of Conductor. */
export function executableCopy(agent: OptionAgent) {
  const { label, binary } = EXECUTABLES[agent];
  return {
    title: `${label} executable path`,
    description: `Override the bundled ${label} executable with a custom one. Leave empty to use the bundled version (recommended).`,
    browseTitle: `Select ${label} executable`,
    reset: `Reset to bundled ${label}`,
    useSystem: `Use system ${label}`,
    warning: "Changing this may cause issues if the executable is not compatible with OpenConductor.",
    fallbackPlaceholder: `/usr/local/bin/${binary}`,
  };
}

/** The stored override: Conductor saves the raw text and treats blank as unset (`XA`). */
export function storedExecutable(s: Settings, agent: OptionAgent): string {
  return s[EXECUTABLES[agent].key] ?? "";
}

/** A copy of `s` with the override set; blank (after trimming) unsets it. */
export function withExecutable(s: Settings, agent: OptionAgent, value: string): Settings {
  return { ...s, [EXECUTABLES[agent].key]: value.trim() === "" ? null : value };
}

/** `xN`: anything but `none` / `friendly` / `pragmatic` (unset included) shows as Pragmatic. */
export function codexPersonality(s: Settings): CodexPersonality {
  const v = s.models.codex.personality;
  return v === "none" || v === "friendly" || v === "pragmatic" ? v : "pragmatic";
}

/** Config file cards (`Nzi`): Claude's and Codex's own settings files. */
export const CONFIG_FILES: Record<OptionAgent, { title: string; displayPath: string }> = {
  claude: { title: "Claude settings", displayPath: "~/.claude/settings.json" },
  codex: { title: "Codex config", displayPath: "~/.codex/config.toml" },
};

/** The Chrome row's text (`Rpa`); the two link phrases are buttons in the UI. */
export const CHROME_ROW = {
  title: "Use Claude Code with Chrome",
  extensionUrl: "https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn",
  docsUrl: "https://code.claude.com/docs/en/chrome",
};
