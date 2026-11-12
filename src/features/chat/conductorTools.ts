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

/** Conductor's tool name -> row kind table (`D1o`), all 35 row kinds of its registry (`Qpo`). */
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
  ScheduleWakeup: "schedule-wakeup",
  SendMessage: "send-message",
  Skill: "skill",
  SlashCommand: "slash-command",
  Task: "sub-agent",
  TaskCreate: "task-create",
  TaskGet: "task-get",
  TaskList: "task-list",
  TaskUpdate: "task-update",
  Teammate: "teammate",
  Thinking: "thinking",
  TodoRead: "todo",
  TodoWrite: "todo",
  WebFetch: "web",
  WebSearch: "web",
  Write: "write",
  mcp__conductor__AskUserQuestion: "ask-user-question",
  mcp__conductor__DiffComment: "diff-comment",
  mcp__conductor__GetDiffComments: "get-diff-comments",
  mcp__conductor__GetTerminalOutput: "get-terminal-output",
  mcp__conductor__GetWorkspaceDiff: "get-workspace-diff",
  mcp__conductor__RunLocalCommand: "run-local-command",
  mcp__node_repl__js: "node-repl-js",
  "sub-agent": "sub-agent",
};

/** `P1o`: kinds chosen by a name prefix when the name is not in the table. */
const KIND_BY_PREFIX: [string, string][] = [
  ["collab__", "codex-collab"],
  ["mcp__context7__", "context7-mcp"],
  ["mcp__linear__", "linear-mcp"],
];

export type ToolKind = (typeof KIND_BY_NAME)[string] | "other";

export function toolKind(name: string): ToolKind {
  return KIND_BY_NAME[name] ?? KIND_BY_PREFIX.find(([p]) => name.startsWith(p))?.[1] ?? "other";
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
  if (name === "ToolSearch") return "Search tools";
  if (name === "Monitor") return "Start monitor";
  if (name === "mcp__conductor__GetComputerConfiguration") return "Read computer configuration";
  if (name === "mcp__conductor__GetComputerBuildStatus") return "Read computer build status";
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

// ---- The rest of Conductor's row kinds (renderApp `Tpo` ... `Kpo`) ----------

/** `yZe`: a tool result's text (a string, text blocks, or JSON). */
export function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b) => (isRecord(b) && typeof b.text === "string" ? b.text : "")).join("");
  if (isRecord(content) && typeof content.text === "string") return content.text;
  return JSON.stringify(content, null, 2) ?? "";
}

/** `xZe`: the last two path segments ("src/a/b.ts" -> "a/b.ts"). */
export function lastTwoSegments(path: string): string {
  const parts = path.split("/");
  return parts.length <= 2 ? path : parts.slice(-2).join("/");
}

const titleWords = (s: string): string =>
  s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** `_po`: a Skill row's label, "pstack:poteto-mode" -> "Poteto Mode". */
export function skillLabel(skill: string): string {
  const parts = skill.split(":");
  return titleWords(parts[parts.length - 1]!);
}

/** `Cpo`: a SlashCommand row's label, "/review:pr-comments" -> "Pr Comments". */
export function slashCommandLabel(command: string): string {
  if (!command) return "Slash Command";
  const parts = (command.startsWith("/") ? command.slice(1) : command).split(":");
  const last = parts[parts.length - 1];
  return last ? titleWords(last) : "Slash Command";
}

/** `jtt`: a sub-agent description without a trailing "(model)". */
export function subagentDescription(description: string, model?: string): string {
  if (!model) return description;
  const d = description.trim();
  const suffix = `(${model})`.toLowerCase();
  return d.toLowerCase().endsWith(suffix) ? d.slice(0, d.length - suffix.length).trim() : d;
}

/** `bpo` vs `Ypo`: Task/Agent with no sub-agent type, or "general-purpose", draws as a plain tool row. */
export function isTypedSubagent(input: Record<string, unknown>): boolean {
  const t = str(input.subagent_type);
  return t !== undefined && t !== "general-purpose";
}

export interface TaskItem {
  id?: string;
  status?: string;
  subject?: string;
  description?: string;
  activeForm?: string;
  owner?: string;
}

