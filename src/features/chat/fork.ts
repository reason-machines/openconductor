// parity:chat.message-actions:data
// "Fork to new tab" in a turn's More actions menu. As in Conductor 0.87.6
// (index-BGEQ8YjU.js `y9t` forkChatToNewTab, `YOt`/`Bpe`/`VOt` transcript,
// renderApp-D_fmY7hW.js turn footer `TDo`; read on sven m5 max, see
// evidence/parity/chat-diff-pr/fork.md): the fork is a new chat tab in the same
// workspace on the same options, whose composer holds the conversation up to
// and including that turn as "Transcript of <title>.md" plus the source
// composer's draft. Nothing is sent until the user sends.
//
// The transcript is Conductor's "concise" form: per turn a "## User" section
// with the prompt and a "## Assistant" section with the turn's last reply that
// has text; the other replies become "[N messages elided]" and tool calls in the
// kept reply "[N tool calls elided]". Consecutive sections of one speaker merge.
//
// Pure: no Tauri, no React.

import type { ChatTranscript } from "./reducer.ts";
import type { ChatMessage } from "./types.ts";
import { messageOrigin, plainText } from "./types.ts";
import { modelLabel, agentForModel } from "../../settings/models.ts";

type Speaker = "User" | "Assistant";
interface Entry {
  speaker: Speaker;
  text: string;
}

const elided = (n: number, what: string) => `[${n} ${what}${n === 1 ? "" : "s"} elided]`;

/** A kept reply: its text blocks, with each run of tool calls as "[N tool calls elided]" (Conductor's `HOt` + `UOt`). */
function replyText(m: ChatMessage): string | null {
  const out: string[] = [];
  let tools = 0;
  const flush = () => {
    if (tools > 0) out.push(elided(tools, "tool call"));
    tools = 0;
  };
  for (const b of m.blocks) {
    if (b.type === "tool_use") tools++;
    else if (b.type === "text" && b.text.trim()) {
      flush();
      out.push(b.text.trim());
    }
  }
  flush();
  return out.length === 0 ? null : out.join("\n\n");
}

/** One turn's entries; none when it has no prompt of the user's own or the prompt was cancelled (Conductor's `KOt`). */
function turnEntries(messages: ChatMessage[]): Entry[] {
  const users = messages.filter((m) => messageOrigin(m).kind === "user" && plainText(m).trim() && m.cancelledAt === undefined);
  if (users.length === 0) return [];
  const replies = messages.filter((m) => m.role === "assistant" && m.cancelledAt === undefined);
  let kept = -1;
  for (let i = replies.length - 1; i >= 0 && kept < 0; i--) if (plainText(replies[i]!).trim()) kept = i;

  const entries: Entry[] = users.map((m) => ({ speaker: "User", text: plainText(m).trim() }));
  const before = kept < 0 ? replies.length : kept;
  if (before > 0) entries.push({ speaker: "Assistant", text: elided(before, "message") });
  if (kept >= 0) {
    const text = replyText(replies[kept]!);
    if (text) entries.push({ speaker: "Assistant", text });
    const after = replies.length - kept - 1;
    if (after > 0) entries.push({ speaker: "Assistant", text: elided(after, "message") });
  }
  return entries;
}

/** "## Speaker" sections; consecutive entries of one speaker share a section (Conductor's `VOt`). */
function sections(entries: Entry[]): string | null {
  if (entries.length === 0) return null;
  const out: string[] = [];
  for (let i = 0; i < entries.length; ) {
    const speaker = entries[i]!.speaker;
    const texts: string[] = [];
    while (i < entries.length && entries[i]!.speaker === speaker) texts.push(entries[i++]!.text);
    out.push(`## ${speaker}\n\n${texts.join("\n\n")}`);
  }
  return out.join("\n\n");
}

/**
 * The conversation up to and including `turnId` (every turn when it is
 * omitted), as Markdown. Null when the turn is not in the chat or nothing in
 * it has text, which Conductor reports as "failed to generate chat transcript".
 */
export function forkTranscript(t: ChatTranscript, turnId?: string): string | null {
  const order: string[] = [];
  const byTurn = new Map<string, ChatMessage[]>();
  for (const m of t.messages) {
    let group = byTurn.get(m.turnId);
    if (!group) byTurn.set(m.turnId, (group = []));
    if (!order.includes(m.turnId)) order.push(m.turnId);
    group.push(m);
  }
  const end = turnId === undefined ? order.length - 1 : order.indexOf(turnId);
  if (end < 0) return null;
  const parts = order
    .slice(0, end + 1)
    .map((id) => sections(turnEntries(byTurn.get(id)!)))
    .filter((s): s is string => s !== null);
  return parts.length === 0 ? null : parts.join("\n\n");
}

// "Copy full transcript" (Conductor's `VOt(turn, "complete")`, index-BGEQ8YjU.js
// ~3,118,000, read on sven m5 max as data): every message of every turn, the
// user's prompts as "## User" and everything else as "## Assistant", with each
// tool call as an indented `    Name: input` line (`NOt`/`DOt`) followed by its
// result as `    ↳ result` (`Npe`), long inputs and results cut to 10 lines or
// 500 characters (`cL`). Thinking is left out, as Conductor's content types have none.

const KEY_FIELDS = ["command", "file_path", "path", "pattern", "url", "description"];
const INLINE_MAX = 80;
const MAX_LINES = 10;
const MAX_CHARS = 500;

