import { composerPrompt, writeComposerDraft } from "./composerDocument.ts";
import { plainText, type ChatMessage } from "./types.ts";
import { parseSentUserContent } from "./userContent.ts";

export function userMessageCopyText(message: ChatMessage): string {
  const original = plainText(message);
  const content = parseSentUserContent(message.userContent);
  const bodyIndex = message.blocks.findIndex((block) => block.type === "text");
  const body = message.blocks[bodyIndex];
  if (!content || body?.type !== "text"
    || composerPrompt(writeComposerDraft(content.parts)).trim() !== body.text) return original;
  const text = content.parts.map((part) => part.kind === "text" ? part.text : `@${part.label}`).join("");
  return plainText({ ...message, blocks: message.blocks.map((block, index) => index === bodyIndex ? { ...body, text } : block) });
}
