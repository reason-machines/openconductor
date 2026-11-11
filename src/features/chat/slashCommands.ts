// Slash commands for the composer's "/" menu, as Conductor 0.87.6 builds it
// (renderApp-D_fmY7hW.js, evidence/chat/composer/README.md):
// - built-in commands `_qe`, each with an effect and the agents it works for,
//   plus "plan" (`_mo`) when the chat has plan mode and "fast" (`vmo`) when
//   the model offers Fast mode; "add-dir" is left out in a cloud workspace,
// - the agent's own commands (`slashCommands` the agent reports) come first
//   and hide a built-in of the same name,
// - the agent's skills follow the commands (`jI`), each keyed
//   `skill:<name>|<path>` and named by its display name; the filtered list
//   keeps commands before skills, and the menu heads the first skill with
//   "Skills" (`jNi`, `FNi`); evidence/chat/slash-menu/README.md,
// - the menu shows the items whose `supportedAgents` include the chat's
//   agent, filtered by fuzzysort on the name with exact matches first (`lj`,
//   `jNi`); an empty query keeps every item in order,
// - a typed message `/name args` (or `/[name](command) args`) runs the
//   command when its name is known (`gWn`).
// Pure: slashCommands.test.ts covers it.

import fuzzysort from "fuzzysort";
export { composerSlashRange } from "./composerSlashRange.ts";

/** The agent running the chat, as Conductor names it; Reason runs as an ACP agent. */
export type ComposerAgent = "claude" | "codex" | "acp";

export type SlashEffect =
  | "clear_session"
  | "restart_agent"
  | "pick_linked_directory"
  | "pick_personality"
  | "set_goal"
  | "show_mcp_status"
  | "open_terminal"
  | "compact_session"
  | "enable_ultracode"
  | "toggle_plan_mode"
  | "toggle_fast_mode"
  /** An agent-reported command: the agent runs it from the prompt text. */
  | "agent"
  /** An agent skill: picking it inserts `insert`, and the agent runs it from the prompt. */
  | "skill";

export interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;
  effect: SlashEffect;
  supportedAgents: ComposerAgent[];
  /** Unique in a command set; a skill's is `skill:<name>|<path>`. Defaults to the name. */
  id?: string;
  /** What picking it puts in the draft; defaults to `/name`. */
  insert?: string;
}

/** A skill the agent reports (Conductor's sidecar `skills` entries). */
export interface AgentSkillInput {
  name: string;
  description: string;
  path: string;
  displayName?: string;
}

export const SKILL_ID_PREFIX = "skill:";
export const isSkill = (c: SlashCommand): boolean => c.effect === "skill";
export const commandId = (c: SlashCommand): string => c.id ?? c.name;

/**
 * A skill as a menu item (Conductor's `jI`). Codex runs a skill named in the
 * prompt as `$name` (its own composer's mention); Reason and Claude Code as
 * `/name`.
 */
export function skillCommand(skill: AgentSkillInput, agent: ComposerAgent): SlashCommand {
  return {
    id: `${SKILL_ID_PREFIX}${skill.name}|${encodeURIComponent(skill.path)}`,
    name: skill.displayName ?? skill.name,
    description: skill.description,
    argumentHint: "",
    effect: "skill",
    supportedAgents: [agent],
    insert: `${agent === "codex" ? "$" : "/"}${skill.name}`,
  };
}

const BOTH: ComposerAgent[] = ["claude", "codex"];
export const ADD_DIR = "add-dir";