/** `cL`: at most 10 lines (then "(N more lines)") or 500 characters (then "(truncated)"). */
function clip(text: string): string {
  const lines = text.split("\n");
  if (lines.length > MAX_LINES) {
    const head = lines.slice(0, MAX_LINES).join("\n");
    return `${head.length > MAX_CHARS ? head.slice(0, MAX_CHARS) : head}\n…\n(${lines.length - MAX_LINES} more lines)`;
  }
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…\n(truncated)` : text;
}

/** `Lpe`: the input's first non-empty key field, else its JSON; null for no input. */
function toolInput(input: unknown): string | null {
  if (input === null || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) return null;
  const record = input as Record<string, unknown>;
  for (const key of KEY_FIELDS) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.trim().replace(/\\"/g, '"');
  }
  return JSON.stringify(input);
}

/** `Npe`: "    ↳ " before the first line of the result, six spaces before the rest. */
function resultLines(content: string): string {
  const [first, ...rest] = clip(content).split("\n");
  return [`    ↳ ${first}`, ...rest.map((l) => `      ${l}`)].join("\n");
}

/** `NOt`: the call (name alone, `name: input`, or `name:` over an 8-space indented block) and its result. */
function toolLines(name: string, input: unknown, result: string | undefined): string {
  const value = toolInput(input);
  const out: string[] = [];
  if (value === null) out.push(`    ${name}`);
  else if (!value.includes("\n") && value.length <= INLINE_MAX) out.push(`    ${name}: ${value}`);
  else out.push(`    ${name}:`, clip(value).split("\n").map((l) => `        ${l}`).join("\n"));
  if (result !== undefined) out.push(resultLines(result));
  return out.join("\n");
}

/** One message in the complete form (`qOt`), or null when nothing in it has text. */
function completeMessage(m: ChatMessage, results: Map<string, string>, used: Set<string>): string | null {
  if (m.role === "system") {
    const text = plainText(m).trim();
    return text ? `[System: ${text}]` : null;
  }
  const out: string[] = [];
  for (const b of m.blocks) {
    if (b.type === "text") {
      if (b.text.trim()) out.push(b.text.trim());
    } else if (b.type === "tool_use") {
      const result = results.get(b.id);
      if (result !== undefined) used.add(b.id);
      out.push(toolLines(b.name, b.input, result));
    } else if (b.type === "tool_result" && !used.has(b.toolUseId)) {
      out.push(resultLines(b.content));
    }
  }
  return out.length === 0 ? null : out.join("\n\n");
}

/**
 * The whole chat in Conductor's complete form ("Copy full transcript"); null
 * when nothing in it has text, which Conductor reports as "No chat content to copy".
 */
export function completeTranscript(t: ChatTranscript): string | null {
  const order: string[] = [];
  const byTurn = new Map<string, ChatMessage[]>();
  for (const m of t.messages) {
    let group = byTurn.get(m.turnId);
    if (!group) byTurn.set(m.turnId, (group = []));
    if (!order.includes(m.turnId)) order.push(m.turnId);
    group.push(m);
  }
  const parts: string[] = [];
  for (const id of order) {
    const messages = byTurn.get(id)!.filter((m) => m.cancelledAt === undefined);
    const own = (m: ChatMessage) => messageOrigin(m).kind === "user" && plainText(m).trim() !== "";
    // A turn counts only with a prompt of the user's own (`KOt` skips a cancelled one).
    if (!messages.some(own)) continue;
    const results = new Map<string, string>();
    for (const m of messages) for (const b of m.blocks) if (b.type === "tool_result") results.set(b.toolUseId, b.content);
    const used = new Set<string>();
    const entries: Entry[] = [];
    for (const m of messages) {
      const speaker: Speaker = own(m) ? "User" : "Assistant";
      const text = speaker === "User" ? plainText(m).trim() : completeMessage(m, results, used);
      if (text) entries.push({ speaker, text });
    }
    const s = sections(entries);
    if (s !== null) parts.push(s);
  }
  return parts.length === 0 ? null : parts.join("\n\n");
}

/**
 * The toast after "Copy concise transcript" (Conductor's chat tab `L`): the
 * tab's title, "chat" when untitled, cut to 20 characters plus "...".
 */
export function copiedTranscriptMessage(kind: string, title: string | null | undefined): string {
  const name = title?.trim() || "chat";
  const shown = name.length > 20 ? `${name.slice(0, 20).trimEnd()}...` : name;
  return `Copied ${kind} transcript of "${shown}"`;
}

/** The attachment's file name: "Transcript of <title>.md", "chat" when untitled. */
export function forkAttachmentName(title: string | null | undefined): string {
  return `Transcript of ${title?.trim() || "chat"}.md`;
}

/**
 * The footer hover's first line (Conductor's `kDo`): "Opus 5.5 via Reason"
 * when the turn's model is one we know, else just the agent's name.
 */
export function turnAgentLabel(model: string | null | undefined, agentName: string): string {
  const label = model ? knownModelLabel(model) : null;
  return label ? `${label} via ${agentName}` : agentName;
}

/**
 * A readable name for a model id, Conductor's own (`opus-5-5`) or the Reason
 * id it runs as (`byok:anthropic:claude-opus-5-5`, `byok:openai-codex:gpt-5.6-sol`);
 * null for a model outside the catalog.
 */
export function knownModelLabel(model: string): string | null {
  const id = model.replace(/^byok:anthropic:claude-/, "").replace(/^byok:openai-codex:/, "");
  // Reason has no 1M-context ids, so `claude-opus-5-5` is the catalog's `opus-5-5-1m` run without it.
  return agentForModel(id) || agentForModel(`${id}-1m`) ? modelLabel(id) : null;
}