/** `epo` + `Z0o`: TaskList's tasks, from JSON or "#1 [pending] Subject" lines. */
export function parseTaskList(content: unknown): TaskItem[] {
  if (!content) return [];
  if (typeof content === "string") {
    try {
      const v: unknown = JSON.parse(content);
      if (Array.isArray(v)) return v as TaskItem[];
      if (isRecord(v) && Array.isArray(v.tasks)) return v.tasks as TaskItem[];
      return [];
    } catch {
      const tasks: TaskItem[] = [];
      for (const line of content.trim().split("\n")) {
        const m = line.trim().match(/^#(\d+)\s+\[(\w+)\]\s+(.+?)(?:\s+\[blocked by ([^\]]+)\])?$/);
        if (m) tasks.push({ id: m[1], status: m[2], subject: m[3] });
      }
      return tasks;
    }
  }
  if (Array.isArray(content)) return content as TaskItem[];
  return isRecord(content) && Array.isArray(content.tasks) ? (content.tasks as TaskItem[]) : [];
}

/** `jki` + `tpo`: TaskGet/TaskUpdate's task, from JSON or "Task #1 [pending]: Subject" text. */
export function parseTask(content: unknown): TaskItem | undefined {
  if (!content) return undefined;
  if (typeof content === "string") {
    try {
      const v: unknown = JSON.parse(content);
      if (isRecord(v)) return (isRecord(v.task) ? v.task : v) as TaskItem;
      return undefined;
    } catch {
      const lines = content.trim().split("\n");
      const m = lines[0]?.match(/^Task #(\d+)\s+\[(\w+)\]:\s*(.*)$/);
      if (!m) return undefined;
      const task: TaskItem = { id: m[1], status: m[2], subject: m[3] };
      for (const raw of lines.slice(1)) {
        const l = raw.trim();
        if (l.startsWith("Description:")) task.description = l.replace("Description:", "").trim();
        else if (l.startsWith("Active form:")) task.activeForm = l.replace("Active form:", "").trim();
        else if (l.startsWith("Owner:")) task.owner = l.replace("Owner:", "").trim();
      }
      return task;
    }
  }
  return isRecord(content) ? ((isRecord(content.task) ? content.task : content) as TaskItem) : undefined;
}

/** `Fki`: the first "#N" in a result. */
export function taskIdIn(content: unknown): string | undefined {
  return typeof content === "string" ? content.match(/#(\d+)/)?.[1] : undefined;
}

/** `cpo`: TaskUpdate's label and the dependency note that replaces its subject on the right. */
export function taskUpdateLabel(input: Record<string, unknown>): { label: string; note?: string } {
  const blockedBy = Array.isArray(input.addBlockedBy) ? (input.addBlockedBy as unknown[]).map(String) : [];
  const blocks = Array.isArray(input.addBlocks) ? (input.addBlocks as unknown[]).map(String) : [];
  if (blockedBy.length > 0) return { label: "Task dependency added", note: `Blocked by task${blockedBy.length > 1 ? "s" : ""} #${blockedBy.join(", #")}` };
  if (blocks.length > 0) return { label: "Task dependency added", note: `Now blocks task${blocks.length > 1 ? "s" : ""} #${blocks.join(", #")}` };
  const label =
    { completed: "Task completed", in_progress: "Task started", deleted: "Task deleted", pending: "Task reset to pending" }[str(input.status) ?? ""] ?? "Task updated";
  return { label };
}

export type AskState = { state: "answered"; answers: string[] } | { state: "cancelled" } | { state: "failed"; text: string } | { state: "waiting" };

/** `Tpo`: an AskUserQuestion result, "User responses:\n1. ..." answered, "User cancelled" cancelled. */
export function askUserState(questionCount: number, result: string | undefined, isError: boolean): AskState {
  if (result === undefined) return { state: "waiting" };
  if (result.startsWith("User cancelled")) return { state: "cancelled" };
  if (isError || !result.startsWith("User responses:")) return { state: "failed", text: result.trim() };
  const answers = new Array<string>(questionCount).fill("");
  for (const line of result.split("\n").slice(1)) {
    const m = line.match(/^(\d+)\.\s(.*)$/);
    if (!m) continue;
    const i = Number(m[1]) - 1;
    if (i >= 0 && i < answers.length) answers[i] = m[2]!;
  }
  return { state: "answered", answers };
}

/** `Dpo`: GetTerminalOutput's text (the text blocks of a JSON result) and its "Source: x · N lines" note. */
export function terminalOutput(input: Record<string, unknown>, result: string | undefined): { text: string; note: string } {
  let text = "";
  if (result) {
    try {
      const v: unknown = JSON.parse(result);
      if (Array.isArray(v)) text = v.filter((b) => isRecord(b) && b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    } catch {
      text = result;
    }
  }
  const note: string[] = [];
  if (str(input.source)) note.push(`Source: ${input.source}`);
  if (input.maxLines !== undefined) note.push(`${String(input.maxLines)} lines`);
  return { text, note: note.join(" · ") };
}

/** `R0o`: BashOutput's `<status>` (running, completed, ...). */
export function backgroundStatus(result: string | undefined): string | undefined {
  return result?.match(/<status>([\s\S]*?)<\/status>/)?.[1]?.trim();
}

/** `qpo`: SendMessage's label and right-hand summary. */
export function sendMessageLabel(input: Record<string, unknown>): { label: string; summary?: string } {
  const type = str(input.type);
  const recipient = str(input.recipient);
  const summary = str(input.summary);
  const approve = input.approve === true;
  const broadcast = type === "broadcast";
  const label =
    broadcast ? "Broadcast to swarm"
    : type === "shutdown_request" ? "Shutdown request"
    : type === "shutdown_response" ? (approve ? "Approved shutdown" : "Rejected shutdown")
    : type === "plan_approval_response" ? (approve ? "Approved plan" : "Rejected plan")
    : "Send message to swarm";
  const right = broadcast ? summary : recipient ? `@${recipient}${summary ? ` — ${summary}` : ""}` : summary;
  return { label, summary: right };
}

export function scheduleWakeupAt(input: Record<string, unknown>, result: string | undefined, resultAt: number | undefined): number | undefined {
  if (input.stop === true || resultAt === undefined || !Number.isFinite(resultAt)) return undefined;
  const fromResult = result ? /\(in (\d+)s\)/.exec(result)?.[1] : undefined;
  const delay = typeof input.delaySeconds === "number" ? Math.min(Math.max(input.delaySeconds, 60), 3600) : undefined;
  const secs = fromResult !== undefined ? Number(fromResult) : delay;
  return secs === undefined ? undefined : resultAt + secs * 1000;
}

/** `Spo` + `ypo`: ScheduleWakeup's label. `now` decides waiting vs waited. */
export function scheduleWakeupLabel(input: Record<string, unknown>, result: string | undefined, resultAt: number | undefined, now: number, timeOfDay: (ms: number) => string): string {
  const hasResult = result !== undefined;
  if (input.stop === true) return hasResult ? "Stopped scheduled wake-ups" : "Stopping scheduled wake-ups";
  const wakeAt = scheduleWakeupAt(input, result, resultAt);
  if (wakeAt === undefined) return hasResult ? "Wake-up scheduled" : "Scheduling wake-up";
  return wakeAt - now > 0 ? `Waiting until ${timeOfDay(wakeAt)}` : `Waited until ${timeOfDay(wakeAt)}`;
}

// ---- Codex collaboration calls (`_0o` and its helpers) ----

const COLLAB_ACTIONS: Record<string, { started: string; completed: string; failed: string }> = {
  spawnAgent: { started: "Spawning", completed: "Spawned", failed: "Failed to spawn" },
  sendInput: { started: "Sending input to", completed: "Sent input to", failed: "Failed to send input to" },
  resumeAgent: { started: "Resuming", completed: "Resumed", failed: "Failed to resume" },
  wait: { started: "Waiting for", completed: "Finished waiting for", failed: "Failed while waiting for" },
  closeAgent: { started: "Closing", completed: "Closed", failed: "Failed to close" },
  interruptAgent: { started: "Interrupting", completed: "Interrupted", failed: "Failed to interrupt" },
};

const AGENT_STATUS_LABEL: Record<string, string> = {
  pendingInit: "Pending init",
  running: "Running",
  interrupted: "Interrupted",
  completed: "Completed",
  errored: "Error",
  shutdown: "Shutdown",
  notFound: "Not found",
};

export interface CollabAgent {
  threadId: string;
  /** `u0o`: nickname, or the thread id's first two dash parts. */
  name: string;
  /** `d0o`: the role, unless it is a reasoning effort. */
  role?: string;
  /** `f0o`: index into Conductor's six agent colours, from a hash of the name. */
  color: number;
  /** `pWn`: "Completed - message", when the result reports the agent's state. */
  state?: string;
  errored: boolean;
}

export interface CollabCall {
  status: "inProgress" | "completed" | "failed";
  action: string;
  agents: CollabAgent[];
  /** `h0o`: "agent" or "N agents" when not exactly one agent is named. */
  countLabel: string;
  prompt?: string;
  model?: string;
  /** wait / resumeAgent / sendInput list each agent under the row. */
  listAgents: boolean;
}

const squash = (s: string, max: number): string => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}...`;
};

const nonBlank = (r: Record<string, unknown>, k: string): string | undefined => {
  const v = r[k];
  return typeof v === "string" && v.trim() ? v : undefined;
};

const stringList = (r: Record<string, unknown>, k: string): string[] | undefined => {
  const v = r[k];
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string");
  return out.length > 0 ? out : undefined;
};

function threadMeta(v: unknown): Map<string, { nickname?: string; role?: string }> {
  const out = new Map<string, { nickname?: string; role?: string }>();
  if (!Array.isArray(v)) return out;
  for (const t of v) {
    if (!isRecord(t)) continue;
    const id = nonBlank(t, "id");
    if (id) out.set(id, { nickname: nonBlank(t, "agentNickname") ?? nonBlank(t, "agent_nickname"), role: nonBlank(t, "agentRole") ?? nonBlank(t, "agent_role") });
  }
  return out;
}

/** `_0o`: what a Codex `collab__*` call's row shows. */
export function collabCall(name: string, input: Record<string, unknown>, result: string | undefined, isError: boolean): CollabCall {
  let parsed: Record<string, unknown> | undefined;
  if (result?.trim()) {
    try {
      const v: unknown = JSON.parse(result);
      if (isRecord(v)) parsed = v;
    } catch {
      parsed = undefined;
    }
  }
  const op = nonBlank(input, "operation") ?? name.replace("collab__", "");
  const reported = parsed ? nonBlank(parsed, "status") : undefined;
  const status: CollabCall["status"] =
    reported === "failed" ? "failed" : reported === "completed" ? "completed" : isError ? "failed" : result !== undefined ? "completed" : "inProgress";
  const threadIds = stringList(parsed ?? {}, "receiverThreadIds") ?? stringList(input, "receiver_thread_ids") ?? [];
  const states = new Map<string, { status: string; message?: string }>();
  if (parsed && isRecord(parsed.agentsStates)) {
    for (const [id, s] of Object.entries(parsed.agentsStates)) {
      const st = isRecord(s) ? nonBlank(s, "status") : undefined;
      if (st && st in AGENT_STATUS_LABEL) states.set(id, { status: st, message: nonBlank(s as Record<string, unknown>, "message") });
    }
  }
  const fromInput = threadMeta(input.receiver_threads);
  const fromResult = threadMeta(parsed?.receiverThreads);
  const firstNick = nonBlank(input, "agent_nickname") ?? nonBlank(input, "agentNickname");
  const firstRole = nonBlank(input, "agent_role") ?? nonBlank(input, "agentRole");
  const agents = threadIds.map((threadId, i): CollabAgent => {
    const nickname = fromResult.get(threadId)?.nickname ?? fromInput.get(threadId)?.nickname ?? (i === 0 ? firstNick : undefined);
    const rawRole = fromResult.get(threadId)?.role ?? fromInput.get(threadId)?.role ?? (i === 0 ? firstRole : undefined);
    const role = rawRole && !["default", "low", "medium", "high", "xhigh"].includes(rawRole) ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1) : undefined;
    const parts = threadId.split("-");
    const name = nickname ?? (parts.length >= 2 ? `${parts[0]}-${parts[1]}` : threadId.length <= 13 ? threadId : threadId.slice(0, 13));
    const key = nickname ?? threadId;
    let h = 0;
    for (let c = 0; c < key.length; c++) h = (h * 31 + key.charCodeAt(c)) >>> 0;
    const st = states.get(threadId);
    const state = st ? (st.message ? `${AGENT_STATUS_LABEL[st.status]} - ${squash(st.message, 240)}` : AGENT_STATUS_LABEL[st.status]) : undefined;
    return { threadId, name, role, color: h % 6, state, errored: st?.status === "errored" };
  });
  const known = COLLAB_ACTIONS[op];
  const words = op.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  const pretty = words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : "agent";
  const labels = known ?? { started: `${pretty}...`, completed: pretty, failed: `Failed: ${pretty}` };
  const count = agents.length || threadIds.length || 1;
  const prompt = nonBlank(input, "prompt");
  return {
    status,
    action: labels[status === "inProgress" ? "started" : status],
    agents,
    countLabel: count === 1 ? "agent" : `${count} agents`,
    prompt: prompt ? squash(prompt, 160) : undefined,
    model: nonBlank(input, "model"),
    listAgents: op === "wait" || op === "resumeAgent" || op === "sendInput",
  };
}
