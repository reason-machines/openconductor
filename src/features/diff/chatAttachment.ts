// parity:diff.discard:data
// Text attachments the diff viewer adds to the chat composer.
//
// Conductor (renderApp, the discard dialog's confirm handler, read with REA on
// sven m5 max as data): after a file is discarded and a chat session is
// active, it uploads a text file named `revert-<path with "/" as "-">.txt` and
// attaches it to that session's composer. The file holds the prompt
// `contextFileReverted`, so the agent learns the user undid that file and
// should leave it alone. The note goes out with the next message the user sends.

/** A named text file waiting in the composer; it goes out with the next message. */
export interface TextAttachment {
  name: string;
  text: string;
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

/** Add an attachment, replacing one with the same name (discarding a file twice attaches one note). */
export function addAttachment(list: readonly TextAttachment[], a: TextAttachment): TextAttachment[] {
  return [...list.filter((x) => x.name !== a.name), a];
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
