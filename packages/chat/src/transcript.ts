import type {
  ContentBlock,
  InboundEvent,
  RawStreamEvent,
  SdkMessage,
  SessionMessageRow,
  TranscriptEvent,
  UserSendEvent,
} from "./protocol";

// ---- Render model ---------------------------------------------------------

export type ToolStatus = "streaming-input" | "running" | "done" | "error" | "cancelled";

export interface ToolCall {
  kind: "tool";
  id: string;
  name: string;
  /** Parsed input; undefined while the input JSON is still streaming. */
  input: unknown;
  /** Raw input JSON accumulated from `input_json_delta` while streaming. */
  inputJson: string;
  status: ToolStatus;
  result?: string;
  /** Activity of a subagent this tool started (blocks whose `parent_tool_use_id` is this tool). */
  children: AssistantBlock[];
}

export interface TextPart {
  kind: "text";
  text: string;
}

export interface ThinkingPart {
  kind: "thinking";
  text: string;
  redacted?: boolean;
}

export type AssistantBlock = TextPart | ThinkingPart | ToolCall;

export interface UserItem {
  kind: "user";
  id: string;
  text: string;
  sentAt?: string;
  cancelled?: boolean;
}

export interface InboundItem {
  kind: "inbound";
  id: string;
  text: string;
  fromSessionId?: string;
  fromLabel?: string;
  apiKeyName?: string;
  receivedAt?: string;
}

export interface AssistantItem {
  kind: "assistant";
  id: string;
  model?: string;
  blocks: AssistantBlock[];
  streaming: boolean;
}

export interface NoticeItem {
  kind: "notice";
  id: string;
  tone: "interrupted" | "error";
  text: string;
}

export type TranscriptItem = UserItem | InboundItem | AssistantItem | NoticeItem;

interface StreamCursor {
  messageId: string;
  /** Position in the container that stream block index 0 maps to. */
  base: number;
}

export interface Transcript {
  items: TranscriptItem[];
  /** Messages the person queued that the agent has not picked up yet. Kept out of `items` so the running turn stays contiguous. */
  queue: UserItem[];
  running: boolean;
  /** Open stream per container: "" is the top level, otherwise the parent tool_use id. */
  streams: Record<string, StreamCursor>;
  /** Counter for synthetic ids (notices). */
  seq: number;
}

export function emptyTranscript(): Transcript {
  return { items: [], queue: [], running: false, streams: {}, seq: 0 };
}

// ---- Block helpers --------------------------------------------------------

function newTool(id: string, name: string, input: unknown, streamingInput: boolean): ToolCall {
  return {
    kind: "tool",
    id,
    name,
    input: streamingInput ? undefined : input,
    inputJson: "",
    status: streamingInput ? "streaming-input" : "running",
    children: [],
  };
}

/** Returns a new block list with tool `id` replaced, searching nested subagent activity; null if absent. */
function replaceTool(blocks: AssistantBlock[], id: string, fn: (t: ToolCall) => ToolCall): AssistantBlock[] | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.kind !== "tool") continue;
    if (b.id === id) {
      const next = blocks.slice();
      next[i] = fn(b);
      return next;
    }
    const nested = replaceTool(b.children, id, fn);
    if (nested) {
      const next = blocks.slice();
      next[i] = { ...b, children: nested };
      return next;
    }
  }
  return null;
}

function updateToolInItems(items: TranscriptItem[], id: string, fn: (t: ToolCall) => ToolCall): TranscriptItem[] | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    if (it.kind !== "assistant") continue;
    const blocks = replaceTool(it.blocks, id, fn);
    if (blocks) {
      const next = items.slice();
      next[i] = { ...it, blocks };
      return next;
    }
  }
  return null;
}

