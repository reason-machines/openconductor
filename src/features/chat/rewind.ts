// "Reset chat" for the agent's side. Conductor rewinds the agent with the
// chat: it resumes Claude at the turn's last assistant message
// (`sessions.resume_session_at`) and rolls Codex back
// (evidence/checkpoint/NOTES.md). A Reason Session cannot drop turns or fork
// at a message, so after a reset the chat forgets its Session and the next
// prompt opens a new one that gets the conversation the chat still shows,
// as an attached file. The new Session knows the kept turns and nothing of
// the deleted ones.
// Pure: no Tauri, no React.

import type { ChatTranscript } from "./reducer.ts";
import type { PromptAttachment } from "./reason.ts";
import type { ChatMessage } from "./types.ts";

/** File name the earlier conversation goes to the new Session under. */
export const EARLIER_CONVERSATION = "Earlier conversation.md";

/** Most characters of earlier conversation sent; the oldest messages are left out first. */
export const EARLIER_CONVERSATION_LIMIT = 200_000;

const HEADER =
  "This chat continues an earlier conversation in this workspace. Your previous Session was reset to the end of it, " +
  "so anything after it never happened. Treat it as context: the user's next message is the one to act on.";

/** The last message a reset to `turnId` keeps; null when the turn is unknown. */
export function lastMessageOfTurn(t: ChatTranscript, turnId: string): string | null {
  let id: string | null = null;
  for (const m of t.messages) if (m.turnId === turnId) id = m.id;
  return id;
}

function messageText(m: ChatMessage): string {
  const parts: string[] = [];
  const tools: string[] = [];
  for (const b of m.blocks) {
    if (b.type === "text" && b.text.trim()) parts.push(b.text.trim());
    else if (b.type === "tool_use") tools.push(b.name);
  }
  if (tools.length > 0) parts.push(`(Used tools: ${[...new Set(tools)].join(", ")})`);
  return parts.join("\n\n");
}

/**
 * The conversation a new Session needs to carry on where the chat stands:
 * the user's and the agent's messages, oldest first, without thinking or tool
 * output. Null when there is nothing to carry.
 */
export function earlierConversation(t: ChatTranscript, limit = EARLIER_CONVERSATION_LIMIT): PromptAttachment | null {
  const sections: string[] = [];
  for (const m of t.messages) {
    if (m.role === "system") continue;
    const text = messageText(m);
    if (!text) continue;
    sections.push(`## ${m.role === "user" ? "User" : "Agent"}\n\n${text}`);
  }
  if (!t.messages.some((m) => m.role === "user")) return null;
  let omitted = 0;
  let size = sections.reduce((n, s) => n + s.length + 2, 0);
  while (sections.length > 1 && size > limit) {
    size -= sections.shift()!.length + 2;
    omitted++;
  }
  const note = omitted > 0 ? [`(${omitted} older ${omitted === 1 ? "message is" : "messages are"} left out.)`] : [];
  return { name: EARLIER_CONVERSATION, text: [HEADER, ...note, ...sections].join("\n\n") + "\n" };
}
