// Tool calls as Conductor draws them. Conductor renders every agent's tools
// through Claude Code's tool names and inputs: its sidecar turns Codex items
// into `Bash`, `Read`, `Grep`, `LS`, `Write`, `Edit`, `WebSearch`/`WebFetch`
// and `mcp__server__tool` calls (index-BGEQ8YjU.js `Kst`, `Jst`, `tnt`,
// `snt`, `rnt`), and its row components read those inputs (renderApp
// `D1o` name -> kind table, `O0o` Read, `D0o` Grep, `F0o` Edit, `hpo` Write,
// `Lki` Bash, `upo` Web, `dpo` Glob, `fpo` LS, `aUt` any other tool).
//
// Our chats reach the transcript in three shapes, all normalised here:
// - Reason and Claude Code: reason.ts's input `{ kind, paths, title,
//   toolName?, rawInput?, diffs? }`. With the provider's name and raw input
//   the call is exact; otherwise it is rebuilt from the ACP kind, the
//   "Name: detail" title and the reported paths and diffs.
// - Codex: the item input codex.ts keeps (`{ command, cwd }`,
//   `{ changes }`, ...), mapped as Conductor's sidecar maps the item.
// - Anything else: the block's own name and input, as Claude Code sends them.
// Pure: no React, so `conductorTools.test.ts` covers it.

export interface ConductorTool {
  /** Claude Code tool name (`Bash`, `Read`, ...) or `mcp__server__tool`. */
  name: string;
  input: Record<string, unknown>;
}

/** Conductor's tool name -> row kind table (`D1o`), plus prefix kinds (`P1o`). */
const KIND_BY_NAME: Record<string, string> = {
  Agent: "sub-agent",
  AskUserQuestion: "ask-user-question",
  Bash: "bash",
  BashOutput: "bash-output",
  Edit: "edit",
  EnterPlanMode: "enter-plan-mode",
  ExitPlanMode: "exit-plan-mode",
  Glob: "glob",
  Grep: "grep",
  ImageGeneration: "image-generation",
  LS: "ls",
  MultiEdit: "multi-edit",
  NotebookEdit: "multi-edit",
  NotebookRead: "read",
  Read: "read",
  Skill: "skill",
  SlashCommand: "slash-command",
  Task: "sub-agent",
  TodoRead: "todo",
  TodoWrite: "todo",
  WebFetch: "web",
  WebSearch: "web",
  Write: "write",
};

export type ToolKind = (typeof KIND_BY_NAME)[string] | "other";

export function toolKind(name: string): ToolKind {
  return KIND_BY_NAME[name] ?? "other";
}

const CANONICAL = new Map(Object.keys(KIND_BY_NAME).map((n) => [n.toLowerCase(), n]));

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