function toolResultText(content: Extract<ContentBlock, { type: "tool_result" }>["content"]): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content
    .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type}]`))
    .join("\n");
}

/**
 * Applies `op` to the block container for (`parent`, `messageId`): the top-level
 * assistant item with that message id (created if missing), or the children of
 * the subagent tool `parent`. Unknown parents are dropped rather than promoted
 * to the top level, so subagent chatter never looks like the main agent.
 */
function withContainer(
  t: Transcript,
  parent: string | null | undefined,
  messageId: string,
  model: string | undefined,
  op: (blocks: AssistantBlock[]) => AssistantBlock[],
): Transcript {
  if (parent) {
    const items = updateToolInItems(t.items, parent, (tool) => ({ ...tool, children: op(tool.children) }));
    return items ? { ...t, items } : t;
  }
  for (let i = t.items.length - 1; i >= 0; i--) {
    const it = t.items[i]!;
    if (it.kind === "assistant" && it.id === messageId) {
      const items = t.items.slice();
      items[i] = { ...it, model: it.model ?? model, blocks: op(it.blocks) };
      return { ...t, items };
    }
  }
  const created: AssistantItem = { kind: "assistant", id: messageId, model, blocks: op([]), streaming: false };
  return { ...t, items: [...t.items, created] };
}

/** Merges a finished SDK block into a container, deduplicating against what streaming already produced. */
function upsertBlock(blocks: AssistantBlock[], block: ContentBlock): AssistantBlock[] {
  switch (block.type) {
    case "tool_use": {
      const replaced = replaceTool(blocks, block.id, (tool) => ({
        ...tool,
        name: block.name,
        input: block.input,
        status: tool.status === "streaming-input" ? "running" : tool.status,
      }));
      return replaced ?? [...blocks, newTool(block.id, block.name, block.input, false)];
    }
    case "text":
    case "thinking": {
      const kind = block.type;
      const text = block.type === "text" ? block.text : block.thinking;
      if (blocks.some((b) => b.kind === kind && b.text === text)) return blocks;
      // A streamed block that was cut short is superseded by the final text.
      const idx = blocks.findIndex((b) => b.kind === kind && b.text.length > 0 && text.startsWith(b.text));
      if (idx >= 0) {
        const next = blocks.slice();
        next[idx] = { kind, text };
        return next;
      }
      if (text.length === 0) return blocks;
      return [...blocks, { kind, text }];
    }
    case "redacted_thinking":
      return [...blocks, { kind: "thinking", text: "", redacted: true }];
    default:
      return blocks;
  }
}

function settleTools(blocks: AssistantBlock[], to: ToolStatus): AssistantBlock[] {
  let changed = false;
  const next = blocks.map((b) => {
    if (b.kind !== "tool") return b;
    const children = settleTools(b.children, to);
    const open = b.status === "running" || b.status === "streaming-input";
    if (!open && children === b.children) return b;
    changed = true;
    return { ...b, status: open ? to : b.status, children };
  });
  return changed ? next : blocks;
}

/** Ends the turn: closes streams and settles unfinished tools. */
function endTurn(t: Transcript, toolStatus: ToolStatus): Transcript {
  const items = t.items.map((it) => {
    if (it.kind !== "assistant") return it;
    const blocks = settleTools(it.blocks, toolStatus);
    if (!it.streaming && blocks === it.blocks) return it;
    return { ...it, streaming: false, blocks };
  });
  return { ...t, items, running: false, streams: {} };
}

function addNotice(t: Transcript, tone: NoticeItem["tone"], text: string): Transcript {
  const seq = t.seq + 1;
  return { ...t, seq, items: [...t.items, { kind: "notice", id: `notice-${seq}`, tone, text }] };
}

// ---- Stream events --------------------------------------------------------

function applyStream(t: Transcript, ev: RawStreamEvent, parent: string | null | undefined): Transcript {
  const key = parent ?? "";
  switch (ev.type) {
    case "message_start": {
      let base = 0;
      const next = withContainer(t, parent, ev.message.id, ev.message.model, (blocks) => {
        base = blocks.length;
        return blocks;
      });
      const items = parent
        ? next.items
        : next.items.map((it) => (it.kind === "assistant" && it.id === ev.message.id ? { ...it, streaming: true } : it));
      return { ...next, items, running: true, streams: { ...next.streams, [key]: { messageId: ev.message.id, base } } };
    }
    case "content_block_start": {
      const cur = t.streams[key];
      if (!cur) return t;
      const cb = ev.content_block;
      const block: AssistantBlock =
        cb.type === "tool_use"
          ? newTool(cb.id, cb.name, undefined, true)
          : cb.type === "text"
            ? { kind: "text", text: cb.text }
            : cb.type === "thinking"
              ? { kind: "thinking", text: cb.thinking }
              : { kind: "thinking", text: "", redacted: true };
      return withContainer(t, parent, cur.messageId, undefined, (blocks) => {
        const next = blocks.slice();
        next[cur.base + ev.index] = block;
        return next;
      });
    }
    case "content_block_delta": {
      const cur = t.streams[key];
      if (!cur) return t;
      const pos = cur.base + ev.index;
      const d = ev.delta;
      return withContainer(t, parent, cur.messageId, undefined, (blocks) => {
        const b = blocks[pos];
        if (!b) return blocks;
        let updated: AssistantBlock = b;
        if (d.type === "text_delta" && b.kind === "text") updated = { ...b, text: b.text + d.text };
        else if (d.type === "thinking_delta" && b.kind === "thinking") updated = { ...b, text: b.text + d.thinking };
        else if (d.type === "input_json_delta" && b.kind === "tool") updated = { ...b, inputJson: b.inputJson + d.partial_json };
        if (updated === b) return blocks;
        const next = blocks.slice();
        next[pos] = updated;
        return next;
      });
    }
    case "content_block_stop": {
      const cur = t.streams[key];
      if (!cur) return t;
      const pos = cur.base + ev.index;
      return withContainer(t, parent, cur.messageId, undefined, (blocks) => {
        const b = blocks[pos];
        if (!b || b.kind !== "tool" || b.status !== "streaming-input") return blocks;
        let input: unknown = b.input;
        try {
          input = b.inputJson ? JSON.parse(b.inputJson) : {};
        } catch {
          input = b.inputJson;
        }
        const next = blocks.slice();
        next[pos] = { ...b, input, status: "running" };
        return next;
      });
    }
    case "message_stop": {
      const cur = t.streams[key];
      if (!cur) return t;
      const { [key]: _closed, ...streams } = t.streams;
      const items = parent
        ? t.items
        : t.items.map((it) => (it.kind === "assistant" && it.id === cur.messageId ? { ...it, streaming: false } : it));
      return { ...t, items, streams };
    }
    default:
      return t;
  }
}

// ---- Reducer --------------------------------------------------------------

function applySdk(t: Transcript, m: SdkMessage): Transcript {
  switch (m.type) {
    case "system":
      return m.subtype === "init" ? { ...t, running: true } : t;
    case "stream_event":
      return applyStream(t, m.event, m.parent_tool_use_id);
    case "assistant": {
      const next = withContainer(t, m.parent_tool_use_id, m.message.id, m.message.model, (blocks) =>
        m.message.content.reduce(upsertBlock, blocks),
      );
      return { ...next, running: true };
    }
    case "user": {
      // The agent echoes user-role messages: tool results, the prompt it gave a
      // subagent, and the text of whatever was injected into its turn (including
      // reports from other sessions). None of those are the person's input; the
      // person's messages come only from Conductor's own log (local/user_send).
      const content = m.message.content;
      if (typeof content === "string") return t;
      let items = t.items;
      for (const block of content) {
        if (block.type !== "tool_result") continue;
        const updated = updateToolInItems(items, block.tool_use_id, (tool) => ({
          ...tool,
          status: block.is_error ? "error" : "done",
          result: toolResultText(block.content),
        }));
        if (updated) items = updated;
      }
      return items === t.items ? t : { ...t, items };
    }
    case "result": {
      const ended = endTurn(t, m.is_error ? "cancelled" : "done");
      if (!m.is_error) return ended;
      return addNotice(ended, "error", m.result?.trim() || `The agent stopped with an error (${m.subtype}).`);
    }
    default:
      return t;
  }
}

function applyUserSend(t: Transcript, e: UserSendEvent): Transcript {
  const item: UserItem = { kind: "user", id: e.id, text: e.text, sentAt: e.sentAt };
  const queue = t.queue.filter((q) => q.id !== e.id);
  if (!e.sentAt) return { ...t, queue: [...queue, item] };
  const idx = t.items.findIndex((it) => it.kind === "user" && it.id === e.id);
  if (idx >= 0) {
    const items = t.items.slice();
    items[idx] = item;
    return { ...t, queue, items };
  }
  return { ...t, queue, items: [...t.items, item], running: true };
}

function applyInbound(t: Transcript, e: InboundEvent): Transcript {
  if (t.items.some((it) => it.kind === "inbound" && it.id === e.id)) return t;
  const { type: _type, ...rest } = e;
  // Deliberately leaves `running` and open streams alone: a report that arrives
  // mid-turn sits between the agent's messages without ending or splitting the turn.
  return { ...t, items: [...t.items, { kind: "inbound", ...rest }] };
}

export function reduceTranscript(t: Transcript, e: TranscriptEvent): Transcript {
  switch (e.type) {
    case "local/user_send":
      return applyUserSend(t, e);
    case "local/inbound":
      return applyInbound(t, e);
    case "local/interrupted":
      return addNotice(endTurn(t, "cancelled"), "interrupted", e.by === "user" ? "Interrupted" : "Interrupted by the system");
    default:
      return applySdk(t, e);
  }
}

// ---- Hydration from session_messages -------------------------------------

function parseSdk(json: string | null | undefined): SdkMessage | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    if (v && typeof v === "object" && typeof (v as { type?: unknown }).type === "string") return v as SdkMessage;
  } catch {
    /* not SDK JSON */
  }
  return null;
}

/**
 * Turns one persisted row into the events it stands for. A `user` row is the
 * person's message only when no other session or API key sent it; agent echoes
 * stored as user rows (tool results, subagent prompts) replay as SDK messages.
 */
export function rowToEvents(row: SessionMessageRow, sessionId: string): TranscriptEvent[] {
  const sdk = parseSdk(row.full_message);
  if (row.role === "user") {
    if (sdk && sdk.type === "user") {
      const c = sdk.message.content;
      const echo = sdk.parent_tool_use_id || (Array.isArray(c) && c.some((b) => b.type === "tool_result"));
      if (echo) return [sdk];
    }
    const text = row.content ?? "";
    const foreignSession = row.sender_session_id && row.sender_session_id !== sessionId;
    if (foreignSession || row.sender_api_key_name) {
      return [
        {
          type: "local/inbound",
          id: row.id,
          text,
          fromSessionId: foreignSession ? (row.sender_session_id ?? undefined) : undefined,
          apiKeyName: row.sender_api_key_name ?? undefined,
          receivedAt: row.sent_at ?? row.created_at,
        },
      ];
    }
    if (row.cancelled_at && !row.sent_at) return [];
    // A row with a queue position and no sent_at is still waiting in the queue.
    const queued = !row.sent_at && row.queue_order != null;
    return [{ type: "local/user_send", id: row.id, text, sentAt: queued ? undefined : (row.sent_at ?? row.created_at) }];
  }
  if (sdk) return [sdk];
  if (row.role === "assistant" && row.content) {
    const fromContent = parseSdk(row.content);
    if (fromContent) return [fromContent];
    return [
      {
        type: "assistant",
        message: { id: row.sdk_message_id ?? row.id, model: row.model ?? undefined, content: [{ type: "text", text: row.content }] },
      },
    ];
  }
  return [];
}

export function fromRows(rows: SessionMessageRow[], sessionId: string): Transcript {
  const ordered = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ka = a.r.sent_at ?? a.r.created_at;
      const kb = b.r.sent_at ?? b.r.created_at;
      return ka < kb ? -1 : ka > kb ? 1 : a.i - b.i;
    });
  let t = emptyTranscript();
  for (const { r } of ordered) for (const e of rowToEvents(r, sessionId)) t = reduceTranscript(t, e);
  // History is settled: whatever was open when it was written is no longer streaming.
  return { ...t, streams: {}, items: t.items.map((it) => (it.kind === "assistant" && it.streaming ? { ...it, streaming: false } : it)) };
}
