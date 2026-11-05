/**
 * Input shapes the transcript model consumes.
 *
 * Two layers feed a chat:
 *
 * 1. The agent runtime stream. Conductor stores agent output in
 *    `session_messages.full_message` next to an `sdk_message_id`
 *    (evidence/sqlite/conductor.schema.sql), so the runtime speaks the
 *    Claude Agent SDK message format. We model the subset the renderer needs.
 * 2. Conductor's own message log. A row in `session_messages` with
 *    `role = 'user'` is only the person's input when it has no foreign
 *    `sender_session_id` / `sender_api_key_name`: other sessions post into a
 *    chat with `conductor message create --session <id>`
 *    (evidence/runtime/conductor-cli-help.txt), and the app labels those as
 *    sent from another session rather than as the user's own message.
 */

// ---- Agent SDK message subset -------------------------------------------

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

export interface RedactedThinkingBlock {
  type: "redacted_thinking";
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content?: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export interface ImageBlock {
  type: "image";
  source?: unknown;
}

export type ContentBlock = TextBlock | ThinkingBlock | RedactedThinkingBlock | ToolUseBlock | ToolResultBlock | ImageBlock;

/** Raw Anthropic streaming events carried inside `stream_event`. */
export type RawStreamEvent =
  | { type: "message_start"; message: { id: string; model?: string } }
  | {
      type: "content_block_start";
      index: number;
      content_block: TextBlock | ThinkingBlock | RedactedThinkingBlock | { type: "tool_use"; id: string; name: string; input?: unknown };
    }
  | {
      type: "content_block_delta";
      index: number;
      delta:
        | { type: "text_delta"; text: string }
        | { type: "thinking_delta"; thinking: string }
        | { type: "input_json_delta"; partial_json: string }
        | { type: "signature_delta"; signature: string };
    }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta?: { stop_reason?: string | null } }
  | { type: "message_stop" };

export type SdkMessage =
  | { type: "system"; subtype: string; session_id?: string; model?: string }
  | {
      type: "assistant";
      uuid?: string;
      message: { id: string; model?: string; content: ContentBlock[] };
      parent_tool_use_id?: string | null;
    }
  | {
      type: "user";
      uuid?: string;
      message: { content: string | ContentBlock[] };
      parent_tool_use_id?: string | null;
    }
  | { type: "stream_event"; event: RawStreamEvent; parent_tool_use_id?: string | null }
  | { type: "result"; subtype: string; is_error?: boolean; result?: string };

// ---- Conductor-layer events -----------------------------------------------

/** The person sent a message from this chat's composer. */
export interface UserSendEvent {
  type: "local/user_send";
  id: string;
  text: string;
  /** ISO time it was handed to the agent; absent while it waits in the queue. */
  sentAt?: string;
}

/**
 * A message posted into this chat by something other than the person:
 * another agent session (`sender_session_id`) or an API key
 * (`sender_api_key_name`). Rendered as an attributed report, never as user input,
 * and it does not end or restart the running turn.
 */
export interface InboundEvent {
  type: "local/inbound";
  id: string;
  text: string;
  fromSessionId?: string;
  fromLabel?: string;
  apiKeyName?: string;
  receivedAt?: string;
}

export interface InterruptEvent {
  type: "local/interrupted";
  by: "user" | "system";
}

export type TranscriptEvent = SdkMessage | UserSendEvent | InboundEvent | InterruptEvent;

// ---- Persisted rows -------------------------------------------------------

/** One row of `session_messages` (column names as in conductor.db). */
export interface SessionMessageRow {
  id: string;
  session_id: string | null;
  role: string | null;
  content: string | null;
  full_message?: string | null;
  created_at: string;
  sent_at?: string | null;
  cancelled_at?: string | null;
  model?: string | null;
  sdk_message_id?: string | null;
  turn_id?: string | null;
  queue_order?: number | null;
  sender_session_id?: string | null;
  sender_api_key_name?: string | null;
}