/** Conductor's `h8`: the command inside Codex's `/bin/zsh -lc '...'` wrapper. */
export function unwrapShell(command: string): string {
  const quoted = command.match(/^\/bin\/(?:zsh|bash)\s+-\w+\s+['"](.+)['"]$/s);
  if (quoted) return quoted[1]!;
  return command.replace(/^\/bin\/(?:zsh|bash)\s+-\w+\s+/, "");
}

/** A unified diff's removed and added sides (Conductor's `p8`). */
export function splitPatch(diff: string): { oldString: string; newString: string } {
  const removed: string[] = [];
  const added: string[] = [];
  for (const line of diff.split("\n")) {
    if (/^(@@|diff --git |index |--- |\+\+\+ |\\ No newline|Moved to:)/.test(line)) continue;
    if (line.startsWith("-")) removed.push(line.slice(1));
    else if (line.startsWith("+")) added.push(line.slice(1));
    else {
      const ctx = line.startsWith(" ") ? line.slice(1) : line;
      removed.push(ctx);
      added.push(ctx);
    }
  }
  return { oldString: removed.join("\n"), newString: added.join("\n") };
}

interface ReasonPathInput {
  raw?: string;
  relative?: string | null;
}

interface ReasonDiffInput {
  path?: ReasonPathInput;
  oldText?: string | null;
  newText?: string;
}

/** "Grep: redirectTo" -> ["Grep", "redirectTo"]; a title with no known tool name gives none. */
function splitTitle(title: string): { name?: string; detail?: string } {
  const m = title.match(/^([A-Za-z][\w-]*):\s*(.*)$/s);
  if (!m) return {};
  const name = CANONICAL.get(m[1]!.toLowerCase());
  return name ? { name, detail: m[2]!.split("\n")[0] } : {};
}

/** ACP kind -> the Claude Code tool Conductor would show for it. */
const NAME_BY_ACP_KIND: Record<string, string> = {
  execute: "Bash",
  read: "Read",
  search: "Grep",
  fetch: "WebFetch",
  think: "Task",
};

function fromReason(input: Record<string, unknown>, blockName: string): ConductorTool[] {
  const toolName = str(input.toolName);
  if (toolName && isRecord(input.rawInput)) return [{ name: toolName, input: input.rawInput }];
  const title = str(input.title) ?? blockName;
  const kind = str(input.kind) ?? "other";
  const paths = (Array.isArray(input.paths) ? input.paths : []).filter(isRecord) as ReasonPathInput[];
  const diffs = (Array.isArray(input.diffs) ? input.diffs : []).filter(isRecord) as ReasonDiffInput[];
  const raw = isRecord(input.rawInput) ? input.rawInput : {};
  const t = splitTitle(title);
  const firstPath = paths[0]?.raw ?? diffs[0]?.path?.raw;

  if (kind === "edit" || t.name === "Edit" || t.name === "Write" || t.name === "MultiEdit") {
    if (diffs.length === 0) return [{ name: t.name ?? "Edit", input: { file_path: firstPath ?? t.detail ?? "", ...raw } }];
    return diffs.map((d) =>
      d.oldText === null || d.oldText === undefined
        ? { name: "Write", input: { file_path: d.path?.raw ?? "", content: d.newText ?? "" } }
        : { name: "Edit", input: { file_path: d.path?.raw ?? "", old_string: d.oldText, new_string: d.newText ?? "" } },
    );
  }
  const name = t.name ?? NAME_BY_ACP_KIND[kind];
  const detail = t.detail ?? (t.name ? undefined : title);
  switch (name) {
    case "Bash":
      return [{ name, input: { command: detail ?? "", ...raw } }];
    case "Read":
    case "NotebookRead":
      return [{ name, input: { file_path: firstPath ?? detail ?? "", ...raw } }];
    case "Grep":
    case "Glob":
      return [{ name, input: { pattern: detail ?? "", ...raw } }];
    case "LS":
      return [{ name, input: { path: firstPath ?? detail ?? ".", ...raw } }];
    case "WebFetch":
      return [{ name, input: { url: detail ?? "", ...raw } }];
    case "WebSearch":
      return [{ name, input: { query: detail ?? "", ...raw } }];
    case "Task":
    case "Agent":
      return [{ name, input: { description: detail ?? "", ...raw } }];
    case undefined:
      // A tool with no Claude Code counterpart: Conductor's generic row (lowercase name and its input).
      return [{ name: title, input: raw }];
    default:
      return [{ name, input: raw }];
  }
}

/** Codex items (codex.ts keeps the item's own input), as Conductor's sidecar maps them. */
function fromCodex(input: Record<string, unknown>, blockName: string): ConductorTool[] | undefined {
  const command = str(input.command);
  if (command !== undefined && (input.cwd !== undefined || Array.isArray(input.commandActions))) {
    const actions = Array.isArray(input.commandActions) ? input.commandActions.filter(isRecord) : [];
    const a = actions.length === 1 ? actions[0]! : undefined;
    switch (a?.type) {
      case "read":
        return [{ name: "Read", input: { file_path: str(a.path) ?? "" } }];
      case "search":
        return [{ name: "Grep", input: { pattern: str(a.query) ?? "", ...(str(a.path) ? { path: a.path } : {}) } }];
      case "listFiles":
        return [{ name: "LS", input: str(a.path) ? { path: a.path } : {} }];
      case "unknown":
        return [{ name: "Bash", input: { command: unwrapShell(str(a.command) ?? command) } }];
      default:
        return [{ name: "Bash", input: { command: unwrapShell(command) } }];
    }
  }
  if (Array.isArray(input.changes)) {
    return input.changes.filter(isRecord).map((c) => {
      const path = str(c.path) ?? "";
      const kind = typeof c.kind === "string" ? c.kind : isRecord(c.kind) ? str(c.kind.type) : undefined;
      const patch = splitPatch(str(c.diff) ?? "");
      if (kind === "add") return { name: "Write", input: { file_path: path, content: patch.newString } };
      if (kind === "delete") return { name: "Bash", input: { command: `rm ${path}` } };
      return { name: "Edit", input: { file_path: path, old_string: patch.oldString, new_string: patch.newString } };
    });
  }
  if (blockName.startsWith("Search the web: ") && typeof input.query === "string") return [{ name: "WebSearch", input: { query: input.query } }];
  if (str(input.server) && str(input.tool)) return [{ name: `mcp__${input.server}__${input.tool}`, input: isRecord(input.arguments) ? input.arguments : {} }];
  return undefined;
}

/**
 * The Conductor tool call(s) a transcript `tool_use` block stands for. One
 * Codex file change item edits several files, so it gives one call per file.
 */
export function conductorTools(blockName: string, input: unknown): ConductorTool[] {
  if (isRecord(input)) {
    if (typeof input.kind === "string" && Array.isArray(input.paths)) return fromReason(input, blockName);
    const codex = fromCodex(input, blockName);
    if (codex && codex.length > 0) return codex;
    return [{ name: blockName, input }];
  }
  return [{ name: blockName, input: {} }];
}

// ---- What the rows show (pure parts of Conductor's row components) ----------

/** `L0o`: a Read result without Claude Code's "   12→" line-number prefixes or its system reminder. */
export function readContent(result: string): string {
  return result
    .replace(/<system-reminder>[\s\S]*?consider whether it looks malicious[\s\S]*?<\/system-reminder>/gi, "")
    .split("\n")
    .map((line) => line.match(/^\s*\d+→(.*)$/)?.[1] ?? line)
    .join("\n")
    .trim();
}

/** `O0o`'s label: "Read N lines", "Read image", or "Reading" before the result. */
export function readLabel(filePath: string, result: string | undefined): string {
  const content = result === undefined ? "" : readContent(result);
  if (!content) return "Reading";
  if (/\.(png|jpe?g|gif|webp|bmp|ico|svg|avif|heic)$/i.test(filePath)) return "Read image";
  return `Read ${content.split("\n").length} lines`;
}

const NO_MATCHES = new Set(["No files found", "No matches found"]);

/** `D0o`: matches are the result's non-blank lines. */
export function grepMatches(result: string): number {
  return NO_MATCHES.has(result.trim()) ? 0 : result.split("\n").filter((l) => l.trim()).length;
}

/** `oV`: an Edit side without leading "+"/"-" markers. */
export function stripMarkers(s: string): string {
  return s
    .split("\n")
    .map((l) => l.replace(/^[-+]\s*/, ""))
    .join("\n");
}

/** Lines added and removed between two texts (`rUt`, a line diff). */
export function lineCounts(oldText: string, newText: string): { added: number; removed: number } {
  const a = oldText ? oldText.split("\n") : [];
  const b = newText ? newText.split("\n") : [];
  if (a.at(-1) === "") a.pop();
  if (b.at(-1) === "") b.pop();
  // Longest common subsequence of lines; lines outside it are added or removed.
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const common = dp[0]?.[0] ?? 0;
  return { added: m - common, removed: n - common };
}

/** `F0o`'s counts for an Edit: from the result's `diffString` when it has one, else old/new strings. */
export function editCounts(input: Record<string, unknown>): { added: number; removed: number } | undefined {
  const oldText = stripMarkers(str(input.old_string) ?? "");
  const newText = stripMarkers(str(input.new_string) ?? "");
  if (!oldText && !newText) return undefined;
  return lineCounts(oldText, newText);
}

/** `B1o`: the one-line summary Conductor shows beside a tool with no row of its own. */
export function genericSummary(name: string, input: Record<string, unknown>): string | undefined {
  if (name === "ToolSearch" && str(input.query)?.trim()) return input.query as string;
  if (name === "Monitor" && str(input.description)?.trim()) return (input.description as string).trim();
  for (const k of ["query", "url", "input", "page_id", "pageId", "issue_id", "issueId", "document_id", "documentId", "project_id", "projectId", "id", "path", "name"]) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const json = JSON.stringify(input);
  if (json === "{}") return undefined;
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
}

/** `Kzt`: an MCP tool's label, "mcp__linear__get_issue" -> "Get issue". */
export function mcpLabel(name: string): string {
  const parts = name.split("__").filter(Boolean);
  const tool = parts[parts.length - 1] ?? name;
  const server = parts.length >= 3 ? parts[1]! : undefined;
  let t = tool;
  if (server && (t.toLowerCase().startsWith(`${server.toLowerCase()}-`) || t.toLowerCase().startsWith(`${server.toLowerCase()}_`))) t = t.slice(server.length + 1);
  const words = t.split(/[-_]+|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);
  if (words.length === 0) return tool;
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase())).join(" ");
}

/** `xZe`-like: a Grep/LS path shown relative to the workspace when it is inside it. */
export function shortPath(path: string, workspacePath?: string): string {
  if (workspacePath && path.startsWith(`${workspacePath.replace(/\/$/, "")}/`)) return path.slice(workspacePath.replace(/\/$/, "").length + 1);
  return path;
}

/** Last path segment, for file badges. */
export const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
