// Chat wire format: the TypeScript mirror of `src-tauri/src/chat/model.rs`.
// Field names are camelCase and unions are tagged by `type`, exactly as serde
// writes them; `src-tauri/src/chat/tests.rs` pins the JSON on the Rust side.

export type Role = "user" | "assistant" | "system";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type Block = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  id: string;
  sessionId: string;
  turnId: string;
  role: Role;
  /** RFC 3339 UTC timestamp, millisecond precision. */
  createdAt: string;
  model?: string;
  cancelledAt?: string;
  blocks: Block[];
}

export type TurnStatus = "running" | "completed" | "cancelled" | "failed";

export interface UpsertEvent {
  type: "upsert";
  message: ChatMessage;
}

/** Append `delta` to the text or thinking block at `blockIndex`; `blockIndex === blocks.length` starts a new text block. */
export interface TextDeltaEvent {
  type: "text_delta";
  sessionId: string;
  messageId: string;
  blockIndex: number;
  delta: string;
}

export interface TurnStatusEvent {
  type: "turn_status";
  sessionId: string;
  turnId: string;
  status: TurnStatus;
  error?: string;
}

export type ChatEvent = UpsertEvent | TextDeltaEvent | TurnStatusEvent;

export function eventSessionId(event: ChatEvent): string {
  return event.type === "upsert" ? event.message.sessionId : event.sessionId;
}

/** Concatenated text blocks, as kept in `session_messages.content` (mirrors `ChatMessage::plain_text`). */
export function plainText(message: ChatMessage): string {
  let out = "";
  for (const block of message.blocks) {
    if (block.type !== "text") continue;
    if (out.length > 0 && block.text.length > 0) out += "\n\n";
    out += block.text;
  }
  return out;
}
