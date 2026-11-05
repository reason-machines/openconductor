import type { AssistantBlock, AssistantItem, ToolCall, Transcript, TranscriptItem } from "./transcript";

/** The text "Copy message" puts on the clipboard: what the item says, without tool calls or thinking. */
export function messageText(item: TranscriptItem): string {
  switch (item.kind) {
    case "user":
    case "inbound":
    case "notice":
      return item.text;
    case "assistant":
      return item.blocks
        .filter((b): b is Extract<AssistantBlock, { kind: "text" }> => b.kind === "text")
        .map((b) => b.text.trim())
        .filter(Boolean)
        .join("\n\n");
  }
}

/** Index range [start, end) of the turn that contains item `index`; a turn starts at a user message. */
export function turnRange(t: Transcript, index: number): [number, number] {
  let start = index;
  while (start > 0 && t.items[start]!.kind !== "user") start--;
  let end = index + 1;
  while (end < t.items.length && t.items[end]!.kind !== "user") end++;
  return [start, end];
}

/** The last thing the agent said in the turn containing `itemId` ("Copy final message"). */
export function finalMessageText(t: Transcript, itemId: string): string {
  const index = t.items.findIndex((it) => it.id === itemId);
  if (index < 0) return "";
  const [start, end] = turnRange(t, index);
  for (let i = end - 1; i >= start; i--) {
    const it = t.items[i]!;
    if (it.kind !== "assistant") continue;
    const text = messageText(it);
    if (text) return text;
  }
  return "";
}

/**
 * The user message a retry would resend: the last one the person sent, once the
 * agent is no longer working on it. Retrying replaces everything after it.
 */
export function retryTarget(t: Transcript): string | null {
  if (t.running) return null;
  for (let i = t.items.length - 1; i >= 0; i--) {
    const it = t.items[i]!;
    if (it.kind === "user" && !it.cancelled) return it.id;
  }
  return null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** One-line description of a tool call for its collapsed row. */
export function toolSummary(tool: ToolCall): string {
  const input = tool.input && typeof tool.input === "object" ? (tool.input as Record<string, unknown>) : {};
  const preferred = ["command", "file_path", "path", "pattern", "url", "query", "description", "prompt", "notebook_path"];
  for (const key of preferred) {
    const v = str(input[key]);
    if (v) return firstLine(v);
  }
  for (const v of Object.values(input)) {
    const s = str(v);
    if (s) return firstLine(s);
  }
  if (typeof tool.input === "string") return firstLine(tool.input);
  return "";
}

function firstLine(s: string): string {
  const line = s.split("\n", 1)[0] ?? "";
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

function blocksMarkdown(blocks: AssistantBlock[], depth: number): string[] {
  const out: string[] = [];
  const indent = "  ".repeat(depth);
  for (const b of blocks) {
    if (b.kind === "text") out.push(b.text.trim());
    else if (b.kind === "thinking") {
      if (!b.redacted && b.text.trim()) out.push(`> ${b.text.trim().replace(/\n/g, "\n> ")}`);
    } else {
      const summary = toolSummary(b);
      out.push(`${indent}- Tool: ${b.name}${summary ? ` ${summary}` : ""} (${b.status})`);
      if (b.result) out.push("```\n" + b.result.trimEnd() + "\n```");
      out.push(...blocksMarkdown(b.children, depth + 1));
    }
  }
  return out.filter(Boolean);
}

/** Markdown transcript of the chat. `concise` keeps only what people and the agent said. */
export function transcriptToMarkdown(t: Transcript, opts: { concise?: boolean } = {}): string {
  const parts: string[] = [];
  for (const it of t.items) {
    switch (it.kind) {
      case "user":
        parts.push(`## User\n\n${it.text.trim()}`);
        break;
      case "inbound":
        parts.push(`## From ${it.fromLabel ?? it.apiKeyName ?? it.fromSessionId ?? "another session"}\n\n${it.text.trim()}`);
        break;
      case "assistant": {
        const body = opts.concise ? messageText(it) : blocksMarkdown(it.blocks, 0).join("\n\n");
        if (body) parts.push(`## Assistant\n\n${body}`);
        break;
      }
      case "notice":
        parts.push(`_${it.text}_`);
        break;
    }
  }
  return parts.join("\n\n");
}

export function isAssistant(item: TranscriptItem): item is AssistantItem {
  return item.kind === "assistant";
}
