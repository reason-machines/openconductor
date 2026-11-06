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