/** Conductor's `_qe`, in its order. */
export const BUILTIN_COMMANDS: readonly SlashCommand[] = [
  { name: "clear", description: "Close this tab and start a fresh chat", argumentHint: "", effect: "clear_session", supportedAgents: BOTH },
  { name: "restart", description: "Restart the agent process. Useful to pick up config changes.", argumentHint: "", effect: "restart_agent", supportedAgents: BOTH },
  { name: ADD_DIR, description: "Link a directory or workspace", argumentHint: "", effect: "pick_linked_directory", supportedAgents: BOTH },
  { name: "personality", description: "Choose Codex's personality for this session and future ones", argumentHint: "", effect: "pick_personality", supportedAgents: ["codex"] },
  { name: "goal", description: "Set the objective Codex should keep working toward", argumentHint: "objective", effect: "set_goal", supportedAgents: ["codex"] },
  { name: "mcp-status", description: "View MCP server connection status", argumentHint: "", effect: "show_mcp_status", supportedAgents: BOTH },
  { name: "mcp", description: "Manage MCP servers (opens terminal)", argumentHint: "", effect: "open_terminal", supportedAgents: BOTH },
  { name: "agents", description: "Manage agents (opens terminal)", argumentHint: "", effect: "open_terminal", supportedAgents: ["claude"] },
  { name: "hooks", description: "Manage hooks (opens terminal)", argumentHint: "", effect: "open_terminal", supportedAgents: ["claude"] },
  { name: "memory", description: "Manage memory (opens terminal)", argumentHint: "", effect: "open_terminal", supportedAgents: ["claude"] },
  { name: "permissions", description: "Manage permissions (opens terminal)", argumentHint: "", effect: "open_terminal", supportedAgents: ["claude"] },
  { name: "plugins", description: "Manage plugins (opens terminal)", argumentHint: "", effect: "open_terminal", supportedAgents: ["claude"] },
  { name: "compact", description: "Compact the context window", argumentHint: "", effect: "compact_session", supportedAgents: BOTH },
  { name: "ultracode", description: "Enable Ultracode", argumentHint: "", effect: "enable_ultracode", supportedAgents: ["claude"] },
];

/** Conductor's `_mo`. */
export function planCommand(isPlanMode: boolean, agent: ComposerAgent): SlashCommand {
  return { name: "plan", description: isPlanMode ? "Exit plan mode" : "Enter plan mode", argumentHint: "", effect: "toggle_plan_mode", supportedAgents: [agent] };
}

/** Conductor's `vmo`. */
export function fastCommand(isFastMode: boolean, agent: ComposerAgent): SlashCommand {
  const what = agent === "codex" ? "fast mode (uses credits 2x faster)" : "fast mode (uses extra credits)";
  return { name: "fast", description: isFastMode ? "Disable fast mode" : `Enable ${what}`, argumentHint: "", effect: "toggle_fast_mode", supportedAgents: [agent] };
}

export interface CommandSetInput {
  agent: ComposerAgent;
  isCloudWorkspace?: boolean;
  /** Codex goals are enabled for this chat (Conductor's `P`). */
  goalsEnabled?: boolean;
  /** The chat has plan mode; `isPlanMode` says whether it is on. */
  planMode?: { isPlanMode: boolean };
  /** The model offers Fast mode; `isFastMode` says whether it is on. */
  fastMode?: { isFastMode: boolean };
  /** Commands the agent reports (name, description, argument hint). */
  agentCommands?: readonly { name: string; description: string; argumentHint?: string }[];
  /** Skills the agent reports; listed after every command. */
  skills?: readonly AgentSkillInput[];
}

/** Every command the chat's "/" menu can show, agent commands first (Conductor's `c1`, `jI`, `z6`). */
export function commandSet({ agent, isCloudWorkspace = false, goalsEnabled = false, planMode, fastMode, agentCommands = [], skills = [] }: CommandSetInput): SlashCommand[] {
  const builtins = [
    ...BUILTIN_COMMANDS.filter((c) => !(isCloudWorkspace && c.name === ADD_DIR)).filter((c) => goalsEnabled || c.name !== "goal"),
    ...(planMode ? [planCommand(planMode.isPlanMode, agent)] : []),
    ...(fastMode ? [fastCommand(fastMode.isFastMode, agent)] : []),
  ];
  const reported: SlashCommand[] = agentCommands
    .filter((c) => !(isCloudWorkspace && c.name === ADD_DIR))
    .map((c) => ({ name: c.name, description: c.description, argumentHint: c.argumentHint ?? "", effect: "agent" as const, supportedAgents: [agent] }));
  const taken = new Set(reported.map((c) => c.name));
  const seen = new Set<string>();
  return [...reported, ...builtins.filter((c) => !taken.has(c.name)), ...skills.map((s) => skillCommand(s, agent))]
    .filter((c) => c.supportedAgents.includes(agent))
    .filter((c) => (seen.has(commandId(c)) ? false : (seen.add(commandId(c)), true)));
}

