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

// "Copy full transcript" (Conductor's `VOt` with "complete", index-BGEQ8YjU.js
// @3,114,679..3,118,900): every message of every turn, not only the last reply.
// Text blocks as they are; a tool call as "    <name>" with its main input
// inline ("    Bash: pnpm test") or as an indented block when it is long or has
// several lines, followed by its result as "    ↳ <result>"; a result whose call
// is not in the turn on its own "↳" line. Long inputs and results keep their
// first 10 lines / 500 characters (`cL`). Thinking is left out, as Conductor does.

/** The input keys Conductor shows for a tool call, in order (`FOt`). */
const TOOL_INPUT_KEYS = ["command", "file_path", "path", "pattern", "url", "description"];
const INLINE_MAX = 80;
const CLIP_LINES = 10;
const CLIP_CHARS = 500;

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** `cL`: the first 10 lines (at most 500 characters) and "(N more lines)", or 500 characters and "(truncated)". */
function clip(text: string): string {
  const lines = text.split("\n");
  if (lines.length > CLIP_LINES) {
    const head = lines.slice(0, CLIP_LINES).join("\n");
    return `${head.length > CLIP_CHARS ? head.slice(0, CLIP_CHARS) : head}\n…\n(${lines.length - CLIP_LINES} more lines)`;
  }
  return text.length > CLIP_CHARS ? `${text.slice(0, CLIP_CHARS)}\n…\n(truncated)` : text;
}

/**
 * A tool call's name and input as the agent's own tool sees them: Claude Code
 * and Reason rows carry `toolName` / `rawInput` beside the row title; Codex rows
 * are the input itself.
 */
function toolCall(name: string, input: unknown): { name: string; input: unknown } {
  if (!isRecord(input)) return { name, input };
  return { name: typeof input.toolName === "string" && input.toolName ? input.toolName : name, input: "rawInput" in input ? input.rawInput : input };
}

/** `Lpe`: the first of the known keys with text, else the whole input as JSON; null when there is none. */
function mainInput(input: unknown): string | null {
  if (!isRecord(input) || Object.keys(input).length === 0) return null;
  for (const k of TOOL_INPUT_KEYS) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) return v.trim().replace(/\\"/g, '"');
  }
  return JSON.stringify(input);
}

/** `Npe`: a result under its call, "    ↳ " then the rest indented to match. */
const resultLines = (content: string): string => {
  const [first, ...rest] = clip(content).split("\n");
  return [`    ↳ ${first}`, ...rest.map((l) => `      ${l}`)].join("\n");
};

/** `NOt`: "    Name", "    Name: value" or "    Name:" with the value indented under it, then the result. */
function toolLines(name: string, input: unknown, result: string | undefined): string {
  const call = toolCall(name, input);
  const value = mainInput(call.input);
  const out: string[] = [];
  if (value === null) out.push(`    ${call.name}`);
  else if (!value.includes("\n") && value.length <= INLINE_MAX) out.push(`    ${call.name}: ${value}`);
  else out.push(`    ${call.name}:`, clip(value).split("\n").map((l) => `        ${l}`).join("\n"));
  if (result !== undefined) out.push(resultLines(result));
  return out.join("\n");
}

/** `qOt`: one message's blocks; results already shown under their call are skipped. */
function completeText(m: ChatMessage, results: Map<string, string>, shown: Set<string>): string | null {
  const out: string[] = [];
  for (const b of m.blocks) {
    if (b.type === "text") {
      if (b.text.trim()) out.push(b.text.trim());
    } else if (b.type === "tool_use") {
      const result = results.get(b.id);
      if (result !== undefined) shown.add(b.id);
      out.push(toolLines(b.name, b.input, result));
    } else if (b.type === "tool_result") {
      if (!shown.has(b.toolUseId)) out.push(resultLines(b.content));
    }
  }
  return out.length === 0 ? null : out.join("\n\n");
}

/** One turn in full (Conductor's `KOt` + `zOt` for "complete"): the prompt, then every other message in order. */
function completeEntries(messages: ChatMessage[]): Entry[] {
  const live = messages.filter((m) => m.cancelledAt === undefined);
  const isPrompt = (m: ChatMessage) => messageOrigin(m).kind === "user" && plainText(m).trim() !== "";
  if (!live.some(isPrompt)) return [];
  const results = new Map<string, string>();
  for (const m of live) for (const b of m.blocks) if (b.type === "tool_result") results.set(b.toolUseId, b.content);
  const shown = new Set<string>();
  const entries: Entry[] = [];
  for (const m of live) {
    if (isPrompt(m)) {
      entries.push({ speaker: "User", text: plainText(m).trim() });
      continue;
    }
    const text = m.role === "system" ? (plainText(m).trim() ? `[System: ${plainText(m).trim()}]` : null) : completeText(m, results, shown);
    if (text !== null) entries.push({ speaker: "Assistant", text });
  }
  return entries;
}

/** The whole chat for "Copy full transcript"; null when nothing in it has text. */
export function fullTranscript(t: ChatTranscript): string | null {
  const order: string[] = [];
  const byTurn = new Map<string, ChatMessage[]>();
  for (const m of t.messages) {
    let group = byTurn.get(m.turnId);
    if (!group) {
      byTurn.set(m.turnId, (group = []));
      order.push(m.turnId);
    }
    group.push(m);
  }
  const parts = order.map((id) => sections(completeEntries(byTurn.get(id)!))).filter((s): s is string => s !== null);
  return parts.length === 0 ? null : parts.join("\n\n");
}

/** The chat tab menu's two copies: "concise" (⌥⌘C) and "complete" (Copy full transcript). */
export type TranscriptKind = "concise" | "complete";

export const transcriptOf = (t: ChatTranscript, kind: TranscriptKind): string | null => (kind === "concise" ? forkTranscript(t) : fullTranscript(t));

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
 * when the chat's model is one we know, else just the agent's name.
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
