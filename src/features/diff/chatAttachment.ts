// parity:diff.discard:data parity:diff.comments-to-chat:data
// Text attachments the diff viewer adds to the chat composer.
//
// Conductor (renderApp, the discard dialog's confirm handler, read with REA on
// sven m5 max as data): after a file is discarded and a chat session is
// active, it uploads a text file named `revert-<path with "/" as "-">.txt` and
// attaches it to that session's composer. The file holds the prompt
// `contextFileReverted`, so the agent learns the user undid that file and
// should leave it alone. The note goes out with the next message the user sends.
//
// Review comments go the same way (Conductor's addReviewCommentToComposer, read
// on sven m5 max; evidence/diff/comments-to-chat.md): one markdown attachment
// per comment, carrying the comment's id so adding it twice keeps one copy.
import { useCallback, useEffect, useState, type MutableRefObject } from "react";

/** A named text file waiting in the composer; it goes out with the next message. */
export interface TextAttachment {
  name: string;
  text: string;
  /** Set for a review comment (Conductor's attachments.comment_id). */
  commentId?: string;
}

/** What the composer accepts from the diff viewer, beside ChatBridge's insert/send. */
export interface ComposerAttach {
  attach(attachment: TextAttachment): void;
}

/** Conductor's revert context note for one discarded file. */
export function revertedNote(path: string): TextAttachment {
  return {
    name: `revert-${path.replace(/\//g, "-")}.txt`,
    text: `The user undid all changes to "${path}". Do not undo this action unless the user asks.`,
  };
}

const sameAttachment = (x: TextAttachment, a: TextAttachment) => (a.commentId !== undefined ? x.commentId === a.commentId : x.commentId === undefined && x.name === a.name);

/**
 * Add an attachment, replacing the same one: a comment by its id, anything
 * else by name (discarding a file twice attaches one note). A comment whose
 * name another attachment already has gets " (2)", " (3)", ... so every chip
 * name stays unique.
 */
export function addAttachment(list: readonly TextAttachment[], a: TextAttachment): TextAttachment[] {
  const rest = list.filter((x) => !sameAttachment(x, a));
  let name = a.name;
  for (let n = 2; a.commentId !== undefined && rest.some((x) => x.name === name); n++) name = `${a.name} (${n})`;
  return [...rest, name === a.name ? a : { ...a, name }];
}

/**
 * Attach to the workspace's own chat even while a review chat is shown:
 * straight into its composer when it is the chat on screen, otherwise queued,
 * the workspace chat shown, and attached once its composer is up.
 */
export function useWorkspaceChatAttach(workspaceId: string, shownChat: MutableRefObject<string>, composer: MutableRefObject<ComposerAttach | null>, showWorkspaceChat: () => void): (a: TextAttachment) => void {
  const [queued, setQueued] = useState<TextAttachment[]>([]);
  useEffect(() => setQueued([]), [workspaceId]);
  useEffect(() => {
    if (queued.length === 0 || shownChat.current !== workspaceId || !composer.current) return;
    for (const a of queued) composer.current.attach(a);
    setQueued([]);
  });
  return useCallback(
    (a: TextAttachment) => {
      if (shownChat.current === workspaceId && composer.current) return composer.current.attach(a);
      setQueued((q) => addAttachment(q, a));
      showWorkspaceChat();
    },
    [workspaceId, shownChat, composer, showWorkspaceChat],
  );
}

/**
 * The message the agent receives: the user's text, then each attachment as a
 * named block, in the order they were attached.
 */
export function withAttachments(message: string, list: readonly TextAttachment[]): string {
  if (list.length === 0) return message;
  const blocks = list.map((a) => `<attachment name="${a.name}">\n${a.text}\n</attachment>`);
  return [message, ...blocks].filter((s) => s.length > 0).join("\n\n");
}
