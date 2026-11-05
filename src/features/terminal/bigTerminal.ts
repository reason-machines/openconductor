// Big terminal mode: Conductor's experimental "Create big terminals in the
// center pane with ⌘⇧T" (Settings › More › Experimental) and its "Big terminal"
// settings tab, which picks the command a new big terminal auto-runs
// (evidence/terminal/NOTES.md). This module is Conductor's preset table and
// command resolution, read from its frontend bundle as data; no DOM, so
// node --test covers it. Settings push the current config here.

export type BuiltInPreset = "claude" | "codex" | "opencode" | "amp" | "pi" | "copilot" | "gemini" | "none";
/** A built-in preset or `custom:<id>` for one of the user's custom commands. */
export type BigTerminalPreset = BuiltInPreset | `custom:${string}`;

export interface CustomCommand {
  id: string;
  command: string;
}

/** Paths set for the agents whose executable the user can override. */
export interface ExecutablePaths {
  claude?: string;
  codex?: string;
  opencode?: string;
}

/** What a preset runs when tool approvals are not required. */
const COMMANDS: Record<BuiltInPreset, string | undefined> = {
  claude: "claude --dangerously-skip-permissions",
  codex: 'codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access',
  opencode: "opencode",
  amp: "amp",
  pi: "pi",
  copilot: "copilot --allow-all",
  gemini: "gemini -y",
  none: undefined,
};

/** What a preset runs when the account or settings require tool approvals. */
const APPROVAL_COMMANDS: Record<BuiltInPreset, string | undefined> = {
  claude: "claude",
  codex: 'codex -c model_reasoning_effort="high"',
  opencode: "opencode",
  amp: "amp",
  pi: "pi",
  copilot: "copilot --allow-all",
  gemini: "gemini -y",
  none: undefined,
};

/** The presets the settings tab lists, in Conductor's order (it has no row for `pi`). */
export const PRESET_OPTIONS: readonly { value: BuiltInPreset; label: string }[] = [
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
  { value: "opencode", label: "OpenCode" },
  { value: "amp", label: "Amp" },
  { value: "copilot", label: "Copilot" },
  { value: "gemini", label: "Gemini" },
  { value: "none", label: "None" },
];

export const DEFAULT_PRESET: BuiltInPreset = "claude";

const isBuiltIn = (p: string): p is BuiltInPreset => Object.prototype.hasOwnProperty.call(COMMANDS, p);

export const customPreset = (id: string): BigTerminalPreset => `custom:${id}`;

/** The stored preset if it is one, else Claude. A `custom:` id need not exist; it then runs nothing. */
export function presetFrom(stored: string | null | undefined): BigTerminalPreset {
  if (stored && (isBuiltIn(stored) || stored.startsWith("custom:"))) return stored as BigTerminalPreset;
  return DEFAULT_PRESET;
}

/** Stored custom commands with the malformed entries dropped. Accepts the array or Conductor's JSON string. */
export function customCommandsFrom(stored: unknown): CustomCommand[] {
  let v = stored;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.flatMap((c) =>
    typeof c === "object" && c !== null && typeof c.id === "string" && typeof c.command === "string" ? [{ id: c.id, command: c.command }] : [],
  );
}

/** POSIX single-quoting, as Conductor quotes an executable path. */
export const shellQuote = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

const nonEmpty = (s: string | undefined): string | undefined => {
  const t = s?.trim();
  return t ? t : undefined;
};

/**
 * The command a new big terminal runs, or undefined for a plain shell. A
 * custom preset runs its command trimmed (nothing when empty or deleted). A
 * built-in one runs its command; with an executable path set for Claude,
 * Codex or OpenCode, the path (quoted) replaces the first word.
 */
export function bigTerminalCommand(opts: {
  preset: BigTerminalPreset;
  customCommands: readonly CustomCommand[];
  requiresToolApprovals: boolean;
  executablePaths?: ExecutablePaths;
}): string | undefined {
  const { preset } = opts;
  if (preset.startsWith("custom:")) {
    const id = preset.slice("custom:".length);
    return nonEmpty(opts.customCommands.find((c) => c.id === id)?.command);
  }
  if (!isBuiltIn(preset)) return undefined;
  const command = (opts.requiresToolApprovals ? APPROVAL_COMMANDS : COMMANDS)[preset];
  const path =
    preset === "claude" || preset === "codex" || preset === "opencode" ? nonEmpty(opts.executablePaths?.[preset]) : undefined;
  if (command === undefined || path === undefined) return command;
  const space = command.indexOf(" ");
  return space === -1 ? shellQuote(path) : `${shellQuote(path)}${command.slice(space)}`;
}

export interface BigTerminalConfig {
  enabled: boolean;
  preset: BigTerminalPreset;
  customCommands: CustomCommand[];
}

/** Removing the selected custom command moves the selection to the first one left, else Claude. */
export function afterDelete(config: Pick<BigTerminalConfig, "preset" | "customCommands">, id: string): Pick<BigTerminalConfig, "preset" | "customCommands"> {
  const customCommands = config.customCommands.filter((c) => c.id !== id);
  if (config.preset !== customPreset(id)) return { preset: config.preset, customCommands };
  return { preset: customCommands[0] ? customPreset(customCommands[0].id) : DEFAULT_PRESET, customCommands };
}

let current: BigTerminalConfig = { enabled: false, preset: DEFAULT_PRESET, customCommands: [] };

export const currentBigTerminal = (): BigTerminalConfig => current;

export function setBigTerminal(config: BigTerminalConfig): void {
  current = config;
}

/**
 * What ⌘⇧T does: nothing while the mode is off (Conductor leaves the key
 * unhandled), else open a terminal tab running the preset's command
 * (`undefined` command means a plain shell).
 */
export function bigTabRequest(config: BigTerminalConfig = current): { command: string | undefined } | null {
  if (!config.enabled) return null;
  // Our settings have no tool-approval switch and no executable paths yet, so neither applies.
  return { command: bigTerminalCommand({ preset: config.preset, customCommands: config.customCommands, requiresToolApprovals: false }) };
}
