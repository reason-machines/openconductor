// "Copy concise transcript" (⌘⌥C) and "Copy full transcript" in a chat tab's
// right-click menu. Conductor 0.87.6 builds both with `VOt(turn, mode)`
// (index-BGEQ8YjU.js, read with REA as data):
// - concise is the fork transcript (fork.ts: last reply with text per turn,
//   "[N messages elided]", "[N tool calls elided]");
// - complete keeps every user and assistant message in time order, each text
//   block, and each tool call as "    <Tool>" / "    <Tool>: <input>" / an
//   indented block, with its result under it as "    ↳ <first line>" (`NOt`,
//   `DOt`, `Npe`). Long bodies stop after 10 lines or 500 characters (`cL`).
// Consecutive messages of one speaker share a "## Speaker" section; turns are
// joined by a blank line. Pure: no Tauri, no React.

import type { ChatTranscript } from "./reducer.ts";
import type { ChatMessage, ToolResultBlock } from "./types.ts";
import { messageOrigin } from "./types.ts";
import { forkTranscript } from "./fork.ts";

export type TranscriptMode = "concise" | "complete";

const MAX_LINES = 10; // `cM`
const MAX_CHARS = 500; // `hb`
const INLINE_MAX = 80; // `Fpe`
const INPUT_KEYS = ["command", "file_path", "path", "pattern", "url", "description"]; // `FOt`

/** `cL`: at most 10 lines and 500 characters, with Conductor's truncation notes. */
export function clip(text: string): string {
  const lines = text.split("\n");
  if (lines.length > MAX_LINES) {
    const head = lines.slice(0, MAX_LINES).join("\n");
    return `${head.length > MAX_CHARS ? head.slice(0, MAX_CHARS) : head}\n…\n(${lines.length - MAX_LINES} more lines)`;
  }
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…\n(truncated)` : text;
}

/** `Lpe`: a tool input's headline value, else its JSON; null for an empty input. */
function inputText(input: unknown): string | null {
  if (input === null || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) return null;
  for (const k of INPUT_KEYS) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) return v.trim().replace(/\\"/g, '"');
  }
  return JSON.stringify(input);
}

/** `Npe`: a tool result under its call. */
function resultLines(r: ToolResultBlock): string {
  const lines = (r.content ? clip(r.content) : "completed").split("\n");
  return [`    ↳ ${lines[0]}`, ...lines.slice(1).map((l) => `      ${l}`)].join("\n");
}

/** `NOt` + `DOt`: a tool call line (or block) and its result. */
function toolCall(name: string, input: unknown, result: ToolResultBlock | undefined): string {
  const v = inputText(input);
  const out: string[] = [];
  if (v === null) out.push(`    ${name}`);
  else if (!v.includes("\n") && v.length <= INLINE_MAX) out.push(`    ${name}: ${v}`);
  else {
    out.push(`    ${name}:`);
    out.push(clip(v).split("\n").map((l) => `        ${l}`).join("\n"));
  }
  if (result) out.push(resultLines(result));
  return out.join("\n");
}

/** `qOt`: a message's text, tool calls and unpaired results. */
function messageText(m: ChatMessage, results: Map<string, ToolResultBlock>, used: Set<string>): string | null {
  const out: string[] = [];
  for (const b of m.blocks) {
    if (b.type === "text") {
      const t = b.text.trim();
      if (t) out.push(t);
    } else if (b.type === "tool_use") {
      const r = results.get(b.id);
      if (r) used.add(b.id);
      out.push(toolCall(b.name, b.input, r));
    } else if (b.type === "tool_result") {
      if (!used.has(b.toolUseId)) out.push(resultLines(b));
    }
  }
  return out.length === 0 ? null : out.join("\n\n");
}

function completeTurn(messages: ChatMessage[]): string | null {
  const own = messages.filter((m) => m.cancelledAt === undefined);
  if (!own.some((m) => messageOrigin(m).kind === "user")) return null;
  const results = new Map<string, ToolResultBlock>();
  for (const m of own) for (const b of m.blocks) if (b.type === "tool_result") results.set(b.toolUseId, b);
  const used = new Set<string>();
  const entries: { speaker: "User" | "Assistant"; text: string }[] = [];
  for (const m of [...own].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (m.role === "system") continue;
    // A message holding only results of tool calls already shown adds nothing.
    const text = messageText(m, results, used);
    if (text === null) continue;
    entries.push({ speaker: m.role === "user" && !m.blocks.every((b) => b.type === "tool_result") ? "User" : "Assistant", text });
  }
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

/** The chat as Markdown in Conductor's concise or complete form; null when there is nothing to copy. */
export function transcriptText(t: ChatTranscript, mode: TranscriptMode): string | null {
  if (mode === "concise") return forkTranscript(t);
  const order: string[] = [];
  const byTurn = new Map<string, ChatMessage[]>();
  for (const m of t.messages) {
    let g = byTurn.get(m.turnId);
    if (!g) {
      byTurn.set(m.turnId, (g = []));
      order.push(m.turnId);
    }
    g.push(m);
  }
  const parts = order.map((id) => completeTurn(byTurn.get(id)!)).filter((s): s is string => s !== null);
  return parts.length === 0 ? null : parts.join("\n\n");
}

/** Conductor's toast after a copy: `Copied <mode> transcript of "<title, 20 chars>"`. */
export function copiedTranscriptToast(mode: TranscriptMode, title: string): string {
  const name = title.trim() || "chat";
  const short = name.length > 20 ? `${name.slice(0, 20).trimEnd()}...` : name;
  return `Copied ${mode} transcript of "${short}"`;
}