export interface SlashMatch {
  command: SlashCommand;
  /** Indexes of the name's characters the query matched (for highlighting). */
  indices: number[];
}

/**
 * Fuzzy match on the name; exact matches first, then fuzzysort's order
 * (Conductor's `lj`), and commands before skills (`jNi`).
 */
export function matchCommands(commands: readonly SlashCommand[], query: string): SlashMatch[] {
  const bySkill = (ms: SlashMatch[]) => [...ms.filter((m) => !isSkill(m.command)), ...ms.filter((m) => isSkill(m.command))];
  if (!query.trim()) return bySkill(commands.map((command) => ({ command, indices: [] })));
  const hits = fuzzysort.go(query, commands as SlashCommand[], { key: "name" }).map((r) => ({ command: r.obj, indices: Array.from(r.indexes) }));
  const q = query.toLowerCase();
  return bySkill([...hits.filter((h) => h.command.name.toLowerCase() === q), ...hits.filter((h) => h.command.name.toLowerCase() !== q)]);
}

/**
 * The "/" the caret is in, when the draft is a slash command being typed: a
 * "/" at the very start, with no space yet between it and the caret. Returns
 * the query (the text after "/"), or null when the menu should be closed.
 */
export function slashQuery(draft: string, caret: number): string | null {
  if (!draft.startsWith("/")) return null;
  const typed = draft.slice(1, caret);
  if (caret < 1 || /\s/.test(typed)) return null;
  return typed;
}

/** The draft after picking a command: `/name ` replaces what was typed up to the first space. */
export function completeCommand(draft: string, name: string): string {
  return completeInsert(draft, `/${name}`);
}

/** The draft after picking `command`: its insert text (`/name`, or `$name` for a Codex skill), then a space. */
export function completeInsert(draft: string, insert: string): string {
  const space = draft.search(/\s/);
  const rest = space < 0 ? "" : draft.slice(space).replace(/^\s+/, "");
  return `${insert} ${rest}`;
}

/** A message that names a known command (Conductor's `gWn`): `/name args` or `/[name](command) args`. */
export function parseSlashCommand(text: string, known: (name: string) => boolean): { name: string; args: string } | null {
  let name: string | null = null;
  let args = "";
  if (text.startsWith("/[")) {
    const close = text.indexOf("]");
    if (close > 2) {
      name = text.slice(2, close);
      const rest = text.slice(close + 1);
      args = rest.startsWith("(command)") ? rest.slice(9).trim() : rest.trim();
    }
  } else if (text.startsWith("/")) {
    const body = text.slice(1);
    const space = body.indexOf(" ");
    if (space >= 0) {
      name = body.slice(0, space);
      args = body.slice(space + 1).trim();
    } else name = body;
  }
  return name && known(name) ? { name, args } : null;
}

/** Built-in names Conductor recognises even where they do not apply (`bmo`). */
export function isKnownCommand(name: string): boolean {
  return name === "plan" || name === "fast" || BUILTIN_COMMANDS.some((c) => c.name === name);
}

/** The agent names Conductor uses in "/x is not available for …" (`_A`). */
export const AGENT_NAMES: Record<ComposerAgent, string> = { claude: "Claude Code", codex: "Codex", acp: "this agent" };
